import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {copy} from '../frontend/memory-core.js';
import {removeSourceMemories} from '../frontend/memory-source-deletion.js';
import {memoryRooms} from '../frontend/memory-rooms.js';

async function fixture(){
 const store={value:emptyData(),fail:false,async load(){return copy(this.value);},async save(v){if(this.fail)throw Error('disk full');this.value=copy(v);},async hasKey(){return false;}};
 let result={summary:'用户提到散步。'},during=async()=>{};const calls=[];
 const service=await new LocalService(store,async(s,k,m,delta)=>{calls.push(m);await during();delta(JSON.stringify(result));}).init();
 const a=await service.api('/characters','POST',{name:'甲',identity:'',style:'',avatar:''}),b=await service.api('/characters','POST',{name:'乙',identity:'',style:'',avatar:''});
 const chat=await service.api('/contacts','POST',{character_id:a.id});await service.api('/settings','PATCH',{model:'mock',timezone:'Asia/Shanghai'});
 await service.stream(chat.id,'我想散步','seed',()=>{});
 await service.transact(d=>{for(const m of d.messages)m.created_at='2026-01-31T16:30:00Z';});calls.length=0;
 const event={owner_id:a.id,title:'散步',content:'用户说想散步',kind:'statement',evidence:[{message_id:1,quote:'我想散步'}]};
 const daily=()=>service.api('/summaries/generate','POST',{owner_id:a.id,day:'2026-02-01'});
 const monthly=()=>service.api('/monthly-summaries/generate','POST',{owner_id:a.id,month:'2026-02'});
 const read=()=>service.api('/monthly-summaries?owner='+a.id+'&month=2026-02');
 return {service,store,a,b,chat,event,calls,daily,monthly,read,set:v=>result=v,during:fn=>during=fn};
}
test('legacy room is a read projection; seven rooms share one evidence-backed store',async()=>{
 const f=await fixture(),{service:s,a,b,event}=f;await s.api('/memories','POST',event);
 await s.transact(d=>{delete d.memory.events[0].room;});
 const before=copy(s.data.memory.events[0]);assert.equal((await s.api('/memories?owner='+a.id))[0].room,'living_room');assert.deepEqual(s.data.memory.events[0],before);
 const rooms=await s.api('/memories/rooms?owner='+a.id);assert.equal(rooms.length,7);assert.equal(rooms[0].count,1);assert.equal((await s.api('/memories/rooms?owner='+b.id)).reduce((n,r)=>n+r.count,0),0);
 for(const room of memoryRooms){await s.api('/memories/'+before.id,'PATCH',{...event,room:room.id});assert.equal((await s.api('/memories?owner='+a.id+'&room='+room.id)).length,1);}
 await s.api('/memories/'+before.id,'PATCH',event);assert.equal(s.data.memory.events[0].room,'windowsill');
 await s.api('/memories/'+before.id,'PATCH',{active:false});assert.equal((await s.api('/memories/rooms?owner='+a.id)).at(-1).active_count,0);
 await assert.rejects(s.api('/memories?owner='+a.id+'&room=wrong'),/房间/);
 await assert.rejects(s.api('/memories/'+before.id,'PATCH',{...event,room:null}),/房间/);
 const bad=await s.api('/backup');bad.memory.events[0].room='wrong';assert.throws(()=>validateBackup(bad),/房间/);
});
test('AI classification rejects the entire invalid batch and does not advance progress',async()=>{
 const f=await fixture(),{service:s,a,event}=f;
 f.set({memories:[{...event,room:'user_room'},{...event,title:'错误分类',room:'wrong'}]});
 await assert.rejects(s.api('/memories/extract','POST',{owner_id:a.id}),/房间/);assert.deepEqual(s.data.memory.watermarks,{});assert.equal(s.data.memory.events.length,0);
 f.set({memories:[{...event,room:'user_room'}]});await s.api('/memories/extract','POST',{owner_id:a.id});assert.equal(s.data.memory.events[0].room,'user_room');assert.equal(s.data.memory.watermarks[a.id],2);
});
test('monthly refinement uses only own daily summaries in local month and preserves original evidence',async()=>{
 const f=await fixture(),{service:s,a,b}=f;
 await assert.rejects(f.monthly(),/每日总结/);assert.equal(f.calls.length,0);
 await assert.rejects(s.api('/monthly-summaries/generate','GET',{}),/POST/);
 await f.daily();f.set({summary:'本月用户谈到散步。'});const card=await f.monthly();
 assert.deepEqual(card.source_ids,[1,2]);assert.equal(card.summary_refs.length,1);assert.equal(card.summary_refs[0].revision,1);assert.equal(card.month,'2026-02');
 const input=JSON.parse(f.calls.at(-1)[1].content);assert.equal(input.days.length,1);assert.equal(input.days[0].content,'用户提到散步。');assert.equal(input.days[0].day,'2026-02-01');assert.ok(!JSON.stringify(input).includes('我想散步'));
 assert.equal((await s.api('/monthly-summaries?owner='+b.id)).length,0);
 await assert.rejects(s.api('/monthly-summaries/generate','POST',{owner_id:a.id,month:'2026-01'}),/每日总结/);
 for(const month of ['2026-00','2026-13','2026-2','bad'])await assert.rejects(s.api('/monthly-summaries?owner='+a.id+'&month='+month),/月份/);
 assert.equal((await f.read())[0].stale,false);validateBackup(await s.api('/backup'));
});
test('daily edits, additions and deletion mark monthly review stale without overwriting it',async()=>{
 const f=await fixture(),{service:s,a}=f;await f.daily();await f.monthly();
 await s.api('/summaries','PATCH',{owner_id:a.id,day:'2026-02-01',content:'人工校对的日总结'});assert.equal((await f.read())[0].stale,true);
 await s.api('/monthly-summaries','PATCH',{owner_id:a.id,month:'2026-02',content:'人工月度回顾'});assert.equal((await f.read())[0].stale,true);
 await f.monthly();const revised=(await f.read())[0];assert.equal(revised.stale,false);assert.equal(revised.versions.at(-1).content,'人工月度回顾');
 await s.transact(d=>{
  d.messages.push({id:3,session_id:f.chat.id,role:'user',content:'另一天',created_at:'2026-02-02T01:00:00Z'},{id:4,session_id:f.chat.id,role:'assistant',content:'合成回答',created_at:'2026-02-02T01:00:00Z'});
  d.turns.push({request_id:'another-day',session_id:f.chat.id,user_id:3,assistant_id:4,state:'complete'});
  d.memory.summaries.push({...d.memory.summaries[0],id:'another-day',day:'2026-02-02',source_ids:[3,4],versions:[]});
 });assert.equal((await f.read())[0].stale,true);
 await s.api('/summaries','DELETE',{owner_id:a.id,day:'2026-02-02'});assert.equal((await f.read())[0].stale,false);
 await s.api('/summaries','DELETE',{owner_id:a.id,day:'2026-02-01'});assert.equal((await f.read())[0].stale,true);validateBackup(await s.api('/backup'));
 await s.api('/monthly-summaries','DELETE',{owner_id:a.id,month:'2026-02'});assert.equal((await f.read()).length,0);assert.equal(s.data.messages.length,4);
});
test('daily rewrite also protects a concurrent manual revision',async()=>{
 const f=await fixture();await f.daily();
 f.during(()=>f.service.transact(d=>{d.memory.summaries[0].content='期间校对日总结';d.memory.summaries[0].revision++;}));
 await assert.rejects(f.daily(),/每日总结已被修改/);assert.equal(f.service.data.memory.summaries[0].content,'期间校对日总结');
});
test('monthly generation rejects concurrent daily changes and keeps the existing card',async()=>{
 const f=await fixture(),{service:s,a}=f;await f.daily();await f.monthly();const before=copy(s.data.memory.monthly_summaries);
 // Simulate another durable writer; the same UI/service already serializes model actions.
 f.during(()=>s.transact(d=>{d.memory.summaries[0].content='生成过程中修改';d.memory.summaries[0].revision++;}));
 await assert.rejects(f.monthly(),/材料已变化/);assert.deepEqual(s.data.memory.monthly_summaries,before);
});
test('monthly generation protects concurrent manual edits, raw source changes and save failures',async()=>{
 const f=await fixture(),{service:s,a}=f;await f.daily();await f.monthly();
 f.during(()=>s.transact(d=>{d.memory.monthly_summaries[0].content='期间人工编辑';d.memory.monthly_summaries[0].revision++;}));
 await assert.rejects(f.monthly(),/已被修改/);assert.equal((await f.read())[0].content,'期间人工编辑');
 const before=copy(s.data.memory.monthly_summaries);f.during(()=>s.transact(d=>{d.messages[0].content+='，又改了';}));
 await assert.rejects(f.monthly(),/材料已变化/);assert.deepEqual(s.data.memory.monthly_summaries,before);
 f.during(async()=>{});f.store.fail=true;await assert.rejects(f.monthly(),/disk full/);assert.deepEqual(s.data.memory.monthly_summaries,before);
});
test('oversized monthly material is rejected before a paid model could be called; no truncation',async()=>{
 const f=await fixture();await f.daily();await f.service.transact(d=>{
  const original=d.memory.summaries[0];d.memory.summaries=[];
  for(let day=1;day<=13;day++){
   const date='2026-02-'+String(day).padStart(2,'0'),uid=day*2+1,aid=uid+1;
   d.messages.push({id:uid,session_id:f.chat.id,role:'user',content:'合成材料',created_at:date+'T01:00:00Z'},{id:aid,session_id:f.chat.id,role:'assistant',content:'合成回答',created_at:date+'T01:00:00Z'});
   d.turns.push({request_id:'bulk-'+day,session_id:f.chat.id,user_id:uid,assistant_id:aid,state:'complete'});
   d.memory.summaries.push({...original,id:'bulk-'+day,day:date,content:'甲'.repeat(9500),source_ids:[uid,aid]});
  }
 });const calls=f.calls.length;await assert.rejects(f.monthly(),/材料过多/);assert.equal(f.calls.length,calls);
});
test('backup and restart preserve room, daily/monthly revisions and old versions; malformed provenance rejected',async()=>{
 const f=await fixture(),{service:s,a,b,event}=f;await s.api('/memories','POST',{...event,room:'attic'});await f.daily();await f.monthly();await f.monthly();
 const backup=await s.api('/backup');validateBackup(copy(backup));const restored=await new LocalService(f.store,async()=>{}).init();assert.deepEqual(await restored.api('/backup'),backup);
 for(const mutate of [d=>d.memory.monthly_summaries[0].source_ids=[999],d=>d.memory.monthly_summaries[0].revision=-1,d=>d.memory.monthly_summaries[0].month='2026-13',d=>d.memory.monthly_summaries[0].summary_refs[0].revision=-1,d=>d.memory.summaries[0].owner_id=b.id]){const bad=copy(backup);mutate(bad);assert.throws(()=>validateBackup(bad));}
 for(let i=0;i<12;i++)await s.api('/monthly-summaries','PATCH',{owner_id:a.id,month:'2026-02',content:'编辑'+i});assert.equal((await f.read())[0].versions.length,10);
 const originalMessages=copy(s.data.messages);await s.transact(d=>removeSourceMemories(d,[1],[]));assert.equal(s.data.memory.monthly_summaries.length,0);assert.equal(s.data.memory.summaries.length,0);assert.deepEqual(s.data.messages,originalMessages);
});
