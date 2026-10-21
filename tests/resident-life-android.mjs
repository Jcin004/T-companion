// Synthetic dedicated emulator only. Run after ResidentLifeInstrumentation.
// node tests/resident-life-android.mjs <adb> emulator-5558
import {adb,connect,evaluate,cdp,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<150;i++){if(await evaluate(fn))return;await pause(100);}throw Error('Native UI timed out');}
let inset;
async function tap(selector){
 const p=await evaluate(selector=>{const e=document.querySelector(selector);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:devicePixelRatio};},selector);
 if(!inset){await adb('shell','uiautomator','dump','/sdcard/life-window.xml');const xml=(await adb('shell','cat','/sdcard/life-window.xml')).stdout;const m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
 await adb('shell','input','tap',String(Math.round(p.x*p.scale+inset.x)),String(Math.round(p.y*p.scale+inset.y)));await pause(350);
}
async function shot(name){await adb('shell','screencap','-p','/sdcard/life-native.png');await adb('pull','/sdcard/life-native.png','artifacts/'+name+'.png');}
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 const baseline=JSON.parse(await readFile('artifacts/life-upgrade-before.json','utf8'));
 const current=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);return {data:await s.api('/backup'),version:await Capacitor.Plugins.TUpdate.info()};});
 assert.equal(current.version.versionCode,16);
 for(const key of ['characters','settings','api_profiles','api_groups','turns','drafts'])assert.deepEqual(current.data[key],baseline[key],'upgrade retained '+key);
 for(const m of baseline.messages)assert.deepEqual(current.data.messages.find(x=>x.id===m.id),m,'old message retained');
 for(const e of baseline.world.events)assert.deepEqual(current.data.world.events.find(x=>x.id===e.id),e,'old event retained');
 for(const m of baseline.memory.events)assert.deepEqual(current.data.memory.events.find(x=>x.id===m.id),m,'old memory retained');
 assert.ok(current.data.messages.some(m=>m.origin==='world_share'));assert.ok(current.data.world.events.some(e=>e.source.type==='resident_dialogue'));
 await tap('.app-grid [data-app="chat"]');await wait(()=>!!document.querySelector('#contacts .unread'));
 await shot('life-android-inbox');await tap('#contacts .contact');await wait(()=>!![...document.querySelectorAll('#messages button')].find(b=>b.textContent==='事件来源'));
 await evaluate(()=>[...document.querySelectorAll('#messages button')].find(b=>b.textContent==='事件来源').id='life-source-test');await tap('#life-source-test');await wait(()=>document.querySelector('#world-source-dialog').open);await shot('life-android-source');
 await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-source-dialog').open);
 await tap('#home-button');await tap('.app-grid [data-app="world"]');
 await wait(()=>{const c=document.querySelector('#world-canvas');return c?.dataset.drawn==='yes'&&c.getBoundingClientRect().width>100&&c.getContext('2d').getImageData(130,170,1,1).data[3]===255;});
 await evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await pause(400);await shot('life-android-room');
 const palette=await evaluate(()=>{const c=document.querySelector('#world-canvas').getContext('2d');return [[5,5],[190,25],[130,170],[35,78]].map(([x,y])=>Array.from(c.getImageData(x,y,1,1).data));});assert.ok(new Set(palette.map(JSON.stringify)).size>=3);
 const clicked=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal),w=(await s.api('/world')).state;const actor=w.residents[0],p=w.positions[actor],r=document.querySelector('#world-canvas').getBoundingClientRect();return {x:r.x+(p.x+.5)/12*r.width,y:r.y+(p.y+.25)/13*r.height,scale:devicePixelRatio};});
 await adb('shell','input','tap',String(Math.round(clicked.x*clicked.scale+inset.x)),String(Math.round(clicked.y*clicked.scale+inset.y)));await wait(()=>document.querySelector('#world-dialogue').open);await shot('life-android-dialogue');
 await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-dialogue').open);await tap('#home-button');await tap('.app-grid [data-app="world"]');await wait(()=>document.querySelector('#world-canvas').getBoundingClientRect().width>100);
 const before=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data).world);await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 const after=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data).world);assert.deepEqual(after,before);
 await writeFile('artifacts/life-android-ui-validation.json',JSON.stringify({version:current.version,originalDataRetained:true,nativeScreenshots:true,paintedPalette:palette,touchInboxSourceDialogueBackReentry:true,worldRestartRetained:true,eventCount:after.events.length,model:'instrumentation mock only; UI verification makes no model request'},null,2));
 console.log('PASS: original data retained, Android native pixels and screenshots, unread inbox/source, touch conversation/back/reentry and restart');
}finally{disconnect();}
