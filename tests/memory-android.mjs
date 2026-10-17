// Isolated emulator acceptance: requires a forwarded WebView CDP endpoint :9223.
// Real native SQLite/Keystore; injected mocked model transport, no provider network calls.
// Never run against a user's physical device. Restores the emulator document and clears its added mock key.
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const before=JSON.parse(await readFile('data/backups/memory060-before/state.json','utf8'));
const target=(await(await fetch('http://127.0.0.1:9223/json')).json()).find(t=>t.type==='page');
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const m=JSON.parse(event.data),item=pending.get(m.id);if(item){pending.delete(m.id);m.error?item.reject(Error(m.error.message)):item.resolve(m.result);}};
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async(fn,arg)=>{const r=await cdp('Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async(fn)=>{for(let i=0;i<200;i++){try{if(await evaluate(fn))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Native UI wait timed out: '+fn);};
const click=selector=>evaluate(s=>document.querySelector(s).click(),selector);
const clickText=(selector,text)=>evaluate(({selector,text})=>[...document.querySelectorAll(selector+' button')].find(b=>b.textContent===text).click(),{selector,text});
const select=(selector,value)=>evaluate(({selector,value})=>{const n=document.querySelector(selector);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));},{selector,value});
const reload=async()=>{await cdp('Page.reload');await new Promise(r=>setTimeout(r,800));await wait(()=>!!window.Capacitor?.Plugins?.TLocal&&!!document.querySelector('.app-grid [data-app="memory"]'));};
const screenshot=async path=>{const r=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(path,Buffer.from(r.data,'base64'));};
let baseline,mockProfile;
try{
 await wait(()=>!!window.Capacitor?.Plugins?.TLocal);
 const update=await evaluate(async()=>window.Capacitor.Plugins.TUpdate.info());assert.equal(update.channelPublished,false);const check=await evaluate(async()=>window.Capacitor.Plugins.TUpdate.check());assert.match(check.message,/私有手动更新/);await click('.app-grid [data-app="settings"]');await wait(()=>document.querySelector('#check-update').disabled&&document.querySelector('#check-update').textContent==='在线更新未启用');await evaluate(()=>document.querySelector('#check-update').scrollIntoView({block:'center'}));await screenshot('artifacts/private-update-0.6.1.png');await click('#home-button');
 baseline=await evaluate(async()=>JSON.parse((await window.Capacitor.Plugins.TLocal.load()).data));
 for(const k of ['characters','sessions','messages','turns','api_profiles','api_groups','settings','drafts'])assert.deepEqual(baseline[k],before[k],'upgrade retained '+k);
 const seeded=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(window.Capacitor.Plugins.TLocal);s.transport=async(settings,key,messages,delta)=>{const prompt=messages[0].content;let output='我愿意听听山间的故事。';if(prompt.includes('记忆整理器')){const m=JSON.parse(messages[1].content).find(m=>m.role==='user');output=JSON.stringify({memories:[{title:'山间散步',content:'用户说喜欢山间散步',kind:'statement',evidence:[{message_id:m.id,quote:m.content}]}]});}if(prompt.includes('总结当天'))output=JSON.stringify({summary:'用户谈到山间散步。角色表示愿意倾听。'});if(prompt.includes('分析认同核心'))output=JSON.stringify({anchors:[{label:'诚实',interpretation:'重视如实表达。',quote:'重视诚实',basis:'explicit'}]});if(prompt.includes('记忆整理器'))output='<think>只整理提供的原话</think>\n```json\n'+output.replace('{"memories":','{memories:')+'\n```';delta(output);};await s.api('/model-profiles','POST',{name:'Memory native fixture',base_url:'https://fixture.invalid/v1',model:'fixture',protocol:'openai-chat',api_key:'fixture-only-not-real'});const p=s.data.api_profiles.slice(-1)[0];await s.api('/model-profiles/'+p.id+'/activate','POST');const c=await s.api('/characters','POST',{name:'记忆验收角色',identity:'重视诚实',style:'简短',avatar:''}),chat=await s.api('/contacts','POST',{character_id:c.id});await s.stream(chat.id,'我喜欢山间散步','memory-native-seed',()=>{});await s.transact(d=>{for(const m of d.messages.filter(m=>m.session_id===chat.id))m.created_at='2026-01-01T17:00:00Z';});await s.api('/memories/extract','POST',{owner_id:c.id});await s.api('/summaries/generate','POST',{owner_id:c.id,day:'2026-01-02'});await s.api('/self/analyze','POST',{owner_id:c.id});return {owner:c.id,profile:p.id};});mockProfile=seeded.profile;
 await reload();await click('.app-grid [data-app="memory"]');await select('#memory-owner',seeded.owner);await wait(()=>!!document.querySelector('.memory-card h2'));await screenshot('artifacts/android-memory-0.6.png');
 await select('#memory-day','2026-01-02');await click('#memory-daily');await wait(()=>document.querySelector('#daily-dialog').open);await evaluate(()=>document.querySelector('#daily-content').value='原生存储编辑验收');await clickText('#daily-dialog','保存编辑');await wait(()=>[...document.querySelectorAll('#daily-dialog button')].some(b=>b.textContent==='按原话重写'));await click('#daily-dialog header button');
 await click('#home-button');await click('.app-grid [data-app="self"]');await select('#self-owner',seeded.owner);await wait(()=>!!document.querySelector('.self-orbit'));await screenshot('artifacts/android-self-0.6.png');
 await reload();const persisted=await evaluate(async()=>JSON.parse((await window.Capacitor.Plugins.TLocal.load()).data));assert.equal(persisted.memory.events.length,1);assert.equal(persisted.memory.summaries.length,1);assert.equal(persisted.memory.anchors.length,1);assert.equal(persisted.memory.summaries[0].content,'原生存储编辑验收');
 console.log('PASS: Android 11 WebView 83; upgrade retained original document fields; mocked transport exercises chat/extraction/summary/self with native SQLite; UI summary edits survive reload. No real provider called.');
}catch(e){await screenshot('artifacts/android-memory-failure.png');throw e;}
finally{
 if(baseline){await reload();await wait(()=>!!window.Capacitor?.Plugins?.TLocal);await evaluate(async({baseline,mockProfile})=>{const plugin=window.Capacitor.Plugins.TLocal,current=JSON.parse((await plugin.load()).data);for(const p of current.api_profiles.filter(p=>!baseline.api_profiles.some(b=>b.id===p.id)))await plugin.setKey({value:'',profile_id:p.id});if(mockProfile)await plugin.setKey({value:'',profile_id:mockProfile});await plugin.save({data:JSON.stringify(baseline)});},{baseline,mockProfile});await reload();}
 socket.close();
}
