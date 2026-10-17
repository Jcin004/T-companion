import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup,buildContext} from '../frontend/local-service.js';
import {recallPlan,memoryContext} from '../frontend/memory-core.js';
import {DiagnosticStore} from '../frontend/diagnostics.js';

const copy=value=>structuredClone(value);
async function fixture(){
  const store={value:emptyData(),saves:0,keyReads:0,async load(){return copy(this.value);},async save(v){this.saves++;this.value=copy(v);},async hasKey(){return true;},async getKey(){this.keyReads++;return 'fixture-only-key';}};
  const logDisk={value:null,async load(){return this.value;},async save(v){this.value=copy(v);}};
  const logs=await new DiagnosticStore(logDisk).init(),sent=[];
  const service=await new LocalService(store,async(s,k,m,delta)=>{sent.push(copy(m));delta('收到');},logs).init();
  const a=await service.api('/characters','POST',{name:'林',identity:'重视诚实',style:'简短',avatar:''});
  const b=await service.api('/characters','POST',{name:'雨',identity:'另一个人',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:a.id});await service.api('/settings','PATCH',{model:'fixture'});
  const events=[];
  for(const [index,word]of ['orchid','parcel','museum'].entries()){
    await service.stream(chat.id,word,'seed-'+index,()=>{});
    await service.api('/memories','POST',{owner_id:a.id,title:word,content:'用户提过 '+word,kind:'statement',evidence:[{message_id:index*2+1,quote:word}],participants:[a.id,b.id]});
    events.push((await service.api('/memories?owner='+a.id))[0]);
  }
  const link=async(from,to,type='causes',kind='memory')=>{await service.api('/memory-links','POST',{owner_id:a.id,from:{kind:'memory',id:from.id},to:{kind,id:to.id},type,note:'人工关联解读'});return (await service.api('/memory-links?owner='+a.id)).find(l=>l.from.id===from.id&&l.to.id===to.id&&l.type===type);};
  const plan=(query,options={})=>recallPlan(service.data,a.id,query,{sessionId:chat.id,...options});
  return {service,store,logs,sent,a,b,chat,events,link,plan};
}

test('reviewed links add one-hop material with source quotes and original direction, never a second hop',async()=>{
  const {service,store,events:[one,two,three],link,plan}=await fixture();
  const first=await link(one,two);await link(two,three);const before=copy(service.data),saves=store.saves;
  const p=plan('orchid');assert.deepEqual(p.records.map(r=>r.id),[one.id,two.id]);
  assert.equal(p.records[1].recall.reason,'link');assert.equal(p.records[1].evidence[0].quote,'parcel');
  assert.deepEqual(p.links[0].from,{kind:'memory',id:one.id});assert.equal(p.links[0].id,first.id);
  assert.ok(!p.records.some(r=>r.id===three.id));
  const reverse=plan('parcel');assert.ok(reverse.records.some(r=>r.id===one.id));
  assert.deepEqual(reverse.links.find(l=>l.id===first.id).from,{kind:'memory',id:one.id});
  assert.deepEqual(service.data,before);assert.equal(store.saves,saves);
});

test('ambiguous followups use bounded completed user cues from this conversation; zero history disables cues',async()=>{
  const {service,chat,events:[one,two,three],plan}=await fixture();
  await service.api('/memory-settings','PATCH',{use_links:false,context_messages:2});
  const p=plan('那件事后来怎么样了');assert.equal(p.trace.query_mode,'recent_context');assert.deepEqual(p.trace.context_message_ids,[5,3]);
  assert.ok(p.records.some(r=>r.id===three.id));assert.ok(p.records.some(r=>r.id===two.id));assert.ok(!p.records.some(r=>r.id===one.id));
  const earlier=plan('那件事后来怎么样了',{beforeMessageId:3});assert.deepEqual(earlier.trace.context_message_ids,[1]);
  await service.api('/contacts/'+chat.id,'PATCH',{history_limit:0});assert.equal(plan('那件事后来怎么样了').records.length,0);
  assert.equal(plan('orchid').records[0].id,one.id);
  assert.equal(plan('再见').trace.context_message_ids.length,0);
});

