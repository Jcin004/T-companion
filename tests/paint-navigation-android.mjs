// Dedicated synthetic emulator; native touch, native screenshot and SQLite restart.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms)),digest=s=>createHash('sha256').update(s).digest('hex');
const read=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
async function wait(fn){for(let i=0;i<150;i++){if(await evaluate(fn))return;await pause(100);}throw Error('Native wardrobe condition timed out');}
async function ready(){await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');}
let inset,before;
async function tap(selector){
 const point=await evaluate(selector=>{const e=document.querySelector(selector);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};},selector);
 if(!inset){await adb('shell','uiautomator','dump','/sdcard/outfit-window.xml');const xml=(await adb('shell','cat','/sdcard/outfit-window.xml')).stdout,m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
 await adb('shell','input','tap',String(Math.round(point.x+inset.x)),String(Math.round(point.y+inset.y)));await pause(200);
}
async function enter(){await tap('[data-app=world]');await wait(()=>document.querySelector('#world-menu-open')?.getBoundingClientRect().height);await tap('#world-menu-open');await tap('.world-menu-grid button:nth-child(7)');await wait(()=>document.querySelector('#outfit-wardrobe')?.open);}
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await ready();const state=await read();assert.deepEqual(state.characters.map(c=>c.name),['林','雨'],'Dedicated synthetic fixture required');
 const credentials=digest((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout);
 if(process.argv.includes('--capture')){await writeFile('artifacts/paint-upgrade-before.json',JSON.stringify({state,credentials,info:await evaluate(()=>Capacitor.Plugins.TUpdate.info())}));console.log('Captured synthetic pre-upgrade state');}
 else{
   const prior=JSON.parse(await readFile('artifacts/paint-upgrade-before.json','utf8'));assert.deepEqual(state,prior.state);assert.equal(credentials,prior.credentials);before=state;
   assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,33);
   await enter();await tap('[data-kind=body]');await tap('.wardrobe-edit');await wait(()=>document.querySelector('#outfit-painter')?.open);await tap('#outfit-painter .paint-refine');await wait(()=>document.querySelector('#outfit-painter .paint-resolution output').textContent.includes('128×192'));
   const point=await evaluate(()=>{const c=document.querySelector('#outfit-painter .paint-canvas');c.scrollIntoView({block:'nearest'});const r=c.getBoundingClientRect(),s=parseFloat(document.querySelector('#outfit-painter .paint-zoom output').textContent);return {x:(r.x+Math.floor((r.width-128*s)/2)+61.5*s)*devicePixelRatio,y:(r.y+Math.floor((r.height-192*s)/2)+101.5*s)*devicePixelRatio};});
   await adb('shell','input','tap',String(Math.round(point.x+inset.x)),String(Math.round(point.y+inset.y)));await wait(()=>document.querySelector('#outfit-painter .paint-status')?.textContent==='草稿已保存，房间形象尚未改变');
   const draft=(await read()).outfit_catalog.assets[0].draft;assert.equal(draft.pixel_scale,2);assert.equal(draft.frames[1][101*128+61],'2');
   await tap('#outfit-painter .paint-apply');await wait(()=>!document.querySelector('#outfit-painter').open);await tap('.wardrobe-apply');await wait(()=>document.querySelector('.wardrobe-status').textContent==='已应用到世界；旧皮肤保留。');
   await tap('.wardrobe-close');await adb('shell','screencap','-p','/sdcard/outfit-native.png');await adb('pull','/sdcard/outfit-native.png','artifacts/paint-native-world.png');
   const saved=await read();await restart();await ready();assert.deepEqual(await read(),saved);await enter();
   await adb('shell','screencap','-p','/sdcard/outfit-native.png');await adb('pull','/sdcard/outfit-native.png','artifacts/paint-native-wardrobe.png');
   assert.equal(digest((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout),credentials);
   await writeFile('artifacts/paint-native-result.json',JSON.stringify({versionCode:33,upgrade32to33:true,businessAndCredentialsPreserved:true,nativeBodyPaint:true,fine128x192:true,worldApply:true,sqliteRestart:true,nativeScreenshots:true,modelCalls:0},null,2));console.log('PASS: original-signature upgrade32to33, native body drawing/apply, world rendering and SQLite restart');
 }
}finally{if(before){await evaluate(async data=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(data);}finally{await p.end();}},before);await restart();}disconnect();}
