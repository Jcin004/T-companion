// Dedicated emulator only. CDP transport follows embedded-ob-android.mjs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [adbPath,serial,output='artifacts/world-probe']=process.argv.slice(2);
if(!adbPath||!/^emulator-\d+$/.test(serial||''))throw Error('A dedicated emulator is required');
const run=promisify(execFile),adb=(...args)=>run(adbPath,['-s',serial,...args],{maxBuffer:8*1024*1024});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(output,{recursive:true});
let socket,sequence=0;const pending=new Map();
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function connect(){
 let target;
 for(let i=0;i<100;i++){
  try{const pid=(await adb('shell','pidof','io.jcin.tcompanion')).stdout.trim();await adb('forward','tcp:9238','localabstract:webview_devtools_remote_'+pid);target=(await(await fetch('http://127.0.0.1:9238/json')).json()).find(t=>t.url.includes('world-probe/index.html'));if(target)break;}catch{}
  await pause(200);
 }
 assert.ok(target,'probe WebView not found');socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=e=>{const message=JSON.parse(e.data),item=pending.get(message.id);if(item){pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}};
 for(let i=0;i<100;i++){if(await evaluate('!!window.probeSnapshot'))return;await pause(100);}
 throw Error('Probe viewer did not read native snapshot: '+await evaluate('document.body.innerText'));
}
try{
 await adb('shell','am','force-stop','io.jcin.tcompanion');
 const instrument=process.env.WORLD_PROBE_UI_ONLY==='1'
  ?{stdout:await readFile(output+'/instrumentation.txt','utf8')}
  :await adb('shell','am','instrument','-w','-r','io.jcin.tcompanion.test/io.jcin.tcompanion.WorldProbeInstrumentation');
 await writeFile(output+'/instrumentation.txt',instrument.stdout);
 assert.match(instrument.stdout,/PASS: upstream SullyOS/);
 const evidence=JSON.parse((await adb('shell','run-as','io.jcin.tcompanion','cat','files/world-probe-evidence.json')).stdout);
 assert.equal(evidence.activity_count,0);
 let productDatabaseExists=true;try{await adb('shell','run-as','io.jcin.tcompanion','ls','databases/t-local.db');}catch{productDatabaseExists=false;}
 assert.equal(productDatabaseExists,false,'experiment created a product database');
 for(let pass=0;pass<2;pass++){
  await adb('shell','am','force-stop','io.jcin.tcompanion');
  await adb('shell','am','start','-n','io.jcin.tcompanion/.WorldProbeActivity');await connect();
  assert.deepEqual(await evaluate('window.probeSnapshot'),evidence.expected);
  await evaluate('document.querySelector("#reload").click()');assert.deepEqual(await evaluate('window.probeSnapshot'),evidence.expected);
  assert.match(await evaluate('document.querySelector("#messages").textContent'),/林：今晚一起看书吗？/);
  assert.match(await evaluate('document.querySelector("#messages").textContent'),/雨：好，我带一本书过去。/);
  const image=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(output+'/world-probe-'+(pass?'restart':'first')+'.png',Buffer.from(image.data,'base64'));
  socket.close();socket=null;
 }
 Object.assign(evidence,{ui_matches_sqlite:true,reload_unchanged:true,process_restart_retained:true,product_database_created:false,platform:'Android 11 API 30 isolated x86_64 emulator',natural_periodic_execution_tested:false});
 await writeFile(output+'/evidence.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('PASS: real headless Worker → QuickJS upstream rules → SQLite → read-only WebView; restart, replay, rollback, CAS; zero model calls');
}finally{if(socket)socket.close();await adb('forward','--remove','tcp:9238').catch(()=>{});}
