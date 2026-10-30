// Dedicated synthetic emulator only. Native touch/screencap + SQLite, no models.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms)),stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),digest=s=>createHash('sha256').update(s).digest('hex');
let before,inset,restore=false;
const read=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
async function wait(fn,arg){for(let i=0;i<150;i++){if(await evaluate(fn,arg))return;await pause(100);}throw Error('Native clothing condition timed out');}
async function ready(){await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');}
async function offset(){if(inset)return inset;await adb('shell','uiautomator','dump','/sdcard/clothing-window.xml');const xml=(await adb('shell','cat','/sdcard/clothing-window.xml')).stdout,m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);return inset={x:+m[1],y:+m[2]};}
async function tap(selector){
 const p=await evaluate(selector=>{const e=document.querySelector(selector);if(!e)throw Error('Missing '+selector);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();if(!r.height)throw Error('Hidden '+selector);return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};},selector),o=await offset();
 await adb('shell','input','tap',String(Math.round(p.x+o.x)),String(Math.round(p.y+o.y)));await pause(250);
}
async function paint(x,y,toX=x){
 const points=await evaluate(({x,y,toX})=>{const c=document.querySelector('.paint-canvas');c.scrollIntoView({block:'nearest'});const r=c.getBoundingClientRect(),s=Math.max(1,Math.floor(Math.min(r.width/64,r.height/96))),left=r.x+Math.floor((r.width-64*s)/2),top=r.y+Math.floor((r.height-96*s)/2);return [x,toX].map(n=>({x:(left+(n+.5)*s)*devicePixelRatio,y:(top+(y+.5)*s)*devicePixelRatio}));},{x,y,toX}),o=await offset();
 await adb('shell','input','swipe',String(Math.round(points[0].x+o.x)),String(Math.round(points[0].y+o.y)),String(Math.round(points[1].x+o.x)),String(Math.round(points[1].y+o.y)),'400');
 await wait(()=>document.querySelector('.paint-status')?.textContent==='草稿已保存，房间形象尚未改变');
}
async function shot(name){await adb('shell','screencap','-p','/sdcard/clothing-native.png');await adb('pull','/sdcard/clothing-native.png','artifacts/clothing-native-'+name+'.png');}
async function visibleNavigation(){
 const bounds=await evaluate(()=>['.paint-close','.paint-apply'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:innerWidth,height:innerHeight};}));
 for(const r of bounds)assert.ok(r.top>=0&&r.bottom<=r.height&&r.left>=0&&r.right<=r.width,JSON.stringify(r));
}
async function wardrobe(owner){
 await tap('[data-app=world]');await wait(()=>document.querySelector('#world-menu-open')?.getBoundingClientRect().height);
 await tap('#world-menu-open');await wait(()=>document.querySelector('.world-menu-grid')?.getBoundingClientRect().height);
 await tap('.world-menu-grid button:first-child');
 await tap('[data-person="'+owner+'"]');await wait(()=>document.querySelector('#looks-add-skin')?.disabled===false);
}
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await ready();before=await read();assert.deepEqual(before.characters.map(c=>c.name),['林','雨'],'Dedicated synthetic fixture required');
 const version=(await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,credentials=digest((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout);
 if(process.argv.includes('--capture')){
   assert.equal(version,29);await writeFile('artifacts/clothing-upgrade-before.json',JSON.stringify({version,data:digest(stable(before)),credentials},null,2));console.log('Captured synthetic 0.18.3 business and encrypted credential fingerprints');
 }else{
   const expected=JSON.parse(await readFile('artifacts/clothing-upgrade-before.json','utf8'));assert.equal(version,30);assert.equal(digest(stable(before)),expected.data);assert.equal(credentials,expected.credentials);restore=true;
   const owner=before.characters[0].id;await wardrobe(owner);await tap('#looks-add-skin');
   await evaluate(()=>{const e=document.querySelector('#looks-name-input');e.value='paint_trial';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await tap('[name=skin-create-mode][value=draw]');await tap('#looks-name-dialog button[type=submit]');await wait(()=>document.querySelector('#clothing-workbench')?.open);
   await visibleNavigation();
   await evaluate(()=>{const scroll=document.querySelector('.paint-scroll');scroll.scrollTop=scroll.scrollHeight;});await visibleNavigation();await shot('scrolled');
   await evaluate(()=>{document.querySelector('.paint-scroll').scrollTop=0;});
   const data=await read(),skin=data.character_looks[owner].skins.find(s=>s.name==='paint_trial').id;
   await tap('[data-unit="4"]');await tap('[data-color="9"]');await paint(12,50,28);
   let state=(await read()).character_looks[owner].skins.find(s=>s.id===skin);assert.ok(state.drawing?.draft);assert.equal(state.sprite,null);assert.equal(state.drawing.draft.frames[1][48*64+12],'9');assert.equal(state.drawing.draft.frames[0][48*64+12],'0');
   const first=state.drawing.draft.frames[1];await tap('.paint-undo');await wait(()=>document.querySelector('.paint-status').textContent==='草稿已保存，房间形象尚未改变');await tap('.paint-redo');await wait(()=>document.querySelector('.paint-status').textContent==='草稿已保存，房间形象尚未改变');assert.equal((await read()).character_looks[owner].skins.find(s=>s.id===skin).drawing.draft.frames[1],first);
   await tap('[data-pose="0"]');await paint(8,16);state=(await read()).character_looks[owner].skins.find(s=>s.id===skin);assert.equal(state.drawing.draft.frames[0][16*64+8],'9');assert.equal(state.drawing.draft.frames[1],first);
   await visibleNavigation();await shot('workbench');await tap('.paint-close');const draft=state.drawing.draft;await restart();await ready();assert.deepEqual((await read()).character_looks[owner].skins.find(s=>s.id===skin).drawing.draft,draft);
   await wardrobe(owner);await tap('.looks-skin-card[data-skin="'+skin+'"] .looks-paint-open');await wait(()=>document.querySelector('#clothing-workbench')?.open);await tap('.paint-apply');await wait(()=>!document.querySelector('#clothing-workbench').open);
   const applied=(await read()).character_looks[owner].skins.find(s=>s.id===skin);assert.deepEqual(applied.drawing.project,draft);assert.equal(applied.drawing.draft,undefined);assert.equal(applied.sprite.frames,3);assert.equal(applied.ai_allowed,false);
   await tap('.looks-skin-card[data-skin="'+skin+'"] .looks-card-controls button:first-child');await tap('#looks-close');await wait(()=>document.querySelector('#world-canvas')?.getBoundingClientRect().height);await shot('world');
   const saved=await read();await restart();await ready();assert.deepEqual(await read(),saved);assert.equal(digest((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout),expected.credentials);
   await writeFile('artifacts/clothing-native.json',JSON.stringify({versionCode:30,upgrade29to30:true,businessAndCredentialsPreserved:true,nativeGridStroke:true,nativeUndoRedo:true,frameIsolation:true,draftSqliteRestart:true,atomicApply:true,wearInWorld:true,nativeScreenshots:true,modelCalls:0},null,2));console.log('PASS: native pixel painting, independent frames, SQLite restart, wardrobe/world and original-signature upgrade29to30');
 }
}finally{
 if(restore){await evaluate(async data=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(data);}finally{await p.end();}},before);await restart();}disconnect();
}
