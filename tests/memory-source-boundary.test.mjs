import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup,buildContext} from '../frontend/local-service.js';
import {sourceMessages,validateEvidence} from '../frontend/memory-evidence.js';
import {recallPlan} from '../frontend/memory-core.js';
import {deliverWorldShare} from '../frontend/proactive-messages.js';

const stamp='2026-10-31T01:00:00Z';
async function fixture(){
  const initial=emptyData();
  initial.characters=['a','b'].map(id=>({id,name:id,identity:'合成人物',style:'',avatar:''}));
  initial.sessions=[
    {id:'story-a',character_id:'a',mode:'story',created_at:stamp},
    {id:'online-a',character_id:'a',created_at:stamp},
    {id:'online-b',character_id:'b',mode:'online',created_at:stamp},
  ];
  for(const [id,sid,text] of [[1,'online-a','蓝色兰花'],[3,'story-a','独立剧情秘密'],[5,'online-b','另一个人的秘密'],[7,'online-a','尚未读到的消息'],[9,'online-a','已撤销轮次']]){
    initial.messages.push({id,session_id:sid,role:'user',content:text,created_at:stamp},
      {id:id+1,session_id:sid,role:'assistant',content:'合成回复',created_at:stamp});
    initial.turns.push({request_id:'r'+id,session_id:sid,user_id:id,assistant_id:id+1,state:id===7?'cancelled':'complete',...(id===9?{deleted_at:stamp}:{})});
  }
  const store={value:initial,fail:false,async load(){return structuredClone(this.value);},async save(data){if(this.fail)throw Error('disk full');this.value=structuredClone(data);},async getKey(){return '';},async hasKey(){return false;}};
  const calls=[];
  const service=await new LocalService(store,async(s,k,m,delta)=>{
    calls.push(m);
    delta(m[0].content.includes('当天发生')?JSON.stringify({summary:'用户说了蓝色兰花'}):JSON.stringify({memories:[{title:'兰花',content:'用户说蓝色兰花',kind:'statement',evidence:[{message_id:1,quote:'蓝色兰花'}]}]}));
  }).init();
  await service.api('/settings','PATCH',{model:'fixture'});
  return {service,store,calls};
}

test('main sources, extraction, daily summary and context use the same completed main timeline',async()=>{
  const {service:s,calls}=await fixture();
  assert.deepEqual(sourceMessages(s.data,'a').map(m=>m.id),[1,2]);
  assert.deepEqual((await s.api('/memory-sources?owner=a')).map(m=>m.id),[1,2]);
  assert.deepEqual(s.memoryModule.pending('a').map(m=>m.id),[1,2]);
  await s.api('/memories/extract','POST',{owner_id:'a'});
  await s.api('/summaries/generate','POST',{owner_id:'a',day:'2026-10-31'});
  for(const messages of calls){
    assert.match(messages[1].content,/蓝色兰花/);
    assert.doesNotMatch(messages[1].content,/独立剧情秘密|另一个人的秘密|尚未读到|已撤销轮次/);
  }
  assert.equal(s.data.memory.watermarks.a,2);
  const context=buildContext(s.data,'online-a','继续');
  assert.doesNotMatch(JSON.stringify(context),/独立剧情秘密|另一个人的秘密|尚未读到|已撤销轮次/);
  assert.equal(s.data.messages.length,10);
});

test('story, foreign and incomplete evidence cannot enter main memory or move its watermark',async()=>{
  const {service:s,store}=await fixture();
  for(const message_id of [3,5,7,9]){
    const quote=s.data.messages.find(m=>m.id===message_id).content;
    await assert.rejects(s.api('/memories','POST',{owner_id:'a',title:'不合法来源',content:quote,kind:'experience',evidence:[{message_id,quote}]}),/来源/);
  }
  assert.equal(s.data.memory.events.length,0);
  assert.deepEqual(s.data.memory.watermarks,{});
  assert.equal(store.value.memory.events.length,0);
  const story=s.data.messages.find(m=>m.id===3);
  assert.throws(()=>validateEvidence(s.data,'a',[{message_id:3,quote:story.content}],undefined,new Map([[3,story]])),/来源/);
});

