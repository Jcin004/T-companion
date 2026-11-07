import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {ensureLife,beginLifeRun,nextLifeJob,reserveLifeRequest,lifePrompt,recordLifeResponse,applyLifeResponse,resumeLifeRun,lifeTime,advanceResidentRules,acceptResidentPlan,wakeResident,deferLifeRun} from '../frontend/resident-life-core.js';
import {worldSource} from '../frontend/world-core.js';
import {phoneSnapshot,readCharacterPhone,sendCharacterMessage} from '../frontend/world-communication.js';
const at='2026-11-07T01:00:00.000Z',time={iso:at,day:'2026-11-07',hour:9};
const plan=(location='warm-room',activity='rest',duration=30)=>({title:'读书与休息',steps:[{location_id:location,activity,duration_minutes:duration}]});
async function fixture(){
 let disk=emptyData(),fail=false;const requests=[];
 const store={load:async()=>structuredClone(disk),save:async d=>{if(fail)throw Error('disk full');disk=structuredClone(d);},hasKey:async()=>false};
 const s=await new LocalService(store,async(settings,key,m,delta)=>{
  requests.push(m);const p=JSON.parse(m[1].content),kind=m[0].content.match(/任务：(\w+)/)?.[1];
  delta(JSON.stringify(kind==='plan'?{actor_id:p.actor_id,plan:plan()}:kind==='decision'?{actor_id:p.actor_id,messages:[],situation:'继续眼前的事。'}:kind==='memory'?{memories:[]}:{share:false}));
 }).init();
 await s.transact(d=>{d.characters=['a','b','c'].map((id,i)=>({id,name:['林','雨','岚'][i],identity:id+'的私有身份',style:'',avatar:''}));});
 await s.api('/world/setup','POST',{character_ids:['a','b']});await s.api('/settings','PATCH',{model:'mock'});
 await s.api('/world-life/settings','POST',{enabled:true,quiet_start:0,quiet_end:0,auto_memory:false,share:false});
 await s.transact(d=>{ensureLife(d).simulated_at=at;});
 return {s,requests,fail:v=>{fail=v;},restart:()=>new LocalService(store,s.transport).init()};
}
function reply(d,job,value){const prompt=lifePrompt(d,job);reserveLifeRequest(d,job.id,time,prompt);recordLifeResponse(d,job.id,value,time);return applyLifeResponse(d,job.id,time);}
function seed(d){for(const owner of d.world.residents)acceptResidentPlan(d,owner,plan(),owner,at);}
test('v1 world and old two residents survive; third is explicit and three locations are independent',async()=>{
 const {s}=await fixture(),before=structuredClone(s.data.world.positions);await s.api('/world/setup','POST',{character_ids:['a','b','c']});assert.equal(s.data.world.residents.length,3);assert.deepEqual(s.data.world.positions.a,before.a);
 const b=structuredClone(s.data.world.positions.b);await s.api('/world/commands','POST',{request_id:'travel-a',actor_id:'a',type:'travel',location_id:'courtyard'});
 assert.equal(s.data.world.positions.a.location_id,'courtyard');assert.deepEqual(s.data.world.positions.b,b);
 const original=structuredClone(s.data.world);await s.api('/world?location=common-room');assert.deepEqual(s.data.world,original);
 const backup=await s.api('/backup');assert.deepEqual(validateBackup(backup).world,backup.world);
 const legacy=structuredClone(backup);legacy.world.version=1;delete legacy.world.locations;assert.equal(validateBackup(legacy).world.version,2);
});
test('accepted A-Life schedules advance with zero model calls, deterministic chunks and restart',async()=>{
 const {s,requests}=await fixture();await s.api('/world/setup','POST',{character_ids:['a','b','c']});const d=structuredClone(s.data);
 for(const owner of d.world.residents)acceptResidentPlan(d,owner,{title:'日常',steps:[{location_id:'courtyard',activity:'walk',duration_minutes:30},{location_id:'common-room',activity:'rest',duration_minutes:60}]},owner,at);
 const one=structuredClone(d),many=structuredClone(d),target='2026-11-07T04:00:00.000Z';advanceResidentRules(one,target,target);
 for(const stamp of ['2026-11-07T02:00:00.000Z','2026-11-07T03:00:00.000Z',target])advanceResidentRules(many,stamp,target);
 assert.deepEqual(one.world.positions,many.world.positions);assert.deepEqual(one.world.life.schedules,many.world.life.schedules);assert.deepEqual(one.world.events,many.world.events);assert.equal(requests.length,0);
 const before=structuredClone(one.world);advanceResidentRules(one,target,target);assert.deepEqual(one.world,before);
 assert.ok(one.world.events.some(e=>e.source.command?.type==='travel'));assert.ok(one.world.events.some(e=>e.content.includes('完成了')));
});
test('quiet time and exhausted model budget do not stop rule time; long gaps keep a resumable cursor',async()=>{
 const {s}=await fixture(),d=s.data;seed(d);const l=ensureLife(d);l.settings.daily_requests=0;l.settings.quiet_start=0;l.settings.quiet_end=23;
 beginLifeRun(d,'rules-only',{...time,iso:'2026-11-10T01:00:00.000Z',day:'2026-11-10'});
 assert.equal(l.catching_up,true);assert.equal(l.simulated_at,'2026-11-08T01:00:00.000Z');assert.equal(nextLifeJob(d,'rules-only',time),null);assert.equal(l.daily.requests,0);
 advanceResidentRules(d,'2026-11-10T01:00:00.000Z');assert.equal(l.simulated_at,'2026-11-09T01:00:00.000Z');
 advanceResidentRules(d,'2026-11-10T01:00:00.000Z');assert.equal(l.catching_up,false);
});
test('original SullyOS DM is canonical; observer does not mark read or grant third-party knowledge',async()=>{
 const {s}=await fixture(),d=s.data;seed(d);wakeResident(d,'a','encounter','test-encounter');beginLifeRun(d,'social',time);const j=nextLifeJob(d,'social',time);
 reply(d,j,{actor_id:'a',messages:[{to_id:'b',text:'书架旁有一本紫色封面的书。'}]});
 const event=d.world.events.find(e=>e.source.type==='world_message');assert.ok(event);assert.doesNotMatch(event.content,/紫色/);assert.match(worldSource(d,event.id,'a').content,/紫色/);
 const before=structuredClone(d);assert.match(phoneSnapshot(d,'b').threads[0].messages[0].text,/紫色/);assert.deepEqual(d,before);
 assert.throws(()=>worldSource(d,event.id,'b'),/知情/);assert.throws(()=>worldSource(d,event.id,'c'),/知情/);
 readCharacterPhone(d,'b',at);assert.match(worldSource(d,event.id,'b').content,/紫色/);assert.throws(()=>worldSource(d,event.id,'c'),/知情/);
 const k=nextLifeJob(d,'social',time);assert.equal(k.owner_id,'b');assert.match(lifePrompt(d,k)[1].content,/紫色/);assert.doesNotMatch(lifePrompt(d,k)[1].content,/a的私有身份/);
 assert.equal(d.messages.length,0);assert.equal(d.turns.length,0);
});
test('user message may be unread and receive no reply; backup and memory exclude unread content',async()=>{
 const {s,requests}=await fixture();seed(s.data);const contact=await s.api('/contacts','POST',{character_id:'a'});
 await s.stream(contact.id,'我想问一本红色的书。','user-inbox',()=>{});assert.equal(requests.length,0);assert.equal(s.data.messages.length,1);assert.equal(s.data.messages[0].read_at,undefined);assert.equal(s.data.turns[0].assistant_id,null);
 assert.deepEqual(validateBackup(await s.api('/backup')).messages,s.data.messages);
 await assert.rejects(s.api('/world-phone/a','POST',{text:'伪造代发'}),/只允许观察/);
 const d=s.data;beginLifeRun(d,'read-user',time);const j=nextLifeJob(d,'read-user',time);assert.equal(j.owner_id,'a');assert.ok(d.messages[0].read_at);
 reply(d,j,{actor_id:'a',messages:[],situation:'正在休息，稍后再说。'});assert.equal(d.messages.length,1);assert.equal(d.world.life.situations.a.text,'正在休息，稍后再说。');
 wakeResident(d,'a','test','later-user-reply');const later=nextLifeJob(d,'read-user',time);reply(d,later,{actor_id:'a',messages:[{to_id:'user',text:'我现在看到了，待会儿一起找找。'}]});assert.equal(d.turns.length,1);assert.equal(d.messages.length,2);assert.doesNotThrow(()=>validateBackup(structuredClone(d)));assert.equal(phoneSnapshot(d,'a').threads.find(t=>t.id==='online_a').messages.length,2);
});
test('uncertain requests never repeat or refund; full candidates survive failed save and resume',async()=>{
 const {s}=await fixture(),d=s.data;beginLifeRun(d,'recover',time);const j=nextLifeJob(d,'recover',time);reserveLifeRequest(d,j.id,time,lifePrompt(d,j));
 assert.throws(()=>reserveLifeRequest(d,j.id,time,[]),/再次发送/);assert.throws(()=>resumeLifeRun(d,'recover',time),/计费/);assert.equal(ensureLife(d).daily.requests,1);resumeLifeRun(d,'recover',time,true);assert.equal(d.world.life.jobs[0].state,'skipped');
 const f=await fixture();await f.s.api('/world-life/settings','POST',{max_requests:1});const save=f.s.storage.save.bind(f.s.storage);let once=true;
 f.s.storage.save=async data=>{if(once&&data.world.life.jobs.some(j=>j.state==='applied')){once=false;throw Error('disk full at apply');}return save(data);};
 await assert.rejects(f.s.api('/world-life/run','POST',{request_id:'apply-failure'}),/disk full/);assert.equal(f.s.data.world.life.jobs[0].state,'responded');const count=f.requests.length;
 f.s.storage.save=save;await f.s.api('/world-life/resume','POST',{run_id:'apply-failure'});assert.equal(f.requests.length,count);assert.ok(f.s.data.world.life.schedules.a);
});
test('model wait does not own transaction; changed world rejects stale candidate without action',async()=>{
 const {s}=await fixture(),d=s.data;beginLifeRun(d,'stale',time);const j=nextLifeJob(d,'stale',time);reserveLifeRequest(d,j.id,time,lifePrompt(d,j));
 await s.api('/world/commands','POST',{request_id:'user-step',type:'advance'});const current=s.data,job=current.world.life.jobs[0];recordLifeResponse(current,job.id,{actor_id:'a',plan:plan()},time);applyLifeResponse(current,job.id,time);
 assert.equal(job.state,'stale');assert.equal(current.world.life.schedules.a,undefined);
});
test('exclusive furniture occupancy blocks rather than overwrites; observing has no side effects',async()=>{
 const {s}=await fixture(),d=s.data;acceptResidentPlan(d,'a',plan('warm-room','read',60),'read-a',at);acceptResidentPlan(d,'b',plan('warm-room','read',60),'read-b',at);
 advanceResidentRules(d,at,at);assert.equal(d.world.life.resources['warm-room:desk'],'a');assert.equal(d.world.life.schedules.b.state,'blocked');assert.equal(d.world.life.activities.b.phase,'blocked');
 const before=structuredClone(d.world);phoneSnapshot(d,'a');assert.deepEqual(d.world,before);
});
test('canonical SullyOS history survives cap, retries, same-name routing and deletion restore',async()=>{
 const {s}=await fixture();await s.api('/world/setup','POST',{character_ids:['a','b','c']});const d=s.data;for(const c of d.characters)c.name='同名';
 for(let i=0;i<125;i++)sendCharacterMessage(d,{request_id:'archive_'+i,actor_id:'a',to_id:'c',text:'消息 '+i,at});
 const phone=phoneSnapshot(d,'c'),thread=phone.threads.find(t=>t.kind==='dm');assert.deepEqual(thread.memberIds,['a','c']);assert.equal(thread.messages.length,125);
 const last=sendCharacterMessage(d,{request_id:'archive_124',actor_id:'a',to_id:'c',text:'消息 124',at});assert.equal(last.message_id,thread.messages[124].id);assert.equal(phoneSnapshot(d,'b').threads.flatMap(t=>t.messages).length,0);
 assert.doesNotThrow(()=>validateBackup(structuredClone(d)));
 const bad=structuredClone(d);bad.world.communication.read.b={[thread.messages[0].id]:at};assert.throws(()=>validateBackup(bad),/已读来源/);
});
test('manual plan receipts are stable and candidate preparation rejects a changed world before charging',async()=>{
 const {s}=await fixture(),d=s.data;const first=acceptResidentPlan(d,'a',plan(),'manual-stable',at);acceptResidentPlan(d,'a',plan('courtyard'),'replacement',at);
 assert.deepEqual(acceptResidentPlan(d,'a',plan(),'manual-stable',at),first);assert.equal(d.world.life.schedules.a.id,'replacement');
 beginLifeRun(d,'prepare-stale',time);const j=nextLifeJob(d,'prepare-stale',time);d.world.tick++;
 assert.throws(()=>reserveLifeRequest(d,j.id,time,lifePrompt(d,j)),/请求前/);assert.equal(d.world.life.daily.requests,0);
});
test('nearby speech has independent listeners; interruption releases furniture and waits for a new decision',async()=>{
 const {s}=await fixture(),d=s.data;seed(d);d.world.positions.b={x:5,y:6};wakeResident(d,'a','encounter','speak');beginLifeRun(d,'speech',time);const j=nextLifeJob(d,'speech',time);
 reply(d,j,{actor_id:'a',messages:[],say:{to_id:'b',text:'这本书很有意思。'}});const e=d.world.events.find(e=>e.source.type==='resident_dialogue');assert.match(worldSource(d,e.id,'b').content,/有意思/);assert.throws(()=>worldSource(d,e.id,'c'),/知情/);
 const {s:other}=await fixture(),x=other.data;acceptResidentPlan(x,'a',plan('warm-room','read',30),'interrupted-read',at);advanceResidentRules(x,at,at);x.world.positions.a={x:5,y:9,location_id:'courtyard'};
 advanceResidentRules(x,'2026-11-07T02:00:00.000Z');assert.equal(x.world.life.schedules.a.state,'blocked');assert.equal(x.world.life.resources['warm-room:desk'],undefined);assert.ok(x.world.life.wakeups.some(w=>w.reason==='interrupted'));
});
test('a full day without any user turn has rule activities and independently authored private messages',async()=>{
 const {s,requests}=await fixture();await s.api('/world/setup','POST',{character_ids:['a','b','c']});const d=s.data;
 for(const owner of d.world.residents)acceptResidentPlan(d,owner,{title:'一天的安排',steps:[{location_id:'courtyard',activity:'walk',duration_minutes:360},{location_id:'common-room',activity:'rest',duration_minutes:360},{location_id:'warm-room',activity:'sleep',duration_minutes:360},{location_id:'courtyard',activity:'wait',duration_minutes:360}]},'day_'+owner,at);
 wakeResident(d,'a','encounter','day-start');beginLifeRun(d,'day-social',time);let job=nextLifeJob(d,'day-social',time);assert.equal(job.owner_id,'a');reply(d,job,{actor_id:'a',messages:[{to_id:'b',text:'我准备先去庭院散步。'}]});job=nextLifeJob(d,'day-social',time);assert.equal(job.owner_id,'b');reply(d,job,{actor_id:'b',messages:[{to_id:'a',text:'好，我也有自己的安排。'}]});
 d.world.life.settings.daily_requests=0;const before=d.world.events.length;advanceResidentRules(d,'2026-11-08T01:00:00.000Z');assert.ok(d.world.events.length>before+10);assert.equal(d.messages.length,0);assert.equal(d.turns.length,0);assert.equal(requests.length,0);assert.equal(d.world.communication.threads.find(t=>t.kind==='dm').messages.length,2);assert.doesNotThrow(()=>validateBackup(structuredClone(d)));
});
test('user chat is independent of autonomous quota and offline decisions stay queued without charging',async()=>{
 const {s}=await fixture();seed(s.data);await s.api('/world-life/settings','POST',{daily_requests:0});const contact=await s.api('/contacts','POST',{character_id:'a'});await s.stream(contact.id,'现在方便说话吗？','separate-budget',()=>{});
 const d=s.data;beginLifeRun(d,'offline-user',time);let job=nextLifeJob(d,'offline-user',time);assert.equal(job.request_origin,'user_chat');deferLifeRun(d,'offline-user',time,'network');assert.equal(d.world.life.daily.requests,0);assert.equal(d.world.life.wakeups.find(w=>w.key===job.wake_key).state,'pending');
 beginLifeRun(d,'online-user',time);job=nextLifeJob(d,'online-user',time);reply(d,job,{actor_id:'a',messages:[{to_id:'user',text:'现在可以。'}]});assert.equal(d.world.life.daily.requests,0);assert.equal(d.world.life.runs.find(r=>r.id==='online-user').user_requests,1);assert.equal(d.world.life.runs.find(r=>r.id==='online-user').requests,0);assert.equal(nextLifeJob(d,'online-user',time),null);assert.equal(d.messages.length,2);
});
