// Isolated Android emulator only. Reuses the existing WebView CDP/native-SQLite test pattern.
// All model responses are injected fixtures; the original document is restored in finally.
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {validateBackup} from '../frontend/local-service.js';

const serial=process.env.T_TEST_EMULATOR||'emulator-5560';
if(!/^emulator-\d+$/.test(serial))throw Error('This acceptance test must not run against a physical device');
const sdk=process.env.ANDROID_HOME||join(process.env.LOCALAPPDATA,'Android','Sdk');
const adb=(...args)=>execFileSync(join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),['-s',serial,...args],{encoding:'utf8'}).trim();
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1');
const pid=adb('shell','pidof','io.jcin.tcompanion');assert.match(pid,/^\d+$/);
adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);
const target=(await(await fetch('http://127.0.0.1:9223/json')).json()).find(t=>t.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0,original;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
await mkdir('data',{recursive:true});
try {
  const backupExpression="(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()";
  original=await evaluate(backupExpression);
  await writeFile('data/chat-settings-android-before.json',JSON.stringify(original));
  const contact=await evaluate(`(async()=>{const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal);await s.api('/settings','PATCH',{history_limit:37});const c=await s.api('/characters','POST',{name:'上下文原生验收人物',identity:'测试人物',style:'',avatar:''});return s.api('/contacts','POST',{character_id:c.id});})()`);
  await cdp('Page.reload');
  const wait=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);};
  await wait("document.getElementById('status').textContent==='记录保存在本机'");
  await evaluate("document.querySelector('.app-grid [data-app=chat]').click();[...document.querySelectorAll('#contacts .contact')].find(e=>e.textContent.includes('上下文原生验收人物')).click();");
  await wait("document.querySelector('.phone').classList.contains('in-chat')");
  await evaluate("document.getElementById('details').click()");
  const initial=await evaluate("({disabled:document.getElementById('chat-history-limit').disabled,mode:document.getElementById('chat-history-mode').value,value:document.getElementById('chat-history-limit').value,inputmode:document.getElementById('chat-history-limit').getAttribute('inputmode')})");
  assert.deepEqual(initial,{disabled:false,mode:'inherit',value:'37',inputmode:'numeric'});
  await evaluate("const field=document.getElementById('chat-history-limit');field.value='7';field.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('note').value='详情未保存';document.getElementById('chat-style-open').click();");
  await wait("document.getElementById('chat-style-dialog').open");
  adb('shell','input','keyevent','4');
  await wait("document.getElementById('details-dialog').open");
  assert.deepEqual(await evaluate("[document.getElementById('chat-history-limit').value,document.getElementById('chat-history-mode').value,document.getElementById('note').value]"),['7','custom','详情未保存']);
  await evaluate("document.querySelector('#details-form button').click()");
  await wait("!document.getElementById('details-dialog').open");
  const saved=await evaluate(backupExpression);assert.equal(saved.settings.history_limit,37);assert.equal(saved.sessions.find(c=>c.id===contact.id).history_limit,7);
  await cdp('Page.reload');await wait("document.getElementById('status').textContent==='记录保存在本机'");
  await evaluate("document.querySelector('.app-grid [data-app=chat]').click();[...document.querySelectorAll('#contacts .contact')].find(e=>e.textContent.includes('上下文原生验收人物')).click();");
  await wait("document.querySelector('.phone').classList.contains('in-chat')");await evaluate("document.getElementById('details').click()");
  assert.equal(await evaluate("document.getElementById('chat-history-limit').value"),'7');
  await evaluate("document.getElementById('chat-style-open').click();document.getElementById('action-prompt').value='线上动作 {{char}}';document.querySelector('#chat-style-form button.primary').click()");
  await wait("document.getElementById('details-dialog').open");
  console.log('PASS: Android 11 numeric input, independent range survives reload/native SQLite, actual system Back restores details and unsaved fields; style save returns to parent. No model calls.');
} finally {
 try {
  if(original){
    await evaluate(`(async()=>{const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal);await s.api('/backup/restore','POST',${JSON.stringify(original)});})()`);
    const restored=await evaluate("(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()");
    assert.deepEqual(restored,validateBackup(original));console.log('PASS: isolated emulator original document restored with existing backup normalization');
    await cdp('Page.reload');
  }
 } finally {ws.close();}
}