test('invalid story evidence cannot reenter recall by direct ranking or a memory link',async()=>{
  const {service:s}=await fixture();
  await s.api('/memories','POST',{owner_id:'a',title:'兰花',content:'蓝色兰花',kind:'statement',evidence:[{message_id:1,quote:'蓝色兰花'}]});
  const main=s.data.memory.events[0];
  s.data.memory.events.push({...structuredClone(main),id:'isolated',content:'蓝色兰花与独立剧情秘密',evidence:[{message_id:3,quote:'独立剧情秘密'}]});
  s.data.memory.links.push({id:'edge',owner_id:'a',type:'supplements',from:{kind:'memory',id:main.id},to:{kind:'memory',id:'isolated'},from_revision:main.revision,to_revision:0,note:''});
  const plan=recallPlan(s.data,'a','蓝色兰花',{sessionId:'online-a'});
  assert.deepEqual(plan.records.map(r=>r.id),[main.id]);
  assert.equal(plan.trace.excluded.invalid_evidence,1);
  assert.equal(plan.links.length,0);
});

test('story cannot use normal context/stream endpoints or trigger recall transport',async()=>{
  const {service:s,calls}=await fixture();
  const before=JSON.stringify(s.data),count=calls.length;
  await assert.rejects(s.api('/memory-sources/3/location?owner=a'),/来源/);
  await assert.rejects(s.api('/contacts/story-a/context-preview','POST',{message:'test'}),/独立剧情/);
  await assert.rejects(s.stream('story-a','test','story-request',()=>{}),/独立剧情/);
  assert.equal(calls.length,count);
  assert.equal(JSON.stringify(s.data),before);
  s.data.memory.settings.recall=false;
  assert.throws(()=>recallPlan(s.data,'a','test',{sessionId:'story-a'}),/独立剧情/);
  await assert.rejects(s.api('/memory-sources?owner=a&source_type=unsupported'),/来源类型/);
});

test('contacts and proactive delivery select online sessions even when a story comes first',async()=>{
  const {service:s}=await fixture();
  assert.equal((await s.api('/contacts','POST',{character_id:'a'})).id,'online-a');
  assert.deepEqual((await s.api('/contacts')).map(c=>c.id).sort(),['online-a','online-b']);
  await s.api('/world/setup','POST',{character_ids:['a','b']});
  const event=await s.api('/world/commands','POST',{request_id:'wait-a',type:'advance',actor_id:'a'});
  const messageId=await s.transact(data=>deliverWorldShare(data,'a',event.id,event.content,'',stamp));
  assert.equal(s.data.messages.find(m=>m.id===messageId).session_id,'online-a');
});

test('world source compatibility route and unified source route share knowledge filtering',async()=>{
  const {service:s}=await fixture();
  await s.api('/world/setup','POST',{character_ids:['a','b']});
  const event=await s.api('/world/commands','POST',{request_id:'wait-a',type:'advance',actor_id:'a'});
  const canonical=await s.api('/memory-sources?owner=a&source_type=world_event');
  assert.deepEqual(await s.api('/world/sources?owner=a'),canonical);
  assert.ok(canonical.some(e=>e.event_id===event.id));
  assert.deepEqual(await s.api('/memory-sources?owner=b&source_type=world_event'),[]);
});

test('legacy backup roundtrip and failed writes preserve the accepted main memory',async()=>{
  const {service:s,store}=await fixture();
  const value={owner_id:'a',title:'兰花',content:'蓝色兰花',kind:'statement',evidence:[{message_id:1,quote:'蓝色兰花'}]};
  store.fail=true;
  await assert.rejects(s.api('/memories','POST',value),/disk full/);
  assert.equal(s.data.memory.events.length,0);
  store.fail=false;
  await s.api('/memories','POST',value);
  const backup=await s.api('/backup');
  assert.equal(backup.version,2);
  assert.equal(validateBackup(backup).memory.events.length,1);
  assert.equal(backup.sessions.find(c=>c.id==='online-a').mode,undefined);
  const restored=await new LocalService(store,async()=>{}).init();
  assert.equal(restored.data.memory.events[0].content,'蓝色兰花');
});
