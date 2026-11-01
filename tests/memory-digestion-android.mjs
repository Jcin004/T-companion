// Fresh dedicated Android emulator only; uses native SQLite and injected model fixtures.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {join} from 'node:path';

const serial=process.env.T_TEST_EMULATOR||'emulator-5560';
if(!/^emulator-\d+$/.test(serial))throw Error('This acceptance test must not run against a physical device');
const sdk=process.env.ANDROID_HOME||join(process.env.LOCALAPPDATA,'Android','Sdk');
const adb=(...args)=>execFileSync(join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),['-s',serial,...args],{encoding:'utf8'}).trim();
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1');assert.equal(adb('shell','getprop','ro.build.version.sdk'),'30');
const pid=adb('shell','pidof','io.jcin.tcompanion');assert.match(pid,/^\d+$/);adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid);
const target=(await(await fetch('http://127.0.0.1:9223/json')).json()).find(item=>item.type==='page');assert.ok(target);
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0,baselineIsFresh=false;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async(fn,arg)=>{const result=await cdp('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const wait=async(fn,arg)=>{for(let i=0;i<200;i++){try{if(await evaluate(fn,arg))return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}const state=await evaluate(()=>JSON.stringify({owner:document.querySelector('#memory-owner')?.value,options:[...document.querySelectorAll('#memory-owner option')].map(o=>[o.value,o.textContent]),cards:[...document.querySelectorAll('#memory-list .memory-card')].map(n=>n.textContent),statuses:[...document.querySelectorAll('[role=status]')].map(n=>n.textContent).filter(Boolean)}));throw Error('Native UI wait timed out: '+state);};
const click=selector=>evaluate(value=>document.querySelector(value)?.click(),selector);
const clickIn=(selector,title,label)=>evaluate(({selector,title,label})=>{const item=[...document.querySelectorAll(selector)].find(node=>node.textContent.includes(title));const button=[...item?.querySelectorAll('button')||[]].find(node=>node.textContent===label);if(!button)throw Error('Missing button '+label+' for '+title);button.click();},{selector,title,label});
const backup=()=>evaluate(async()=>{const raw=await Capacitor.Plugins.TLocal.load({assetReferences:false});return JSON.parse(raw.data);});
const reload=async()=>{await evaluate(()=>window.__qaReload=true);await cdp('Page.reload');await wait(()=>!window.__qaReload&&document.querySelector('#status')?.textContent==='记录保存在本机');};
try{
 await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 const original=await backup();assert.equal(original.characters.length,0,'Dedicated emulator must start without user data');assert.equal(original.sessions.length,0);assert.equal(original.messages.length,0);assert.equal(original.turns.length,0);assert.equal(original.memory.events.length,0);assert.equal(original.memory.digest_reports.length,0);baselineIsFresh=true;
 const seeded=await evaluate(async()=>{
  const {createLocalService}=await import('/assets/local-service.js'),service=await createLocalService(Capacitor.Plugins.TLocal);let digestCalls=0;
  service.transport=async(settings,key,messages,delta)=>{
   const prompt=messages[0]?.content||'';
   if(prompt.includes('认知消化器')){digestCalls++;const input=JSON.parse(messages[1].content);delta(JSON.stringify({summary:'Android 原生记忆复核。',reviews:input.targets.map(target=>({target_id:target.id,action:target.room==='windowsill'?'fulfill':'resolve',reason:'独立经历有明确结果。',confidence:'high',basis_memory_ids:[input.experiences[0].id]}))}));}
   else delta('这是隔离模拟器中的固定回复。');
  };
  await service.api('/settings','PATCH',{model:'android-fixture'});
  const a=await service.api('/characters','POST',{name:'原生甲',identity:'',style:'简短',avatar:''}),b=await service.api('/characters','POST',{name:'原生乙',identity:'',style:'',avatar:''});
  const chatA=await service.api('/contacts','POST',{character_id:a.id}),chatB=await service.api('/contacts','POST',{character_id:b.id});
  await service.stream(chatA.id,'我一直想去海边。','digest-a1',()=>{});await service.stream(chatA.id,'今天我们真的去了海边。','digest-a2',()=>{});await service.stream(chatB.id,'乙自己的隔离经历。','digest-b1',()=>{});
  const source=(chat,role='user',index=0)=>service.data.messages.filter(message=>message.session_id===chat.id&&message.role===role)[index];
  const add=async(owner,chat,title,content,kind,room,message)=>{await service.api('/memories','POST',{owner_id:owner.id,title,content,kind,room,evidence:[{message_id:message.id,quote:message.content}]});return service.data.memory.events.find(item=>item.owner_id===owner.id&&item.title===title);};
  const wish=await add(a,chatA,'海边期盼','我一直期待去海边。','statement','windowsill',source(chatA,'user',0));
  const concern=await add(a,chatA,'是否能成行','还不确定是否能一起去。','interpretation','attic',source(chatA,'assistant',0));
  const experience=await add(a,chatA,'去了海边','今天确实一起去了海边。','experience','living_room',source(chatA,'user',1));
  await add(a,chatA,'下次约定','以后还会一起去。','promise','bedroom',source(chatA,'assistant',1));
  await add(b,chatB,'乙的私密经历','乙自己的隔离经历。','experience','living_room',source(chatB));
  return {owner:a.id,wish:wish.id,concern:concern.id,experience:experience.id,digestCalls};
 });
  await reload();await evaluate(()=>{const plugin=Capacitor.Plugins.TLocal,listeners=new Set(),addListener=plugin.addListener.bind(plugin);plugin.addListener=(event,callback)=>event==='modelChunk'?Promise.resolve((listeners.add(callback),{remove:async()=>listeners.delete(callback)})):addListener(event,callback);plugin.model=async request=>{const input=JSON.parse(request.messages[1].content),text=JSON.stringify({summary:'Android 原生记忆复核。',reviews:input.targets.map(target=>({target_id:target.id,action:target.room==='windowsill'?'fulfill':'resolve',reason:'独立经历有明确结果。',confidence:'high',basis_memory_ids:[input.experiences[0].id]}))});for(const callback of listeners)callback({id:request.id,text});};});const fixture=await backup();console.log('Fixture saved:',fixture.characters.map(c=>c.name).join(', '),fixture.memory.events.length,'memory cards');await click('.app-grid [data-app="memory"]');await wait(()=>document.querySelectorAll('#memory-owner option').length>=2);
  await evaluate(owner=>{const select=document.getElementById('memory-owner');if(select.value!==owner){select.value=owner;select.dispatchEvent(new Event('change'));}},seeded.owner);await wait(owner=>document.querySelector('#memory-owner')?.value===owner&&[...document.querySelectorAll('#memory-list .memory-card')].some(n=>n.textContent.includes('海边期盼'))&&[...document.querySelectorAll('.memory-status')].every(n=>n.textContent!=='处理中…'),seeded.owner);await new Promise(resolve=>setTimeout(resolve,300));
 await click('#memory-digest');await wait(()=>document.querySelector('#memory-digestion-dialog')?.open);
 const preview=await evaluate(()=>document.getElementById('memory-digestion-dialog').textContent);assert.match(preview,/待处理 2 条，独立经历 1 条/);assert.doesNotMatch(preview,/乙自己的隔离经历|下次约定/);
 await clickIn('#memory-digestion-dialog','认知消化','开始消化');await wait(()=>!!document.querySelector('.memory-digest-report'));
 await click('.memory-digest-details summary');await clickIn('.memory-digest-proposal','海边期盼','确认变化');await wait(()=>!![...document.querySelectorAll('.memory-digest-proposal')].find(node=>node.textContent.includes('已确认并写入记忆状态。')));
 await click('.memory-digest-details summary');await clickIn('.memory-digest-proposal','是否能成行','驳回');await wait(()=>!![...document.querySelectorAll('.memory-digest-proposal')].find(node=>node.textContent.includes('已驳回；原状态保留。')));
 let saved=await backup();assert.equal(saved.memory.events.find(item=>item.id===seeded.wish).cognition_state.status,'fulfilled');assert.equal(saved.memory.events.find(item=>item.id===seeded.concern).cognition_state,undefined);assert.equal(saved.memory.digest_reports.length,1);
  await click('.memory-digest-details summary');
 await clickIn('.memory-digest-proposal','海边期盼','原话 #3');await wait(()=>!!document.querySelector('[data-id="3"]'));
 saved=await backup();assert.equal(saved.memory.digest_reports[0].proposals.find(item=>item.target_memory_id===seeded.wish).state,'accepted');
 console.log('PASS: Android 11/WebView with native SQLite; isolated material, mocked digestion, accept/reject, durable decisions and source jump.');
}finally{
 socket.close();
 if(baselineIsFresh)try{adb('shell','am','force-stop','io.jcin.tcompanion');assert.match(adb('shell','pm','clear','io.jcin.tcompanion'),/Success/);adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');console.log('PASS: isolated emulator app data cleared and app restarted');}catch(error){console.error('FAIL: isolated emulator cleanup:',error.message);throw error;}
}
