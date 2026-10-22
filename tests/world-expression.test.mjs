import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {copy,worldSource,validateWorld,appendWorldEvent} from '../frontend/world-core.js';
import {atlasMeta,lookFor,selectSkin} from '../frontend/character-looks.js';
import {presentationLines,presentationText} from '../frontend/scene-presentation.js';
import {ensureLife,beginLifeRun,nextLifeJob,reserveLifeRequest,recordLifeResponse,applyLifeResponse,lifeTime,lifePrompt} from '../frontend/resident-life-core.js';
import {sourceMessages,dayKey} from '../frontend/memory-evidence.js';
import {deliverWorldShare} from '../frontend/proactive-messages.js';
const image='data:image/png;base64,AAAA',skin=(id,allowed=true)=>({id,name:id,skin:2,portrait:0,portraits:[{name:'笑',image,emotion:'happy'}],sprite:{image,frames:3,row_count:4,rows:{down:0,right:1,up:2,left:3},idle_frame:1,walk_order:[1,0,1,2]},ai_allowed:allowed,actions:{plant:{image,frames:4,row_count:1}}});
async function fixture(){
 let saved=emptyData(),answer='收到。',failure=false,calls=0,interrupted=false;
 const persistence={load:async()=>copy(saved),save:async d=>{if(failure)throw Error('synthetic disk failure');saved=copy(d);},hasKey:async()=>false};
 const transport=async(s,k,m,delta)=>{calls++;delta(answer);if(interrupted)throw Error('synthetic interrupted');};
 const s=await new LocalService(persistence,transport).init();await s.transact(d=>d.characters.push({id:'a',name:'林',identity:'甲私有身份',style:'',avatar:''},{id:'b',name:'雨',identity:'乙私有身份',style:'',avatar:''}));await s.api('/settings','PATCH',{model:'mock'});await s.api('/world/setup','POST',{character_ids:['a','b']});const scene=await s.api('/world/dialogue','POST',{character_id:'a'});
 return {s,scene,answer:v=>answer=v,fail:v=>failure=v,interrupt:()=>interrupted=true,calls:()=>calls,restart:()=>new LocalService(persistence,transport).init()};
}
test('skin, direction, middle idle and action atlases remain character-owned and survive backup',async()=>{
 const {s,restart}=await fixture();const before=copy(s.data.characters);
 await s.api('/character-looks/a','PATCH',{skins:[skin('night')],active_skin_id:'night',auto_skin:true});assert.equal(lookFor(s.data,'a').skin_id,'night');assert.equal(lookFor(s.data,'b').skin_id,'default');assert.equal(atlasMeta(lookFor(s.data,'a').sprite).rows.left,3);assert.equal(atlasMeta(lookFor(s.data,'a').sprite).idle,1);
 assert.deepEqual((await restart()).data.character_looks,s.data.character_looks);assert.deepEqual(validateBackup(await s.api('/backup')).character_looks,s.data.character_looks);assert.deepEqual(s.data.characters,before);
 await assert.rejects(s.api('/character-looks/a','PATCH',{skins:[{...skin('bad'),sprite:{...skin('bad').sprite,idle_frame:3}}]}),/帧/);
 await assert.rejects(s.api('/character-looks/a','PATCH',{skins:[{...skin('bad'),actions:{unknown:{image,frames:4}}}]}),/分类/);
});
test('same reply selects only allowed own skin, carries presentation snapshot, and retries once',async()=>{
 const f=await fixture(),{s,scene}=f;await s.api('/character-looks/a','PATCH',{skins:[skin('night')],auto_skin:true});f.answer('[情绪:happy]今晚穿这套。\n[换装:night]');await s.stream(scene.id,'你好','dress',()=>{});
 assert.equal(lookFor(s.data,'a').skin_id,'night');assert.equal(s.data.turns[0].presentation.skin_id,'night');assert.ok(s.data.world.events.some(e=>e.source.type==='scene_action'&&e.source.command.type==='change_skin'));validateWorld(s.data);
 const n=s.data.world.events.length;await s.stream(scene.id,'你好','dress',()=>{});assert.equal(f.calls(),1);assert.equal(s.data.world.events.length,n);assert.doesNotMatch(s.data.world.events.find(e=>e.source.type==='completed_dialogue').content,/换装|情绪/);
 await s.stream(scene.id,'再换相同的吗','dress_again',()=>{});assert.match(s.data.turns[1].skin_error,/已经使用/);assert.equal(s.data.world.events.filter(e=>e.source.command?.type==='change_skin').length,1);
 const preview=await s.api('/contacts/'+scene.id+'/context-preview','POST',{message:'你好'});assert.match(preview.messages[0].content,/night/);assert.doesNotMatch(preview.messages[0].content,/base64|乙私有身份/);
});
test('disabled, foreign or unapproved skins and interrupted replies cannot change appearance',async()=>{
 for(const mode of ['disabled','foreign','unapproved','interrupted']){
  const f=await fixture(),{s,scene}=f;await s.api('/character-looks/a','PATCH',{skins:mode==='foreign'?[]:[skin('night',mode!=='unapproved')],auto_skin:mode!=='disabled'});f.answer('[换装:night]');if(mode==='interrupted')f.interrupt();
  try{await s.stream(scene.id,'换吗','denied',()=>{});}catch{}
  assert.equal(lookFor(s.data,'a').skin_id,'default',mode);assert.equal(s.data.world.events.filter(e=>e.source.command?.type==='change_skin').length,0);
 }
 const f=await fixture();assert.throws(()=>selectSkin(f.s.data,'user','default',true),/获准/);
});
test('headless resident can choose an authorized skin through the same reducer and request budget',async()=>{
 const {s}=await fixture();await s.api('/character-looks/a','PATCH',{skins:[skin('night')],auto_skin:true});
 await s.transact(d=>{const t=lifeTime(d);ensureLife(d).settings={...d.world.life.settings,enabled:true,quiet_start:0,quiet_end:0,max_actions:1};beginLifeRun(d,'skin_batch',t);const j=nextLifeJob(d,'skin_batch',t),prompt=lifePrompt(d,j);assert.match(JSON.stringify(prompt),/night/);assert.doesNotMatch(JSON.stringify(prompt),/乙私有身份|base64/);reserveLifeRequest(d,j.id,t,prompt);recordLifeResponse(d,j.id,{actor_id:'a',type:'change_skin',skin_id:'night'},t);applyLifeResponse(d,j.id,t);applyLifeResponse(d,j.id,t);assert.equal(d.world.life.daily.requests,1);});
 assert.equal(lookFor(s.data,'a').skin_id,'night');assert.equal(s.data.world.events.filter(e=>e.source.command?.type==='change_skin').length,1);
});
test('global archive includes resident exchange and all scene speakers, filters without granting knowledge',async()=>{
 const {s,scene}=await fixture();await s.stream(scene.id,'紫色兰花','first',()=>{});await s.transact(d=>appendWorldEvent(d.world,{request_id:'npc_speech',type:'say'},'雨对林说：一起看雨。',d.world.positions.b,['b','a'],['b','a'].map(owner_id=>({owner_id,kind:'heard',position:d.world.positions[owner_id]})),{type:'resident_dialogue',speaker_id:'b',recipient_id:'a',conversation_id:'c',turn:1}));
 const knowledge=copy(s.data.world.events.map(e=>e.observations));assert.equal((await s.api('/world-history')).items.length,2);assert.equal((await s.api('/world-history?q=兰花')).items.length,1);assert.equal((await s.api('/world-history?owner=b')).items.length,1);assert.deepEqual(s.data.world.events.map(e=>e.observations),knowledge);
 const npc=s.data.world.events.find(e=>e.source.type==='resident_dialogue');
 await s.api('/memories','POST',{owner_id:'b',title:'看雨',content:'林收到了邀请',kind:'experience',evidence:[{source_type:'world_event',event_id:npc.id,quote:'一起看雨'}]});
 assert.equal((await s.api('/world-history/event_'+npc.id,'DELETE')).memories,1);assert.equal((await s.api('/world-history')).items.length,1);assert.equal((await s.api('/world-history?owner=b')).items.length,0);assert.throws(()=>worldSource(s.data,npc.id,'b'),/知情/);assert.equal((await s.api('/world-history/event_'+npc.id,'DELETE')).already_deleted,true);
});
test('deletion removes direct/versions memory, summaries, shares and recall while preserving unrelated facts and stable IDs',async()=>{
 const f=await fixture(),{s,scene}=f;await s.stream(scene.id,'紫色兰花','erase',()=>{});const t=s.data.turns[0],event=s.data.world.events.find(e=>e.source.type==='completed_dialogue');
 await s.api('/memories','POST',{owner_id:'a',title:'花',content:'记得紫色兰花',kind:'statement',evidence:[{source_type:'world_event',event_id:event.id,quote:'紫色兰花'}]});
 await s.api('/memories','POST',{owner_id:'a',title:'聊天来源',content:'旧聊天同样有依据',kind:'statement',evidence:[{message_id:t.user_id,quote:'紫色兰花'}]});
 const [one,two]=s.data.memory.events;await s.api('/memory-links','POST',{owner_id:'a',from:{kind:'memory',id:one.id},to:{kind:'memory',id:two.id},type:'supplements',note:'合成关联'});
 const share=await s.transact(d=>{d.memory.summaries.push({id:'sum',owner_id:'a',day:dayKey(d.messages[0].created_at),content:'兰花总结',source_ids:[t.user_id],versions:[]});return deliverWorldShare(d,'a',event.id,'紫色兰花','个人理解',new Date().toISOString());});
 await s.api('/memories','POST',{owner_id:'a',title:'分享的来源',content:'分享中提到花',kind:'statement',evidence:[{message_id:share,quote:'紫色兰花'}]});
 await s.transact(d=>{const l=ensureLife(d);l.jobs.push({id:'stale_result',owner_id:'a',kind:'action',state:'responded',run_id:'stale_run',prompt:[{role:'user',content:JSON.stringify({observed_events:[{id:event.id,content:event.content}]})}],result:{plan:'旧的候选'}});l.runs.push({id:'stale_run',state:'running',queue:[]});});
 const ids=copy(s.data.messages.map(m=>m.id));const unrelated=await s.api('/world/commands','POST',{request_id:'stay',type:'advance'});
 await s.api('/memories/'+one.id,'PATCH',{owner_id:'a',title:'改过的卡片',content:'停留经历',kind:'experience',evidence:[{source_type:'world_event',event_id:unrelated.id,quote:'停留'}]});
 const r=await s.api('/world-history/turn_erase','DELETE');assert.equal(r.memories,3);assert.equal(r.summaries,1);assert.equal(s.data.memory.events.length,0);assert.equal(s.data.memory.links.length,0);assert.equal(s.data.memory.summaries.length,0);assert.deepEqual(s.data.messages.map(m=>m.id),ids);assert.ok(s.data.world.events.find(e=>e.id===unrelated.id&&!e.deleted_at));assert.equal(sourceMessages(s.data,'a').length,0);assert.throws(()=>worldSource(s.data,event.id,'a'),/知情/);
 assert.deepEqual((await s.api('/world-history')).items,[]);assert.deepEqual((await s.api('/contacts/'+scene.id+'/messages')).items,[]);assert.doesNotMatch(JSON.stringify((await s.api('/contacts/'+scene.id+'/context-preview','POST',{message:'花'})).messages),/紫色兰花/);
 await assert.rejects(s.stream(scene.id,'紫色兰花','erase',()=>{}),/已删除/);assert.equal(f.calls(),1);assert.equal((await s.api('/world-history/turn_erase','DELETE')).already_deleted,true);assert.deepEqual((await f.restart()).data.world,s.data.world);validateBackup(await s.api('/backup'));
 assert.equal(s.memoryModule.pending('a').length,0);assert.equal(s.data.world.life.jobs[0].state,'skipped');assert.equal(s.data.world.life.jobs[0].prompt,undefined);assert.equal(s.data.world.life.jobs[0].result,undefined);
});
test('failed deletion save retains both dialogue and memory; queued active requests refuse deletion',async()=>{
 const f=await fixture(),{s,scene}=f;await s.stream(scene.id,'别丢','atomic',()=>{});const e=s.data.world.events[0];await s.api('/memories','POST',{owner_id:'a',title:'留存',content:'别丢',kind:'statement',evidence:[{source_type:'world_event',event_id:e.id,quote:'别丢'}]});
 const before=copy(s.data);f.fail(true);await assert.rejects(s.api('/world-history/turn_atomic','DELETE'),/disk/);f.fail(false);assert.deepEqual(s.data,before);
 s.active=new AbortController();await assert.rejects(s.api('/world-history/turn_atomic','DELETE'),/等待/);s.active=null;
});
test('presentation tags leave literal code examples intact and do not execute unknown controls',()=>{
 assert.equal(presentationText('[情绪:happy]你好\n[换装:night]'),'你好');assert.deepEqual(presentationLines('```\n[换装:night]\n```').skins,[]);
 assert.equal(atlasMeta({frames:3,idle_frame:1}).order.join(','),'1,0,1,2');
});
