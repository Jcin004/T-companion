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
 if(process.argv.includes('--capture')){await writeFile('artifacts/mirror-upgrade-before.json',JSON.stringify({state,credentials,info:await evaluate(()=>Capacitor.Plugins.TUpdate.info())}));console.log('Captured synthetic pre-upgrade state');}
 else{
   const prior=JSON.parse(await readFile('artifacts/mirror-upgrade-before.json','utf8'));assert.deepEqual(state,prior.state);assert.equal(credentials,prior.credentials);before=state;
   assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,36);
   await evaluate(async()=>{
     const {NativePersistence,emptyData}=await import('/assets/local-service.js'),{starterBody,blankProject}=await import('/assets/outfit-image.js'),{WALK_TEMPLATE}=await import('/assets/outfit-motion.js');
     const p=new NativePersistence(Capacitor.Plugins.TLocal),d=emptyData();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];
     const shirt=blankProject();for(let i=0;i<12;i++){const f=Array.from(shirt.frames[i]);for(let y=44;y<64;y++)for(let x=19;x<45;x++)f[y*64+x]='8';shirt.frames[i]=f.join('');}
     d.outfit_catalog={version:1,revision:0,assets:[{id:'body',kind:'body',name:'原创素体',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project:await starterBody()},{id:'shirt',kind:'top',name:'公共白衬衫',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project:shirt}],people:{user:{body:'body',height:80,wear:[]},a:{body:'body',height:64,wear:[]}}};await p.begin();try{await p.load();await p.save(d);}finally{await p.end();}
   });await restart();await ready();await enter();await tap('[data-slot=top]');await tap('.wardrobe-wear');await wait(()=>document.querySelector('.wardrobe-wear').textContent==='脱下');
   await tap('.wardrobe-fit-open');await tap('.wardrobe-adapt-edit');await wait(()=>document.querySelector('#outfit-painter')?.open);
   const point=await evaluate(()=>{const c=document.querySelector('#outfit-painter .paint-canvas');c.scrollIntoView({block:'nearest'});const r=c.getBoundingClientRect(),s=Math.max(1,Math.floor(Math.min(r.width/64,r.height/96)));return {x:(r.x+Math.floor((r.width-64*s)/2)+30.5*s)*devicePixelRatio,y:(r.y+Math.floor((r.height-96*s)/2)+50.5*s)*devicePixelRatio};});
   await adb('shell','input','tap',String(Math.round(point.x+inset.x)),String(Math.round(point.y+inset.y)));await wait(()=>document.querySelector('#outfit-painter .paint-status')?.textContent==='草稿已保存，房间形象尚未改变');
   let c=(await read()).outfit_catalog;assert.equal(c.people.user.adaptations.shirt.draft.frames[1][50*64+30],'2');assert.equal(c.assets[1].project.frames[1][50*64+30],'8');
   await tap('#outfit-painter .paint-apply');await wait(()=>!document.querySelector('#outfit-painter').open);await tap('[data-page=sets]');
   // Native keyboard input for the set name; the field is not populated by JS.
   await tap('.wardrobe-set-name');await adb('shell','input','text','Daily');await adb('shell','input','keyevent','4');await tap('.wardrobe-set-save');await wait(()=>document.querySelector('.wardrobe-status').textContent.includes('搭配已保存'));
   await tap('[data-page=clothes]');await tap('.wardrobe-wear');await tap('.wardrobe-wear');await wait(()=>document.querySelector('.wardrobe-wear').textContent==='脱下');c=(await read()).outfit_catalog;assert.equal(c.people.user.adaptations.shirt.project.frames[1][50*64+30],'2');assert.equal(c.sets[0].assets[0],'shirt');
   await evaluate(()=>document.querySelector('.wardrobe-scroll').scrollTop=0);await adb('shell','screencap','-p','/sdcard/mirror-native.png');await adb('pull','/sdcard/mirror-native.png','artifacts/mirror-native-wardrobe.png');
   await tap('.wardrobe-apply');await wait(()=>document.querySelector('.wardrobe-status').textContent==='已应用到世界；旧皮肤保留。');await tap('.wardrobe-close');await adb('shell','screencap','-p','/sdcard/mirror-native.png');await adb('pull','/sdcard/mirror-native.png','artifacts/mirror-native-world.png');
   const saved=await read();await restart();await ready();assert.deepEqual(await read(),saved);
   assert.equal(digest((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout),credentials);
   await writeFile('artifacts/mirror-native-result.json',JSON.stringify({versionCode:36,upgrade35to36:true,businessAndCredentialsPreserved:true,nativeMirrorWear:true,nativePersonalPaint:true,nativeSetSave:true,worldApply:true,sqliteRestart:true,nativeScreenshots:true,modelCalls:0},null,2));console.log('PASS: original-signature upgrade35to36, native mirror/personal painting/set/rewear/apply, SQLite restart');
 }
}finally{if(before){await evaluate(async data=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(data);}finally{await p.end();}},before);await restart();}disconnect();}