test('owner and session isolation applies to lexical search, recent cues and relationships',async()=>{
  const {service,a,b,chat,events:[one,two],link,plan}=await fixture();await link(one,two);
  const foreign=await service.api('/contacts','POST',{character_id:b.id});await service.stream(foreign.id,'private-orchid','foreign',()=>{});
  await service.api('/memories','POST',{owner_id:b.id,title:'orchid',content:'foreign-owner-private',kind:'statement',evidence:[{message_id:7,quote:'private-orchid'}]});
  const p=plan('orchid');assert.ok(!JSON.stringify(p).includes('foreign-owner-private'));
  assert.equal(recallPlan(service.data,b.id,'parcel',{sessionId:foreign.id}).records.length,0);
  assert.throws(()=>recallPlan(service.data,a.id,'orchid',{sessionId:foreign.id}),/不属于/);
  assert.ok(!plan('那件事').trace.context_message_ids.includes(7));
  // Legacy/imported separate conversations of one character still cannot contribute cues.
  await service.transact(d=>{const separate={...d.sessions.find(s=>s.id===chat.id),id:'other-conversation'};d.sessions.push(separate);});
  await service.stream('other-conversation','orchid','same-owner-other',()=>{});
  assert.ok(!plan('那件事').trace.context_message_ids.includes(9));
});

test('manual fresh anchors and their supporting memories participate without rewriting the roster',async()=>{
  const {service,a,events:[one],link,plan}=await fixture();
  await service.api('/self','POST',{owner_id:a.id,label:'诚实',interpretation:'愿意如实表达',quote:'重视诚实'});const [anchor]=await service.api('/self?owner='+a.id);
  await link(one,anchor,'supports','anchor');const roster=copy(service.data.characters);
  const p=plan('orchid');assert.equal(p.anchors[0].id,anchor.id);assert.equal(p.links[0].type,'supports');
  const self=plan('你重视什么原则');assert.equal(self.anchors[0].id,anchor.id);assert.ok(self.records.some(r=>r.id===one.id));
  assert.match(memoryContext(self),/可校正解读/);assert.deepEqual(service.data.characters,roster);
  await service.api('/memory-settings','PATCH',{use_anchors:false});assert.equal(plan('orchid').anchors.length,0);
});

test('stale, unconfirmed or paused endpoints are excluded immediately; re-review restores expansion',async()=>{
  const {service,a,events:[one,two],link,plan}=await fixture();const edge=await link(one,two);
  await service.api('/memories/'+two.id,'PATCH',{...two,content:'用户提过 parcel（修订）'});
  assert.equal(plan('orchid').records.length,1);assert.equal(plan('orchid').trace.excluded.stale_link,1);
  await service.api('/memory-links/'+edge.id,'PATCH',{owner_id:a.id,from:edge.from,to:edge.to,type:edge.type,note:'重新复核'});
  assert.equal(plan('orchid').records.length,2);
  await service.api('/memories/'+two.id,'PATCH',{...two,active:false});assert.equal(plan('orchid').records.length,1);
  await service.api('/self','POST',{owner_id:a.id,label:'诚实',interpretation:'如实表达',quote:'重视诚实'});const [anchor]=await service.api('/self?owner='+a.id);
  const support=await link(one,anchor,'supports','anchor');
  await service.transact(d=>{d.memory.anchors.find(n=>n.id===anchor.id).origin='ai';});assert.equal(plan('orchid').anchors.length,0);
  await service.api('/self/'+anchor.id,'PATCH',{label:'诚实',interpretation:'人工确认',quote:'重视诚实'});assert.equal(plan('orchid').anchors.length,0);
  await service.api('/memory-links/'+support.id,'PATCH',{owner_id:a.id,from:support.from,to:support.to,type:'supports',note:'确认新解读'});assert.equal(plan('orchid').anchors.length,1);
  const c=await service.api('/characters/'+a.id);await service.api('/characters/'+a.id,'PATCH',{...c,identity:'重视诚实，也喜欢音乐'});
  assert.equal(plan('orchid').anchors.length,0);assert.equal(plan('orchid').trace.excluded.stale_anchor,1);
});

