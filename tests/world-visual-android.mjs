// Dedicated synthetic emulator only. Native touch + screencap, in-process model mock.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<240;i++){if(await evaluate(fn))return;await pause(100);}throw Error('World native UI timed out');}
const data=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
function retained(actual,expected,path='data'){
  if(expected===null||typeof expected!=='object')return assert.deepEqual(actual,expected,path);
  if(Array.isArray(expected))assert.equal(actual.length,expected.length,path+' array length');
  for(const [k,v] of Object.entries(expected))retained(actual[k],v,path+'.'+k);
}
let inset;
async function point(selector){
  const p=await evaluate(s=>{const e=document.querySelector(s);let r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight){e.scrollIntoView({block:'center'});r=e.getBoundingClientRect();}return {x:r.x+r.width/2,y:r.y+r.height/2,scale:devicePixelRatio};},selector);
  if(!inset){await adb('shell','uiautomator','dump','/sdcard/visual-window.xml');const m=(await adb('shell','cat','/sdcard/visual-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
  return {x:Math.round(p.x*p.scale+inset.x),y:Math.round(p.y*p.scale+inset.y),scale:p.scale};
}
async function tap(selector){const p=await point(selector);await adb('shell','input','tap',String(p.x),String(p.y));await pause(350);}
async function menu(label){await tap('#world-menu-open');await evaluate(label=>{[...document.querySelectorAll('.world-menu-grid button')].find(b=>b.textContent===label).id='visual-menu-target';},label);await tap('#visual-menu-target');}
async function shot(name){await adb('shell','screencap','-p','/sdcard/visual-native.png');await adb('pull','/sdcard/visual-native.png','artifacts/'+name+'.png');}
async function tapCanvas(x,y){const p=await evaluate(([x,y])=>{const r=document.querySelector('#world-canvas').getBoundingClientRect();return {x:r.x+x*r.width,y:r.y+y*r.height,scale:devicePixelRatio};},[x,y]);await adb('shell','input','tap',String(Math.round(p.x*p.scale+inset.x)),String(Math.round(p.y*p.scale+inset.y)));await pause(400);}
try{
  await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  const before=JSON.parse(await readFile('artifacts/visual-upgrade-before.json','utf8')),current=await data();retained(current,before);
  const version=await evaluate(()=>Capacitor.Plugins.TUpdate.info());assert.equal(version.versionCode,18);
  await writeFile('artifacts/visual-upgrade-validation.json',JSON.stringify({allOldBusinessFieldsRetained:true,version},null,2));
  await evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal),w=(await s.api('/world')).state;
    for(const [actor_id,target] of [[w.residents[0],{x:4,y:6}],[w.residents[1],{x:9,y:10}],['user',{x:5,y:8}]]){
      const p=(await s.api('/world')).state.positions[actor_id];if(p.x!==target.x||p.y!==target.y)await s.api('/world/commands','POST',{request_id:'visual-fixture-'+actor_id+'-'+Date.now(),type:'move',actor_id,target});
    }
  });await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  await evaluate(async()=>{const {LocalService}=await import('/assets/local-service.js');window.visualCalls=[];LocalService.prototype.callModel=async function(messages,delta,signal,meta){visualCalls.push({messages,meta});if(signal.aborted)throw Error('cancelled');delta('雨也在房间里。\n\n我去拉一下窗帘。\n[世界行动:{"type":"interact","target_id":"window"}]');};});
  await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');
  const joystick=await point('#world-joystick');await adb('shell','input','swipe',String(joystick.x),String(joystick.y),String(Math.round(joystick.x+40*joystick.scale)),String(joystick.y),'3000');await pause(650);
  let w=(await data()).world;assert.ok(w.positions.user.x>=7);assert.equal(w.facing.user,'right');const stopped=w;await pause(500);assert.deepEqual((await data()).world,stopped);
  await tapCanvas(.1,.74);await wait(()=>!![...document.querySelectorAll('#world-places button')].find(b=>b.dataset.place==='plant'&&!b.disabled));await tap('#world-places [data-place="plant"]');await wait(()=>document.querySelector('#world-action-status').textContent.includes('浇了水'));await shot('visual-android-explore');
  w=(await data()).world;const a=w.residents[0],p=w.positions[a];await tapCanvas((p.x+.5)/12,.4+(p.y-3)*.065-.07);await wait(()=>document.querySelector('#world-dialogue').open);
  await evaluate(()=>{const e=document.querySelector('#world-input');e.value='房间里还有谁？去试一下窗帘。';e.dispatchEvent(new Event('input',{bubbles:true}));});await tap('#world-send');await wait(()=>document.querySelector('#world-dialogue-status').textContent==='已保存对话与世界事件');
  const acted=await data();assert.equal(acted.world.curtain,!before.world.curtain);assert.equal(acted.turns[acted.turns.length-1].world_action.state,'complete');assert.match(await evaluate(()=>visualCalls[0].messages[0].content),/room_occupants/);
  await shot('visual-android-dialogue');const calls=await evaluate(()=>visualCalls.length);await tap('#world-replay');await pause(500);assert.equal(await evaluate(()=>visualCalls.length),calls);assert.deepEqual(await data(),acted,'replay cannot append events/messages');
  const voices=await evaluate(()=>Capacitor.Plugins.TDevice.voices());const speechNotice=await evaluate(()=>document.querySelector('#toast').textContent);
  await tap('#world-records');await wait(()=>document.querySelector('#world-history-dialog').open);await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-history-dialog').open);assert.equal(await evaluate(()=>document.querySelector('#world-dialogue').open),true);
  await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-dialogue').open);
  await menu('人物');await wait(()=>document.querySelector('#world-looks-dialog').open);await evaluate(()=>{const s=document.querySelector('#looks-skin');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});await tap('#looks-save');await wait(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');await shot('visual-android-looks');
  assert.equal((await data()).character_looks.user.skin,1);await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-looks-dialog').open);await tap('#world-menu-open');await shot('visual-android-menu');await adb('shell','input','keyevent','4');
  const saved=await data();await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await data(),saved);await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');
  await writeFile('artifacts/visual-android-validation.json',JSON.stringify({version,upgradeRetained:true,nativeTouchJoystickAndInteraction:true,bottomDialogueAndPortrait:true,model:'in-process mock only',sceneActionPersisted:true,replayNoModelOrWrite:true,ttsVoices:voices.voices.length,ttsNotice:speechNotice,audiblePlaybackVerified:false,nativeHistoryBackAndMenu:true,lookSaveAndRestart:true,screenshots:['visual-android-explore.png','visual-android-dialogue.png','visual-android-looks.png','visual-android-menu.png']},null,2));
  console.log('PASS: native pixels/touch, original-data upgrade, joystick, nearby use, portrait dialogue + scene action, read-only replay, history/back, appearance/menu and restart. Audible Chinese TTS not verified.');
}finally{disconnect();}
