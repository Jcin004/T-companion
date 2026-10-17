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
  original=await evaluate("(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');})()");
  await writeFile('data/memory-recall-android-before.json',JSON.stringify(original));
  const result=await evaluate(`(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal),sent=[];
    s.transport=async(a,k,m,delta)=>{sent.push(m);delta('固定模拟回复');};
    await s.api('/settings','PATCH',{model:'memory-recall-fixture'});
    await s.api('/memory-settings','PATCH',{auto_extract:false,use_links:true,use_anchors:true,context_messages:2,recall:true,recall_limit:4,budget:4000});
    const c=await s.api('/characters','POST',{name:'召回验证人物',identity:'重视诚实',style:'简短',avatar:''}),chat=await s.api('/contacts','POST',{character_id:c.id});
    for(const [index,word]of ['orchid','parcel'].entries()){
      await s.stream(chat.id,word,'native-recall-'+index,()=>{});
      const sources=await s.api('/memory-sources?owner='+c.id),source=sources.find(m=>m.role==='user'&&m.content===word);
      await s.api('/memories','POST',{owner_id:c.id,title:word,content:'用户提过 '+word,kind:'statement',evidence:[{message_id:source.id,quote:word}]});
    }
    await s.api('/self','POST',{owner_id:c.id,label:'诚实',interpretation:'愿意如实表达',quote:'重视诚实'});
    const [two,one]=await s.api('/memories?owner='+c.id),[anchor]=await s.api('/self?owner='+c.id);
    for(const [node,type,kind]of [[two,'causes','memory'],[anchor,'supports','anchor']])await s.api('/memory-links','POST',{owner_id:c.id,from:{kind:'memory',id:one.id},to:{kind,id:node.id},type,note:'人工验证关联'});
    const preview=await s.api('/contacts/'+chat.id+'/context-preview','POST',{message:'orchid'});
    await s.stream(chat.id,'orchid','native-actual',()=>{});
    const actual=sent[sent.length-1];
    await s.api('/memories/'+two.id,'PATCH',{active:false});
    const reopened=await createLocalService(Capacitor.Plugins.TLocal),paused=await reopened.api('/contacts/'+chat.id+'/context-preview','POST',{message:'orchid'});
    return {ids:{one:one.id,two:two.id,anchor:anchor.id},preview,actual,paused,settings:await reopened.api('/memory-settings')};
  })()`);
  const {ids}=result;
  assert.deepEqual(result.actual,result.preview.messages);
  for(const id of Object.values(ids))assert.ok(result.actual[0].content.includes(id));
  assert.ok(result.preview.recall.candidates.some(c=>c.reason==='link'&&c.status==='selected'));
  assert.ok(!result.paused.messages[0].content.includes(ids.two));
  assert.equal(result.settings.context_messages,2);assert.equal(result.settings.use_links,true);
  console.log('PASS: Android native SQLite stores settings/links/anchors; preview equals actual mock request; pause survives service restart; source evidence retained.');
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
