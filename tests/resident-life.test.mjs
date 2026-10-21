import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {ensureLife,beginLifeRun,nextLifeJob,reserveLifeRequest,lifePrompt,recordLifeResponse,applyLifeResponse,resumeLifeRun} from '../frontend/resident-life-core.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const t={iso:'2026-10-22T04:00:00Z',day:'2026-10-22',hour:12};
async function fixture(){
 let disk=emptyData(),fail=false;const requests=[];
 const store={load:async()=>structuredClone(disk),save:async d=>{if(fail)throw Error('disk full');disk=structuredClone(d);},hasKey:async()=>false};
 const s=await new LocalService(store,async(settings,key,m,delta)=>{
  requests.push(m);const p=JSON.parse(m[1].content),kind=m[0].content.match(/任务：(\w+)/)?.[1];
  if(kind==='memory')delta(JSON.stringify({memories:p.observed_events.map(e=>({title:'经历',content:e.content,kind:'experience',evidence:[{source_type:'world_event',event_id:e.id,quote:e.content}]}))}));
  else if(kind==='share')delta(JSON.stringify({share:true,event_id:p.observed_events[0].id,quote:p.observed_events[0].content,comment:'想和你聊聊。'}));
  else delta(JSON.stringify({actor_id:p.actor_id,type:'wait',plan:'照顾盆栽'}));
 }).init();
 await s.transact(d=>{d.characters=[{id:'a',name:'甲',identity:'甲的身份',style:'',avatar:''},{id:'b',name:'乙',identity:'乙的身份',style:'',avatar:''}];});
 await s.api('/world/setup','POST',{character_ids:['a','b']});await s.api('/settings','PATCH',{model:'mock'});
 await s.api('/world-life/settings','POST',{enabled:true,quiet_start:0,quiet_end:0,max_requests:6,share_minutes:15});
 return {s,requests,fail:v=>{fail=v;},restart:()=>new LocalService(store,s.transport).init()};
}
test('residents create events, auto memories and unread assistant shares without any user message',async()=>{
 const {s,requests,restart}=await fixture();await s.api('/world-life/run','POST',{request_id:'batch-one'});
 assert.equal(s.data.messages.filter(m=>m.role==='user').length,0);assert.equal(s.data.turns.length,0);
 assert.equal(s.data.world.events.filter(e=>e.source.type==='resident_action').length,2);
 assert.ok(s.data.memory.events.length>=2);assert.ok(s.data.messages.every(m=>m.origin==='world_share'));
 const contacts=await s.api('/contacts');assert.equal(contacts.length,2);assert.ok(contacts.every(c=>c.unread_shares===1));
 const count=requests.length;await s.api('/world-life/run','POST',{request_id:'batch-one'});assert.equal(requests.length,count);
 const loaded=await restart();assert.equal(loaded.data.messages.length,2);assert.deepEqual(validateBackup(await loaded.api('/backup')).world,s.data.world);
 await loaded.api('/contacts/'+contacts[0].id+'/read','POST',{message_id:loaded.data.messages.at(-1).id});assert.equal((await loaded.api('/contacts')).find(c=>c.id===contacts[0].id).unread_shares,0);
 const context=await loaded.api('/contacts/'+contacts[0].id+'/context-preview','POST',{message:'你刚才停留了片刻？'});assert.ok(context.messages.some(m=>m.role==='assistant'));assert.match(context.messages[0].content,/world_event/);
});
test('each NPC has its own prompt; completed directed conversation creates knowledge, not omniscience',async()=>{
 const {s}=await fixture();await s.api('/world/commands','POST',{request_id:'move-b',type:'move',actor_id:'b',target:{x:5,y:6}});
 const d=s.data;beginLifeRun(d,'social',t);let j=nextLifeJob(d,'social',t);reserveLifeRequest(d,j.id,t,lifePrompt(d,j));recordLifeResponse(d,j.id,{actor_id:'a',type:'say',to_id:'b',text:'一起看书吧。',event_ids:[]},t);applyLifeResponse(d,j.id,t);
 j=nextLifeJob(d,'social',t);assert.equal(j.owner_id,'b');assert.equal(j.kind,'reply');const prompt=lifePrompt(d,j);
 assert.match(prompt[1].content,/乙的身份/);assert.doesNotMatch(prompt[1].content,/甲的身份/);assert.match(prompt[1].content,/一起看书/);
 reserveLifeRequest(d,j.id,t,prompt);recordLifeResponse(d,j.id,{actor_id:'b',type:'say',to_id:'a',text:'好，我们去书架。'},t);applyLifeResponse(d,j.id,t);
 const events=d.world.events.filter(e=>e.source.type==='resident_dialogue');assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.source.speaker_id),['a','b']);assert.deepEqual(events.map(e=>e.source.turn),[1,2]);assert.equal(events[1].source.reply_to,events[0].id);
});
test('unobserved experiences stay private; sharing can be declined and quotes are checked',async()=>{
 const {s}=await fixture();await s.api('/world/commands','POST',{request_id:'walk-a',type:'move',actor_id:'a',target:{x:2,y:8}});
 const e=await s.api('/world/commands','POST',{request_id:'plant',type:'interact',actor_id:'a',target_id:'plant'});
 const d=s.data;beginLifeRun(d,'privacy',t);const j=nextLifeJob(d,'privacy',t);assert.doesNotMatch(lifePrompt(d,{...j,owner_id:'b'})[1].content,/给盆栽浇了水/);
 const life=ensureLife(d);j.kind='share';j.event_ids=[e.id];Object.assign(life.jobs.find(x=>x.id===j.id),j);
 reserveLifeRequest(d,j.id,t,lifePrompt(d,j));recordLifeResponse(d,j.id,{share:false},t);applyLifeResponse(d,j.id,t);assert.equal(d.messages.length,0);
});
test('uncertain requests never automatically repeat or refund; responded results recover without model',async()=>{
 const {s}=await fixture(),d=s.data;beginLifeRun(d,'recover',t);const j=nextLifeJob(d,'recover',t);reserveLifeRequest(d,j.id,t,lifePrompt(d,j));
 assert.throws(()=>reserveLifeRequest(d,j.id,t,[]),/再次发送/);assert.throws(()=>resumeLifeRun(d,'recover',t),/计费/);assert.equal(ensureLife(d).daily.requests,1);
 resumeLifeRun(d,'recover',t,true);assert.equal(ensureLife(d).jobs[0].state,'skipped');
 const k=nextLifeJob(d,'recover',t);reserveLifeRequest(d,k.id,t,lifePrompt(d,k));recordLifeResponse(d,k.id,{actor_id:k.owner_id,type:'wait'},t);applyLifeResponse(d,k.id,t);const count=d.world.events.length;applyLifeResponse(d,k.id,t);assert.equal(d.world.events.length,count);
});
test('invalid actions and failed storage cannot become world facts; quiet and daily budgets block requests',async()=>{
 const f=await fixture(),d=f.s.data;beginLifeRun(d,'bad',t);const j=nextLifeJob(d,'bad',t);reserveLifeRequest(d,j.id,t,lifePrompt(d,j));recordLifeResponse(d,j.id,{actor_id:'b',type:'wait'},t);assert.throws(()=>applyLifeResponse(d,j.id,t),/行动者/);assert.equal(d.world.events.length,0);
 f.fail(true);await assert.rejects(f.s.api('/world-life/settings','POST',{share:false}),/disk full/);f.fail(false);assert.equal(ensureLife(f.s.data).settings.share,true);
 const l=ensureLife(d);l.runs[0].state='failed';l.settings.quiet_start=23;l.settings.quiet_end=8;assert.throws(()=>beginLifeRun(d,'quiet',{...t,hour:1}),/安静/);
 l.settings.daily_requests=0;beginLifeRun(d,'quota',t);const k=nextLifeJob(d,'quota',t);assert.throws(()=>reserveLifeRequest(d,k.id,t,[]),/额度/);
});
test('completed model candidate survives failed apply commit and resumes without another model request',async()=>{
 const {s,requests}=await fixture();await s.api('/world-life/settings','POST',{max_actions:1,max_requests:1,auto_memory:false,share:false});
 const save=s.storage.save.bind(s.storage);let once=true;
 s.storage.save=async data=>{if(once&&data.world.life?.jobs.some(j=>j.state==='applied')){once=false;throw Error('disk full at apply');}return save(data);};
 await assert.rejects(s.api('/world-life/run','POST',{request_id:'apply-failure'}),/disk full/);assert.equal(s.data.world.events.length,0);assert.equal(s.data.world.life.jobs[0].state,'responded');
 const count=requests.length;s.storage.save=save;await s.api('/world-life/resume','POST',{run_id:'apply-failure',skip_uncertain:false});assert.equal(requests.length,count);assert.equal(s.data.world.events.length,1);
});
test('cross-instance native transactions reload durable state and reject stale snapshots with CAS',async()=>{
 const data=emptyData();let revision=0,document=data,lease='';
 const plugin={load:async()=>({data:JSON.stringify(document),revision}),save:async a=>{if(a.revision!==revision)throw Error('stale');if(lease&&lease!==a.owner)throw Error('busy');document=JSON.parse(a.data);return {revision:++revision};},beginWrite:async({owner})=>{if(lease&&lease!==owner)throw Error('busy');lease=owner;},endWrite:async({owner})=>{if(owner===lease)lease='';},hasKey:async()=>({value:false})};
 const {NativePersistence}=await import('../frontend/local-service.js');
 const one=await new LocalService(new NativePersistence(plugin),async()=>{}).init(),two=await new LocalService(new NativePersistence(plugin),async()=>{}).init();
 await one.api('/characters','POST',{name:'甲',identity:'',style:'',avatar:''});await two.api('/characters','POST',{name:'乙',identity:'',style:'',avatar:''});assert.equal(document.characters.length,2);
 const stale=new NativePersistence(plugin);await stale.load();await one.api('/settings','PATCH',{history_limit:42});await assert.rejects(stale.save(document),/stale/);assert.equal(document.settings.history_limit,42);
});
test('user scene participation enters only its recipient next decision; vendor reuse stays pinned',async()=>{
 const {s}=await fixture();const scene=await s.api('/world/dialogue','POST',{character_id:'a'});
 s.transport=async(settings,key,m,delta)=>delta('我会考虑先去书架。');await s.stream(scene.id,'请先照看盆栽。','user-influence',()=>{});
 const job={owner_id:'a',kind:'action'};assert.match(lifePrompt(s.data,job)[1].content,/请先照看盆栽/);assert.doesNotMatch(lifePrompt(s.data,{...job,owner_id:'b'})[1].content,/请先照看盆栽/);
 const root=new URL('../frontend/vendor/alicization-town-life/',import.meta.url),p=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
 for(const [name,ref] of Object.entries(p.files))assert.equal(createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'),ref.sha256);
});
