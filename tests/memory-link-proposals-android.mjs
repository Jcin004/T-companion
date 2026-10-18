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
  assert.equal((await evaluate('Capacitor.Plugins.TUpdate.info()')).versionCode,13);
  const backupExpression="(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()";
  original=await evaluate(backupExpression);await writeFile('data/link-proposals-android-before.json',JSON.stringify(original));
  const result=await evaluate(`(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal);
    s.transport=async(c,k,m,delta)=>delta('固定回复');await s.api('/settings','PATCH',{model:'proposal-fixture'});
    const c=await s.api('/characters','POST',{name:'候选原生验收人物',identity:'重视诚实',style:'',avatar:''}),chat=await s.api('/contacts','POST',{character_id:c.id});
    for(const [n,word]of ['orchid','parcel'].entries()){
      await s.stream(chat.id,word,'proposal-native-'+n,()=>{});
      const source=(await s.api('/memory-sources?owner='+c.id)).find(m=>m.role==='user'&&m.content===word);
      await s.api('/memories','POST',{owner_id:c.id,title:word,content:word,kind:'statement',evidence:[{message_id:source.id,quote:word}]});
    }
    const [two,one]=await s.api('/memories?owner='+c.id),refs=[one,two].map(m=>({kind:'memory',id:m.id}));
    s.transport=async(c,k,m,delta)=>delta(JSON.stringify({proposals:[{from:refs[0],to:refs[1],type:'supplements',reason:'待复核解读',proof:[{...refs[0],...one.evidence[0]},{...refs[1],...two.evidence[0]}]}]}));
    await s.api('/memory-link-proposals/generate','POST',{owner_id:c.id,refs});
    const pending=await s.api('/memory-link-proposals?owner='+c.id);return {owner:c.id,one:one.id,two:two.id,pending:pending[0],links:await s.api('/memory-links?owner='+c.id)};
  })()`);
  assert.equal(result.pending.status,'pending');assert.equal(result.links.length,0);assert.equal(result.pending.proof.length,2);
  const wait=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);};
  await evaluate('window.__proposalReload=true');await cdp('Page.reload');await wait("!window.__proposalReload && document.getElementById('status')?.textContent==='记录保存在本机'");
  await evaluate("document.querySelector('.app-grid [data-app=memory]').click()");await wait("document.querySelectorAll('#memory-owner option').length>=2");
  await evaluate('document.getElementById("memory-owner").value='+JSON.stringify(result.owner)+';document.getElementById("memory-owner").dispatchEvent(new Event("change"))');
  const selector=JSON.stringify('[data-memory-id="'+result.one+'"]');
  await wait('!!document.querySelector('+selector+')');
  await evaluate('[...document.querySelector('+selector+').querySelectorAll("button")].find(b=>b.textContent==="查看关联").click()');
  await wait('!![...document.querySelectorAll("#memory-links-dialog button")].find(b=>b.textContent==="AI 关联候选")');
  await evaluate('[...document.querySelectorAll("#memory-links-dialog button")].find(b=>b.textContent==="AI 关联候选").click()');
  await wait("!!document.querySelector('.proposal-accept')");
  await evaluate("document.querySelector('.proposal-type').value='causes';document.querySelector('.proposal-note').value='原生确认说明';document.querySelector('.proposal-accept').click()");
  await wait("document.getElementById('toast').textContent==='已确认；关联按当前召回设置生效'");
  const saved=await evaluate(backupExpression),p=saved.memory.link_proposals.find(p=>p.id===result.pending.id),link=saved.memory.links.find(l=>l.id===p.link_id);
  assert.equal(p.status,'accepted');assert.equal(p.reviewed_type,'causes');assert.equal(link.note,'原生确认说明');assert.equal(link.from.id,result.one);assert.equal(link.to.id,result.two);
  await evaluate('window.__proposalReload=true');await cdp('Page.reload');await wait("!window.__proposalReload && document.getElementById('status')?.textContent==='记录保存在本机'");
  const restarted=await evaluate(backupExpression);assert.equal(restarted.memory.link_proposals.find(p=>p.id===result.pending.id).status,'accepted');
  await evaluate('(async()=>{const {createLocalService}=await import("/assets/local-service.js");const s=await createLocalService(Capacitor.Plugins.TLocal);await s.api("/memories/'+result.one+'","DELETE");})()');
  const removed=await evaluate(backupExpression);assert.ok(!removed.memory.link_proposals.some(p=>p.owner_id===result.owner));assert.ok(!removed.memory.links.some(l=>l.owner_id===result.owner));
  console.log('PASS: Android 11 native SQLite candidate generation with mock transport; WebView proof/review edits create one directed relation; reload and endpoint cleanup persist.');
} catch(error) {console.error('Android proposal acceptance failed:',error.message);throw error;} finally {
 try {
  if(original){
    // Reload first so the UI has no current conversation. Otherwise its pagehide
    // draft save can write its stale document after a separate restore service.
    await evaluate("window.__cleanupReload=true");await cdp('Page.reload');
    for(let n=0;n<100;n++){
      if(await evaluate("!window.__cleanupReload && document.getElementById('status')?.textContent==='记录保存在本机'"))break;
      await new Promise(r=>setTimeout(r,50));
    }
    await evaluate(`(async()=>{const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal);await s.api('/backup/restore','POST',${JSON.stringify(original)});})()`);
    const restored=await evaluate("(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()");
    assert.deepEqual(restored,validateBackup(original));console.log('PASS: isolated emulator original document restored with existing backup normalization');
    await evaluate("window.__verifyRestore=true");await cdp('Page.reload');
    for(let n=0;n<100;n++){if(await evaluate("!window.__verifyRestore && document.getElementById('status')?.textContent==='记录保存在本机'"))break;await new Promise(r=>setTimeout(r,50));}
    const afterReload=await evaluate("(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()");
    assert.deepEqual(afterReload,validateBackup(original));
    console.log('PASS: restored baseline also survives pagehide/reload');
  }
 } finally {ws.close();}
}