test('contradictions stay explicit, cycles terminate, and budget/count limits include anchors and links',async()=>{
  const {service,a,events:[one,two],link,plan}=await fixture();await link(one,two,'contradicts');await link(two,one,'supplements');
  let p=plan('orchid');assert.equal(p.records.length,2);assert.equal(p.links.length,2);assert.equal(p.records[0].has_conflicting_evidence,true);
  assert.ok(p.links.some(l=>l.from.id===one.id&&l.to.id===two.id&&l.type==='contradicts'));
  await service.api('/memory-settings','PATCH',{recall_limit:1});p=plan('orchid');assert.equal(p.records.length,1);assert.equal(p.records[0].has_conflicting_evidence,true);assert.equal(p.links.length,0);
  await service.api('/memory-settings','PATCH',{recall_limit:4,budget:500});p=plan('orchid');
  assert.ok(p.trace.used_chars<=500);assert.ok(JSON.stringify({records:p.records,anchors:p.anchors,links:p.links}).length<=500);
  assert.ok(p.trace.candidates.some(c=>c.status==='budget'));
  await service.api('/memory-settings','PATCH',{use_links:false,budget:4000});assert.equal(plan('orchid').records.length,1);
  await service.api('/memory-settings','PATCH',{recall:false});p=plan('orchid');assert.equal(memoryContext(p),'');assert.equal(p.trace.disabled,true);
});

test('preview and actual request share the recall receipt; reads do not access keys, models, writes or drafts',async()=>{
  const {service,store,sent,logs,chat,events:[one,two],link}=await fixture();await link(one,two);
  await service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'保留草稿'});
  const before=copy(service.data),saves=store.saves,keyReads=store.keyReads,calls=sent.length;
  const preview=await service.api('/contacts/'+chat.id+'/context-preview','POST',{message:'orchid'});
  assert.deepEqual(service.data,before);assert.equal(store.saves,saves);assert.equal(store.keyReads,keyReads);assert.equal(sent.length,calls);
  assert.ok(preview.recall.candidates.some(c=>c.id===two.id&&c.status==='selected'));
  await service.stream(chat.id,'orchid','actual',()=>{});assert.deepEqual(sent.at(-1),preview.messages);
  const entry=logs.state.entries.at(-1);assert.deepEqual(entry.recall_trace,preview.recall);assert.deepEqual(entry.recalled_link_ids,preview.messages[0].content.includes('causes')?[service.data.memory.links[0].id]:[]);
  assert.ok(!JSON.stringify(entry.recall_trace).includes('保留草稿'));assert.ok(!JSON.stringify(entry.recall_trace).includes('fixture-only-key'));
  logs.capture(false);await service.stream(chat.id,'orchid','capture-off',()=>{});assert.equal(logs.state.entries.at(-1).messages,undefined);
  assert.ok(!JSON.stringify(logs.state.entries.at(-1).recall_trace).includes('用户提过'));
});

test('old backups gain additive switches, reject invalid settings atomically and retain all original nodes',async()=>{
  const {service,store,plan}=await fixture();const backup=await service.api('/backup');
  for(const key of ['context_messages','use_links','use_anchors'])delete backup.memory.settings[key];
  const restored=validateBackup(backup);assert.equal(restored.memory.settings.context_messages,2);assert.equal(restored.memory.settings.use_links,true);assert.deepEqual(restored.memory.events,backup.memory.events);
  for(const value of [{context_messages:5},{context_messages:1.2},{use_links:'yes'},{use_anchors:null}]){
    const before=copy(store.value);await assert.rejects(service.api('/memory-settings','PATCH',value));assert.deepEqual(store.value,before);
  }
  const malformed=copy(service.data);malformed.messages[0].content='changed source';
  const broken=recallPlan(malformed,service.data.characters[0].id,'orchid');assert.equal(broken.records.length,0);assert.equal(broken.trace.excluded.invalid_evidence,1);
});
