// Dedicated emulator with a fresh -datadir only. Never clears an installation.
// node tests/world-android.mjs <adb> emulator-5558 <same-signed-new.apk>
import {adb,connect,evaluate,disconnect,cdp,restart} from './embedded-ob-android.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const newApk=process.argv[4];if(!newApk)throw Error('New signed APK required');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let nativeInset;
async function tap(p){
  const dpr=await evaluate(()=>devicePixelRatio);
  if(nativeInset===undefined){
    await adb('shell','uiautomator','dump','/sdcard/world-window.xml');
    const xml=(await adb('shell','cat','/sdcard/world-window.xml')).stdout;
    const bounds=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);
    if(!bounds)throw Error('Cannot determine native WebView inset');nativeInset={x:Number(bounds[1]),y:Number(bounds[2])};
  }
  await adb('shell','input','tap',String(Math.round(p.x*dpr+nativeInset.x)),String(Math.round(p.y*dpr+nativeInset.y)));
}
async function touch(selector){
  const p=await evaluate(selector=>{const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},selector);
  await tap(p);await pause(400);
}
async function until(fn){for(let n=0;n<100;n++){if(await evaluate(fn))return;await pause(100);}throw Error('UI condition timed out');}
try{
  await connect();
  await until(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  const baseline=await evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    if(s.data.characters.length||s.data.messages.length)throw Error('Expected dedicated empty emulator; refusing to replace existing data');
    const a=await s.api('/characters','POST',{name:'林',identity:'合成验收人物',style:'简短',avatar:''}),b=await s.api('/characters','POST',{name:'雨',identity:'',style:'',avatar:''});
    const chat=await s.api('/contacts','POST',{character_id:a.id});await s.api('/settings','PATCH',{model:'fixture',base_url:'https://fixture.invalid/v1'});
    s.transport=async(s,k,m,delta)=>delta('旧版模拟回复');await s.stream(chat.id,'旧聊天的紫色兰花','old-seed',()=>{});
    await s.api('/memories','POST',{owner_id:a.id,title:'紫色兰花',content:'用户提到了紫色兰花',kind:'statement',evidence:[{message_id:1,quote:'旧聊天的紫色兰花'}]});
    await s.api('/contacts/'+chat.id+'/draft','PATCH',{text:'保留旧草稿'});
    return {data:await s.api('/backup'),a:a.id,b:b.id,chat:chat.id};
  });disconnect();await adb('install','-r',newApk);await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();
  const upgraded=await evaluate(async chat=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    return {data:await s.api('/backup'),preview:await s.api('/contacts/'+chat+'/context-preview','POST',{message:'紫色兰花'}),version:await Capacitor.Plugins.TUpdate.info()};
  },baseline.chat);
  await until(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  for(const key of ['characters','sessions','messages','turns','settings','drafts','api_profiles','api_groups','memory'])assert.deepEqual(upgraded.data[key],baseline.data[key],'upgrade retains '+key);
  assert.equal(upgraded.version.versionCode,15);assert.equal(upgraded.preview.recall.method,'embedded-ob+bounded-links');
  assert.match(upgraded.preview.messages[0].content,/旧聊天的紫色兰花/);
  await touch('.app-grid [data-app="world"]');
  await until(()=>!!document.querySelector('#world-resident-0'));
  // Two default distinct roster choices; actual touch enters the room.
  await evaluate(()=>[...document.querySelectorAll('#world-setup button')].find(b=>b.textContent==='进入小屋').id='world-enter-test');
  await touch('#world-enter-test');await until(()=>!document.querySelector('#world-play').hidden);
  const canvas=await evaluate(()=>{const r=document.querySelector('#world-canvas').getBoundingClientRect();return {x:r.x+5.5/12*r.width,y:r.y+7.5/13*r.height};});
  await tap(canvas);
  await until(()=>document.querySelector('#world-time').textContent.includes('第 1 步'));await pause(1000);
  const seeded=await evaluate(async({a,b,chat})=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    const cmd=(request_id,type,extra={})=>s.api('/world/commands','POST',{request_id,type,...extra});
    await cmd('a-walk','move',{actor_id:a,target:{x:2,y:8}});const e=await cmd('plant','interact',{actor_id:a,target_id:'plant'});
    await cmd('plant','interact',{actor_id:a,target_id:'plant'});
    await s.api('/memories','POST',{owner_id:a,title:'盆栽浇水',content:e.content,kind:'experience',participants:[a,b],evidence:[{source_type:'world_event',event_id:e.id,quote:e.content}]});
    const other=await s.api('/contacts','POST',{character_id:b});
    let denied=false;try{await s.api('/world/sources/'+e.id+'?owner='+b);}catch{denied=true;}
    await cmd('user-approach','move',{target:{x:4,y:8}});
    const scene=await s.api('/world/dialogue','POST',{character_id:a});let request;
    s.transport=async(s,k,m,delta)=>{request=m;delta('模拟场景回复');};await s.stream(scene.id,'一起照看盆栽','scene-seed',()=>{});
    return {event:e,scene:scene.id,request,other:other.id,denied,state:(await s.api('/world')).state,worldPreview:await s.api('/contacts/'+chat+'/context-preview','POST',{message:'盆栽'}),isolated:await s.api('/contacts/'+other.id+'/context-preview','POST',{message:'盆栽'})};
  },baseline);
  assert.equal(seeded.denied,true);assert.equal(seeded.worldPreview.recall.method,'embedded-ob+bounded-links');assert.match(seeded.worldPreview.messages[0].content,/world_event/);assert.doesNotMatch(seeded.isolated.messages[0].content,/给盆栽浇了水/);assert.match(seeded.request[0].content,/当前场景对话/);
  await restart();
  const persisted=await evaluate(async({event,a,scene,chat})=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    const state=(await s.api('/world')).state,source=await s.api('/world/sources/'+event.id+'?owner='+a),old=await s.api('/memory-sources/1/location?owner='+a);
    const preview=await s.api('/contacts/'+chat+'/context-preview','POST',{message:'盆栽'});
    const rows=await s.api('/memories?owner='+a),item=rows.find(m=>m.evidence.some(e=>e.event_id===event.id));
    await s.api('/memories/'+item.id,'PATCH',{active:false});const paused=await s.api('/contacts/'+chat+'/context-preview','POST',{message:'盆栽'});
    await s.api('/memories/'+item.id,'PATCH',{active:true});
    const save=s.storage.save.bind(s.storage);s.storage.save=async()=>{throw Error('fixture disk failure');};let failed=false;try{await s.api('/world/commands','POST',{request_id:'failed','type':'advance'});}catch{failed=true;}s.storage.save=save;
    return {state,source,old,preview,paused,failed,afterFailure:(await s.api('/world')).state};
  },{...baseline,event:seeded.event,scene:seeded.scene});
  assert.deepEqual(persisted.state,seeded.state);assert.deepEqual(persisted.afterFailure,seeded.state);assert.equal(persisted.failed,true);
  assert.equal(persisted.source.id,seeded.event.id);assert.equal(persisted.old.message.id,1);assert.match(persisted.preview.messages[0].content,/world_event/);assert.doesNotMatch(persisted.paused.messages[0].content,/给盆栽浇了水/);
  await touch('.app-grid [data-app="world"]');await until(()=>!document.querySelector('#world-play').hidden);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/world-android-room.png',Buffer.from(screenshot.data,'base64'));
  const resident=await evaluate(a=>{const r=document.querySelector('#world-canvas').getBoundingClientRect();return {x:r.x+2.5/12*r.width,y:r.y+8.25/13*r.height};},baseline.a);
  await tap(resident);
  await until(()=>document.querySelector('#world-dialogue').open);
  assert.match(await evaluate(()=>document.querySelector('#world-lines').textContent),/模拟场景回复/);
  const dialogue=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/world-android-dialogue.png',Buffer.from(dialogue.data,'base64'));
  await adb('shell','input','keyevent','4');await until(()=>!document.querySelector('#world-dialogue').open);
  await writeFile('artifacts/world-android-validation.json',JSON.stringify({version:upgraded.version,upgrade:'0.10.0 -> 0.11.0 same-signature in-place',checks:['all original business fields retained','legacy chat OB recall','WebView touch room entry and movement','command retry dedup','world event OB recall','observer isolation despite participant association','completed scene context and event','SQLite process restart','typed world and old chat provenance','pause affects OB recall','failed SQLite operation rollback','touch opens scene and Android back closes it'],world:persisted.state},null,2));
  console.log('PASS: Android same-signature upgrade, real SQLite/OB restart and isolation, touch room/dialogue, mocked model only');
}finally{disconnect();}
