// Isolated emulator only; real Python/OB, SQLite and Keystore, mock model transport.
// Run: node tests/embedded-ob-android.mjs <adb path> emulator-5556
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [adbPath,serial]=process.argv.slice(2),run=promisify(execFile);
if(!adbPath||!/^emulator-\d+$/.test(serial||''))throw Error('A dedicated emulator serial is required');
const adb=(...args)=>run(adbPath,['-s',serial,...args]);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let socket,sequence=0;const pending=new Map();
async function connect(embedded=true){
  let pid='';
  for(let i=0;i<100;i++){try{pid=(await adb('shell','pidof','io.jcin.tcompanion')).stdout.trim();if(pid)break;}catch{}await pause(200);}
  if(!pid)throw Error('App process unavailable');
  await adb('forward','tcp:9224','localabstract:webview_devtools_remote_'+pid);
  let target;
  for(let i=0;i<150;i++){
    try{target=(await(await fetch('http://127.0.0.1:9224/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}
    await pause(200);
  }
  if(!target)throw Error('WebView unavailable');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=e=>{const message=JSON.parse(e.data),item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}};
  for(let i=0;i<150;i++){if(await evaluate(required=>!!window.Capacitor&&(!required||!!window.Capacitor.Plugins.TMemory)&&!!document.querySelector('.app-grid [data-app="memory"]'),embedded))return;await pause(200);}
  throw Error('App did not become ready');
}
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(fn,arg){const r=await cdp('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function restart(){socket.close();await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await pause(1500);await connect();}
export async function acceptance(){try{
  await mkdir('artifacts',{recursive:true});await connect();
  const status=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TMemory.execute({request:JSON.stringify({action:'sync',records:[]})})).result));
  assert.equal(status.provider,'embedded-ob');
  const seeded=await evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');
    const s=await createLocalService(Capacitor.Plugins.TLocal);
    if(s.data.characters.length||s.data.messages.length)throw Error('Acceptance requires a new, empty emulator data directory');
    s.transport=async(settings,key,messages,delta)=>{
      if(messages[0].content.includes('记忆整理器')){
        const message=JSON.parse(messages[1].content).find(m=>m.role==='user');
        delta(JSON.stringify({memories:[{title:'紫色兰花',content:'用户说紫色兰花的花盆裂了',kind:'statement',evidence:[{message_id:message.id,quote:'紫色兰花的花盆裂了'}]}]}));
      }else delta('收到模拟消息');
    };
    const c=await s.api('/characters','POST',{name:'内置记忆验收',identity:'重视如实表达',style:'简短',avatar:''});
    const chat=await s.api('/contacts','POST',{character_id:c.id});
    await s.api('/settings','PATCH',{model:'synthetic-mock'});
    await s.stream(chat.id,'紫色兰花的花盆裂了','seed',()=>{});
    await s.api('/memories/extract','POST',{owner_id:c.id});
    const rows=await s.api('/memories?owner='+c.id);
    const preview=await s.api('/contacts/'+chat.id+'/context-preview','POST',{message:'兰花'});
    return {owner:c.id,chat:chat.id,id:rows[0].id,method:preview.recall.method,context:preview.messages[0].content,source:rows[0].evidence};
  });
  assert.equal(seeded.method,'embedded-ob+bounded-links');assert.match(seeded.context,/花盆裂了/);assert.equal(seeded.source[0].message_id,1);
  await restart();
  const result=await evaluate(async({chat,id,owner})=>{
    const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal);
    const preview=message=>s.api('/contacts/'+chat+'/context-preview','POST',{message});
    const before=await preview('兰花');
    await s.api('/memories/'+id,'PATCH',{owner_id:owner,title:'花盆待修',content:'用户提到紫色兰花花盆待修理',kind:'statement',evidence:[{message_id:1,quote:'紫色兰花的花盆裂了'}]});
    const edited=await preview('待修理');
    await s.api('/memories/'+id,'PATCH',{active:false});const paused=await preview('兰花');
    await s.api('/memories/'+id,'PATCH',{active:true});const resumed=await preview('兰花');
    const other=await s.api('/characters','POST',{name:'另一人物',identity:'',style:'',avatar:''}),otherChat=await s.api('/contacts','POST',{character_id:other.id});
    const isolated=await s.api('/contacts/'+otherChat.id+'/context-preview','POST',{message:'兰花'});
    const backup=await s.api('/backup');await s.api('/memories/'+id,'DELETE');const deleted=await preview('兰花');
    await s.api('/backup/restore','POST',backup);const restored=await preview('兰花');
    // Real SQLite failure after a successful OB stage must not leak staged edits.
    const save=s.storage.save.bind(s.storage);s.storage.save=async()=>{throw Error('synthetic disk failure');};
    let failed=false;try{await s.api('/memories/'+id,'PATCH',{active:false});}catch{failed=true;}s.storage.save=save;
    const rollback=await preview('兰花');
    return {before:before.recall,edited:edited.messages[0].content,paused:paused.recall,resumed:resumed.recall,isolated:isolated.recall,deleted:deleted.recall,restored:restored.recall,failed,rollback:rollback.recall,raw:s.data.messages[0].content,engine:await s.api('/memory-engine')};
  },seeded);
  assert.equal(result.before.candidates.filter(c=>c.status==='selected').length,1);
  assert.match(result.edited,/待修理/);
  for(const key of ['paused','isolated','deleted'])assert.equal(result[key].candidates.filter(c=>c.status==='selected').length,0,key);
  for(const key of ['resumed','restored','rollback'])assert.equal(result[key].candidates.filter(c=>c.status==='selected').length,1,key);
  assert.equal(result.failed,true);assert.equal(result.raw,'紫色兰花的花盆裂了');
  // Reload the UI against the same durable data, then inspect the engine app.
  await cdp('Page.reload');await pause(2000);
  await evaluate(()=>document.querySelector('.app-grid [data-app="memory"]').click());await pause(300);
  await evaluate(()=>document.querySelector('#embedded-memory-open').click());await pause(300);
  assert.equal(await evaluate(()=>document.querySelector('#embedded-memory-dialog').open),true);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/embedded-ob-android.png',Buffer.from(screenshot.data,'base64'));
  await writeFile('artifacts/embedded-ob-android-validation.json',JSON.stringify({checks:['real embedded Python/OB','mock extraction','SQLite restart recall','edit','pause/resume','owner isolation','delete/restore backup','failed SQLite rollback','unchanged source','engine UI'],...result},null,2));
  console.log('PASS: 11 isolated Android acceptance checks; real OB, mocked model, no computer memory service.');
}finally{socket?.close();}}
export {adb,connect,evaluate,restart,cdp};
export const disconnect=()=>socket?.close();
if(import.meta.url===pathToFileURL(process.argv[1]).href)await acceptance();
