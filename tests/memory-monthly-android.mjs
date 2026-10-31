// Dedicated synthetic Android 11 emulator: original-signature 33→34, real SQLite/OB, mock model.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const snapshot='artifacts/memory-monthly-upgrade-before.json';
async function ready(){for(let i=0;i<150;i++){if(await evaluate(()=>document.querySelector('#status')?.textContent==='记录保存在本机'))return;await new Promise(r=>setTimeout(r,200));}throw Error('Startup write lease not released');}
const credentials=async()=>createHash('sha256').update((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout).digest('hex');
try{
 assert.equal((await adb('emu','avd','name')).stdout.replace(/\r/g,'').split('\n')[0],'TCompanionMonthly');
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await ready();
 if(process.argv.includes('--seed')){
  assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,33);
  const seed=await evaluate(async()=>{
   const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
   if(s.data.characters.length||s.data.messages.length)throw Error('New empty synthetic emulator required');
   s.transport=async(settings,key,m,delta)=>delta(m[0].content.includes('总结当天')?JSON.stringify({summary:'合成日总结：用户提到蓝色兰花。'}):'合成回答');
   const a=await s.api('/characters','POST',{name:'月度验收甲',identity:'合成人物',style:'',avatar:''}),b=await s.api('/characters','POST',{name:'月度验收乙',identity:'',style:'',avatar:''});
   await s.api('/settings','PATCH',{model:'synthetic',base_url:'https://fixture.invalid/v1'});const chat=await s.api('/contacts','POST',{character_id:a.id});
   await s.stream(chat.id,'蓝色兰花','seed',()=>{});await s.transact(d=>{for(const m of d.messages)m.created_at='2026-01-31T16:30:00Z';});
   await s.api('/memories','POST',{owner_id:a.id,title:'兰花',content:'用户提到蓝色兰花',kind:'statement',evidence:[{message_id:1,quote:'蓝色兰花'}]});
   await s.api('/summaries/generate','POST',{owner_id:a.id,day:'2026-02-01'});
   await s.api('/world/setup','POST',{character_ids:[a.id,b.id]});await s.api('/world/commands','POST',{request_id:'synthetic-wait',type:'advance',actor_id:a.id});
   await s.storage.setKey('synthetic-monthly-upgrade-key',s.data.active_profile_id);await s.api('/backup/restore','POST',await s.api('/backup'));
   return {data:await s.api('/backup'),owner:a.id,other:b.id,chat:chat.id};
  });
  await writeFile(snapshot,JSON.stringify({...seed,credentials:await credentials()}));console.log('Captured synthetic code-33 data and credential fingerprint');
 }else{
  assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,34);
  const before=JSON.parse(await readFile(snapshot,'utf8')),expected=structuredClone(before.data);expected.memory.monthly_summaries=[];
  assert.equal(await credentials(),before.credentials);
  const upgraded=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');});assert.deepEqual(upgraded,expected,'Only empty monthly collection is added; old cards/revisions/evidence stay unchanged');
  const result=await evaluate(async before=>{
   const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);let modelCalls=0;
   s.transport=async(settings,key,m,delta)=>{modelCalls++;const input=JSON.parse(m[1].content);if(input.days?.[0]?.content!=='合成日总结：用户提到蓝色兰花。')throw Error('Monthly prompt must use old daily content');delta(JSON.stringify({summary:'合成月度回顾：用户谈到兰花。'}));};
   const old=(await s.api('/memories?owner='+before.owner))[0];if(old.room!=='living_room')throw Error('Legacy room fallback failed');
   await s.api('/memories/'+old.id,'PATCH',{...old,room:'attic'});
   const preview=await s.api('/contacts/'+before.chat+'/context-preview','POST',{message:'蓝色兰花'});if(preview.recall.method!=='embedded-ob+bounded-links'||!preview.messages[0].content.includes('蓝色兰花'))throw Error('Real OB recall lost classified card');
   await s.api('/monthly-summaries/generate','POST',{owner_id:before.owner,month:'2026-02'});
   const month=(await s.api('/monthly-summaries?owner='+before.owner))[0];if(month.stale||month.summary_refs[0].revision!==0||month.source_ids.length!==2)throw Error('Legacy daily provenance failed');
   if((await s.api('/monthly-summaries?owner='+before.other)).length)throw Error('Other owner leaked');
   await s.api('/summaries','PATCH',{owner_id:before.owner,day:'2026-02-01',content:'原生日总结人工校对'});
   if(!(await s.api('/monthly-summaries?owner='+before.owner))[0].stale)throw Error('Monthly stale state lost');
   await s.api('/monthly-summaries','PATCH',{owner_id:before.owner,month:'2026-02',content:'原生月度回顾人工校对'});
   const backup=await s.api('/backup');await s.api('/backup/restore','POST',backup);
   return {modelCalls,owner:before.owner,chat:before.chat,backup,method:preview.recall.method};
  },before);
  assert.equal(result.modelCalls,1);
  await restart();await ready();
  const saved=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');});assert.deepEqual(saved,result.backup);assert.equal(await credentials(),before.credentials);
  await evaluate(()=>document.querySelector('[data-app=memory]').click());
  for(let i=0;i<100;i++){if(await evaluate(()=>document.querySelectorAll('.memory-card').length===1))break;await new Promise(r=>setTimeout(r,150));}
  await evaluate(()=>{window.previousMemoryCard=document.querySelector('.memory-card');document.querySelector('#memory-room').value='attic';document.querySelector('#memory-room').dispatchEvent(new Event('change'));});
  for(let i=0;i<100;i++){if(await evaluate(()=>!!document.querySelector('.memory-card')&&document.querySelector('.memory-card')!==window.previousMemoryCard))break;await new Promise(r=>setTimeout(r,150));}
  assert.match(await evaluate(()=>document.querySelector('.memory-card small')?.textContent),/阁楼/);
  await evaluate(()=>{document.querySelector('#memory-month').value='2026-02';document.querySelector('#memory-monthly').click();});
  for(let i=0;i<100;i++){if(await evaluate(()=>document.querySelector('#monthly-dialog .memory-stale')!==null))break;await new Promise(r=>setTimeout(r,150));}
  assert.equal(await evaluate(()=>document.querySelector('#monthly-content')?.value),'原生月度回顾人工校对');assert.ok(await evaluate(()=>!!document.querySelector('#monthly-dialog .memory-stale')));
  const report={checks:['original-signature 33→34 upgrade','all old business data preserved with one empty additive collection','credentials unchanged','legacy room default and classification','real Python/OB recall','monthly uses legacy daily revision zero','owner isolation','daily change marks review stale','manual/history backup restore','process restart','WebView 83 room/monthly UI'],modelCalls:result.modelCalls,method:result.method};
  await writeFile('artifacts/memory-monthly-android-validation.json',JSON.stringify(report,null,2));console.log('PASS: '+report.checks.length+' Android upgrade/SQLite/OB/UI checks; mock model only');
 }
}finally{disconnect();}
