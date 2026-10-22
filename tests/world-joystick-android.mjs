// Dedicated synthetic emulator only. Native touch/screencap; no model calls.
// Run once with --snapshot before installing the original-signature upgrade.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<180;i++){if(await evaluate(fn))return;await pause(100);}throw Error('Android joystick UI timed out');}
const data=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
let inset;
async function point(selector){
  const p=await evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:devicePixelRatio};},selector);
  if(!inset){await adb('shell','uiautomator','dump','/sdcard/joystick-window.xml');const xml=(await adb('shell','cat','/sdcard/joystick-window.xml')).stdout;const m=xml.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
  return {x:Math.round(p.x*p.scale+inset.x),y:Math.round(p.y*p.scale+inset.y),scale:p.scale};
}
async function tap(selector){const p=await point(selector);await adb('shell','input','tap',String(p.x),String(p.y));await pause(400);}
async function drag(dx,dy,duration=3000){const p=await point('#world-joystick');await adb('shell','input','swipe',String(p.x),String(p.y),String(Math.round(p.x+dx*p.scale)),String(Math.round(p.y+dy*p.scale)),String(duration));await pause(600);}
async function shot(){await adb('shell','screencap','-p','/sdcard/joystick-native.png');await adb('pull','/sdcard/joystick-native.png','artifacts/joystick-android-room.png');}
try{
  await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  const original=await data();assert.deepEqual(original.characters.map(c=>c.name).sort(),['林','雨'],'synthetic emulator required');
  if(process.argv.includes('--snapshot')){
    await writeFile('artifacts/joystick-upgrade-before.json',JSON.stringify(original));console.log('Saved synthetic upgrade baseline');
  }else{
    const baseline=JSON.parse(await readFile('artifacts/joystick-upgrade-before.json','utf8'));assert.deepEqual(original,baseline,'original SQLite data retained across upgrade');
    const version=await evaluate(()=>Capacitor.Plugins.TUpdate.info());assert.equal(version.versionCode,17);
    await writeFile('artifacts/joystick-upgrade-validation.json',JSON.stringify({version,allSQLiteBusinessDataRetained:true},null,2));
    await evaluate(async()=>{
      const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal),w=(await s.api('/world')).state;
      for(const [actor_id,target] of [[w.residents[0],{x:4,y:6}],[w.residents[1],{x:9,y:10}],['user',{x:5,y:8}]]){
        const current=(await s.api('/world')).state.positions[actor_id];
        if(current.x!==target.x||current.y!==target.y)await s.api('/world/commands','POST',{request_id:'joystick-fixture-'+actor_id+'-'+Date.now(),type:'move',actor_id,target});
      }
    });await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
    await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-joystick').getBoundingClientRect().width>80);
    await wait(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');await pause(400);
    const before=(await data()).world;assert.deepEqual(before.positions.user,{x:5,y:8});
    await drag(40,0);const moved=(await data()).world;
    assert.equal(moved.positions.user.y,8);assert.ok(moved.positions.user.x>=7,'native hold repeats movement');
    assert.equal(moved.tick-before.tick,moved.positions.user.x-5,'one event per completed tile');
    await pause(900);assert.deepEqual((await data()).world,moved,'finger release stops');
    await drag(40,0,2500);assert.deepEqual((await data()).world.positions.user,{x:10,y:8});
    const edge=(await data()).world;await drag(40,0,600);assert.deepEqual((await data()).world,edge,'collision does not save false events');
    await drag(0,40,1000);assert.ok((await data()).world.positions.user.y>8,'native change of direction');
    await shot();
    const p=await evaluate(async()=>{
      const d=JSON.parse((await Capacitor.Plugins.TLocal.load()).data),id=d.world.residents[0],p=d.world.positions[id],r=document.querySelector('#world-canvas').getBoundingClientRect();
      return {x:r.x+(p.x+.5)/12*r.width,y:r.y+(p.y+.25)/13*r.height,scale:devicePixelRatio};
    });await adb('shell','input','tap',String(Math.round(p.x*p.scale+inset.x)),String(Math.round(p.y*p.scale+inset.y)));await wait(()=>document.querySelector('#world-dialogue').open);
    await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-dialogue').open);
    await tap('#home-button');await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-canvas').getBoundingClientRect().width>100);
    const persisted=(await data()).world;await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual((await data()).world,persisted);
    await writeFile('artifacts/joystick-android-validation.json',JSON.stringify({version,upgradeDataRetained:true,nativeTouchHoldReleaseCollisionDirection:true,nativeScreenshot:'joystick-android-room.png',sceneDialogueBackReentry:true,SQLiteRestartRetained:true,tickBefore:before.tick,tickAfter:persisted.tick,models:'none'},null,2));
    console.log('PASS: original-signature upgrade retains all data; Android native joystick hold/release/collision, dialogue/back/reentry, SQLite restart');
  }
}finally{disconnect();}
