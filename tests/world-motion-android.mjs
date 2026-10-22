// Dedicated synthetic emulator. Native touch/screencap and Canvas draw evidence.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const data=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
async function wait(fn){for(let i=0;i<200;i++){if(await evaluate(fn))return;await pause(100);}throw Error('Native motion UI timed out');}
let inset;
async function point(selector){
  const p=await evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scale:devicePixelRatio};},selector);
  if(!inset){await adb('shell','uiautomator','dump','/sdcard/motion-window.xml');const m=(await adb('shell','cat','/sdcard/motion-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
  return {x:Math.round(p.x*p.scale+inset.x),y:Math.round(p.y*p.scale+inset.y),scale:p.scale};
}
async function tap(s){const p=await point(s);await adb('shell','input','tap',String(p.x),String(p.y));await pause(300);}
async function shot(name){await adb('shell','screencap','-p','/sdcard/motion-native.png');await adb('pull','/sdcard/motion-native.png','artifacts/'+name+'.png');}
try{
  await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  const original=await data();assert.deepEqual(original.characters.map(c=>c.name).sort(),['林','雨']);
  if(process.argv.includes('--snapshot')){
    await evaluate(async()=>{await Capacitor.Plugins.TLocal.lifeCancel();const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);await s.api('/world-life/settings','POST',{enabled:false,background:false});await Capacitor.Plugins.TLocal.lifeSchedule();});
    await writeFile('artifacts/motion-upgrade-before.json',JSON.stringify(await data()));console.log('Saved paused synthetic upgrade baseline');
  }
  else{
    assert.deepEqual(original,JSON.parse(await readFile('artifacts/motion-upgrade-before.json','utf8')),'upgrade retains all business data');const info=await evaluate(()=>Capacitor.Plugins.TUpdate.info());assert.equal(info.versionCode,19);
    await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal),w=(await s.api('/world')).state;await s.api('/world-life/settings','POST',{enabled:false,background:false});await s.api('/character-looks/user','PATCH',{skin:0});for(const [actor_id,target] of [[w.residents[1],{x:9,y:10}],['user',{x:5,y:8}]])await s.api('/world/commands','POST',{type:'move',actor_id,target,request_id:'motion_fixture_'+actor_id+'_'+Date.now()});});
    await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
    await evaluate(async()=>{window.motionDraws=[];const d=JSON.parse((await Capacitor.Plugins.TLocal.load()).data).world,p=d.positions.user;window.motionY=Math.round((.4+(p.y-3)*.065)*960)-Math.round(576*.24);const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='world-canvas'&&a[0].src?.endsWith('/residents.png')&&a.length===9&&a[1]<a[3]*4&&Math.abs(a[6]-motionY)<2)motionDraws.push({frame:a[1]/a[3],x:a[5]});return draw.apply(this,a);};});
    await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');
    const p=await point('#world-joystick');await adb('shell','input','swipe',String(p.x),String(p.y),String(Math.round(p.x+40*p.scale)),String(p.y),'1400');await pause(450);
    const draws=await evaluate(()=>motionDraws);assert.ok(draws.length>20);assert.deepEqual([...new Set(draws.map(d=>d.frame))].sort(),[0,1,2,3]);assert.equal(draws.at(-1).frame,0);for(let i=1;i<draws.length;i++)assert.ok(draws[i].x>=draws[i-1].x,'no saved-endpoint flash/rewind');
    const stopped=await data();await pause(400);assert.deepEqual(await data(),stopped);await shot('motion-android-room');
    await tap('#world-menu-open');await evaluate(()=>{[...document.querySelectorAll('.world-menu-grid button')].find(b=>b.textContent==='人物').id='motion-person';});await tap('#motion-person');await wait(()=>document.querySelector('#world-looks-dialog').open);
    assert.equal(await evaluate(()=>{const r=document.querySelector('#world-looks-dialog').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'entire modal inside native viewport');await shot('motion-android-portrait');
    await tap('#looks-tab-sprite');assert.equal(await evaluate(()=>document.querySelector('#looks-pose').textContent.startsWith('站立')),true);await tap('#looks-preview-play');await pause(220);await tap('#looks-preview-play');assert.equal(await evaluate(()=>document.querySelector('#looks-pose').textContent.startsWith('站立')),true);
    await evaluate(()=>{const e=document.querySelector('.looks-scroll');e.scrollTop=e.scrollHeight;});await pause(150);
    const bounds=await evaluate(()=>['looks-close','looks-owner','looks-save'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.top,r.bottom,innerHeight];}));assert.ok(bounds.every(([t,b,h])=>t>=0&&b<h));await shot('motion-android-scrolled');
    await tap('#looks-close');await wait(()=>!document.querySelector('#world-looks-dialog').open);const saved=await data();await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await data(),saved);
    await writeFile('artifacts/motion-android-validation.json',JSON.stringify({version:info,upgradeRetained:true,nativeTouch:true,fourOrderedFrames:true,interpolatedMovementWithoutRewind:true,releaseStanding:true,fixedHeaderAndClose:true,restartRetained:true,modelCalls:0},null,2));console.log('PASS: original-signature upgrade, native joystick/four poses/idle, separate portrait/sprite pages, scrolled close and restart; no model');
  }
}finally{disconnect();}

