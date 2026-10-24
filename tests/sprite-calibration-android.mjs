// Dedicated synthetic emulator only. Native touch, screencap and SQLite.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {outfitProbeSource} from './outfit-reuse-probe.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms)),digest=s=>createHash('sha256').update(s).digest('hex');
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
let before,inset;
const read=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
async function wait(fn,arg){for(let i=0;i<150;i++){if(await evaluate(fn,arg))return;await pause(150);}throw Error('Native calibration condition timed out');}
async function position(selector,x=.5,y=.5){
  const p=await evaluate(({selector,x,y})=>{const e=document.querySelector(selector);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width*x)*devicePixelRatio,y:(r.y+r.height*y)*devicePixelRatio};},{selector,x,y});
  if(!inset){await adb('shell','uiautomator','dump','/sdcard/calibration-window.xml');const xml=(await adb('shell','cat','/sdcard/calibration-window.xml')).stdout,m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
  return {x:Math.round(p.x+inset.x),y:Math.round(p.y+inset.y)};
}
async function tap(selector,x=.5,y=.5){const p=await position(selector,x,y);await adb('shell','input','tap',String(p.x),String(p.y));await pause(300);}
async function save(){await tap('#looks-save');await wait(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');}
async function shot(name){await adb('shell','screencap','-p','/sdcard/calibration-native.png');await adb('pull','/sdcard/calibration-native.png','artifacts/calibration-native-'+name+'.png');}
async function fingerprint(){
  const data=await read(),key=(await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout;
  assert.deepEqual(data.characters.map(c=>c.name),['林','雨'],'Requires the dedicated synthetic fixture');
  return {data:digest(stable(data)),credentials:digest(key),version:(await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode};
}
try{
  await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  if(process.argv.includes('--capture')){
    const expected=await fingerprint();assert.equal(expected.version,25);await writeFile('artifacts/calibration-upgrade-before.json',JSON.stringify(expected,null,2));console.log('Captured synthetic code25 business/credential fingerprints');
  }else{
    const expected=JSON.parse(await readFile('artifacts/calibration-upgrade-before.json','utf8')),after=await fingerprint();
    assert.equal(after.version,26);assert.equal(after.data,expected.data);assert.equal(after.credentials,expected.credentials);
    before=await read();const owner=before.characters[0].id;
    const probe=await evaluate(source=>(0,eval)(source),await outfitProbeSource());assert.equal(probe.lpcCanvasCopy,true);assert.equal(probe.piskelFill,true);
    await evaluate(async owner=>{
      const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
      const one=document.createElement('canvas');one.width=48;one.height=64;const x=one.getContext('2d');x.fillStyle='#d53227';x.fillRect(14,12,20,44);
      const sheet=document.createElement('canvas');sheet.width=144;sheet.height=256;for(let r=0;r<4;r++)for(let f=0;f<3;f++)sheet.getContext('2d').drawImage(one,f*48,r*64);
      const image=sheet.toDataURL();await s.api('/character-looks/'+owner,'PATCH',{sprite:{image,frames:3,row_count:4,idle_frame:1,walk_order:[1,0,1,2],frame_editor:{version:1,width:48,height:64,scale:1,base_image:image,cells:{'0_1':{image:one.toDataURL(),scale:1,x:0,y:0}}}}});
    },owner);await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
    await tap('[data-app=world]');await tap('#world-menu-open');await tap('.world-menu-grid button:first-child');
    await tap('[data-person="'+owner+'"]');await tap('.looks-skin-card[data-skin=default] .looks-card-controls button:last-child');await tap('#looks-tab-sprite');
    await wait(()=>!document.querySelector('#looks-walk-editor .looks-calibration').hidden);
    await tap('#looks-walk-editor [data-mode=foot]');await tap('#looks-sprite',.5,.875);
    await tap('#looks-walk-editor [data-mode=head]');await tap('#looks-sprite',.5,.1875);await save();
    let atlas=(await read()).character_looks[owner].sprite;assert.equal(atlas.calibration.foot_y,.875);assert.equal(atlas.calibration.body_height,.6875);
    await tap('#looks-walk-editor [data-mode=drag]');const p=await position('#looks-sprite',.5,.5);
    await adb('shell','input','swipe',String(p.x),String(p.y),String(p.x+33),String(p.y),'400');await pause(300);await save();
    atlas=(await read()).character_looks[owner].sprite;assert.ok(atlas.frame_editor.cells['0_1'].x>0,'native drag updates only the selected frame');
    await tap('#looks-walk-editor [data-mode=foot]');await tap('#looks-walk-editor [data-zoom="2"]');await tap('#looks-walk-editor [data-zoom="1"]');
    await position('#looks-sprite');await pause(400);await shot('editor');await position('#looks-room-preview');await pause(500);await shot('room-preview');
    await tap('#looks-close');await shot('world');const saved=await read();await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await read(),saved);
    await writeFile('artifacts/calibration-native.json',JSON.stringify({upgrade25to26:true,businessAndCredentialsPreserved:true,nativeFootHeadPicking:true,nativeDrag:true,zoomButtons:true,sqliteRestart:true,nativeScreencaps:true,reuseProbe:probe,paidModelCalls:0},null,2));
    console.log('PASS: original-signature upgrade, native foot/head touch, frame drag, zoom, SQLite restart and offline Piskel/LPC probe');
  }
}finally{
  if(before){await evaluate(async before=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(before);}finally{await p.end();}},before);await restart();}
  disconnect();
}
