// Dedicated synthetic emulator; native input and screencap, no model transport.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,arg){for(let i=0;i<150;i++){if(await evaluate(fn,arg))return;await pause(200);}throw Error('Wardrobe UI timed out');}
let inset;
async function tap(selector){const p=await evaluate(s=>{const e=document.querySelector(s);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};},selector);if(!inset){await adb('shell','uiautomator','dump','/sdcard/wardrobe-window.xml');const m=(await adb('shell','cat','/sdcard/wardrobe-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}await adb('shell','input','tap',String(Math.round(p.x+inset.x)),String(Math.round(p.y+inset.y)));await pause(300);}
async function shot(name){await pause(1200);await adb('shell','screencap','-p','/sdcard/wardrobe-screen.png');await adb('pull','/sdcard/wardrobe-screen.png','artifacts/wardrobe-android-'+name+'.png');}
async function pickPng(){
 await adb('push','artifacts/motion-upload.png','/sdcard/Download/wardrobe-fixture.png');await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/wardrobe-fixture.png');
 await tap('#looks-action-sprite-file');await pause(1000);let openedRoots=false;
 for(let i=0;i<12;i++){
  let xml;try{const path='/sdcard/wardrobe-picker-'+i+'.xml';await adb('shell','uiautomator','dump',path);xml=(await adb('shell','cat',path)).stdout;}catch{await pause(800);continue;}
  const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const file=nodes.find(n=>/(?:text|content-desc)="[^"]*wardrobe-fixture\.png[^"]*"/.test(n));
  const list=nodes.find(n=>/content-desc="List view"/.test(n));
  const target=list||file||nodes.find(n=>/text="(?:Files|文件|Downloads|下载)"/.test(n))||(!openedRoots&&nodes.find(n=>/content-desc="(?:Show roots|显示根目录|Open navigation drawer)"/.test(n)));
  if(target){const m=target.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(m);await adb('shell','input','tap',String(Math.round((+m[1]+ +m[3])/2)),String(Math.round((+m[2]+ +m[4])/2)));if(file&&!list){await pause(1000);return;}openedRoots=true;}
  await pause(600);
 }
 throw Error('Native file picker fixture not found');
}
let before;
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 before=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));assert.deepEqual(before.characters.map(c=>c.name),['林','雨']);
 await tap('[data-app=world]');await wait(()=>document.querySelector('#world-time')?.textContent.includes('居民'));await tap('#world-menu-open');await evaluate(()=>{[...document.querySelectorAll('.world-menu-grid button')].find(b=>b.textContent==='人物').id='native-open-wardrobe';});await tap('#native-open-wardrobe');await wait(()=>document.querySelector('#world-looks-dialog')?.dataset.view==='people');
 await tap('[data-person="'+before.characters[0].id+'"]');await wait(()=>!document.querySelector('#looks-add-skin').disabled);await shot('skins');
 await tap('#looks-add-skin');await wait(()=>document.querySelector('#looks-name-dialog').open);await evaluate(()=>{const i=document.querySelector('#looks-name-input');i.value='原生测试睡衣';i.dispatchEvent(new Event('input',{bubbles:true}));});await tap('#looks-name-dialog button[type=submit]');await wait(()=>document.querySelector('#world-looks-dialog').dataset.view==='editor');
 await tap('#looks-tab-action');assert.equal(await evaluate(()=>document.querySelectorAll('[data-action]').length),6);assert.equal(await evaluate(()=>document.querySelector('#looks-portrait-panel').hidden&&document.querySelector('#looks-sprite-panel').hidden),true);await shot('actions');
 await tap('[data-action=plant]');await wait(()=>document.querySelector('#looks-action-title').textContent==='浇水');assert.equal(await evaluate(()=>document.querySelector('#looks-action-preview-play').textContent),'播放动作');
  let picker=false;if(process.argv.includes('--picker')){await pickPng();try{await wait(()=>document.querySelector('#looks-action-sprite-name').textContent.includes('已上传'));}catch(e){await shot('picker-failure');throw Error(e.message+'; '+await evaluate(()=>document.querySelector('#looks-status').textContent));}picker=true;}
 await shot('action-editor');await tap('#looks-save');await wait(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');
 if(picker)assert.ok(await evaluate(async id=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data).character_looks[id].skins.find(s=>s.name==='原生测试睡衣').actions.plant.image,before.characters[0].id));
 await evaluate(()=>document.querySelector('.looks-scroll').scrollTop=9999);assert.equal(await evaluate(()=>['looks-close','looks-save'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.y>=0&&r.bottom<innerHeight;})),true);
 await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-looks-dialog').open);
 await writeFile('artifacts/wardrobe-android-validation.json',JSON.stringify({nativeTouch:true,nativeScreenshots:true,distinctTabs:true,fixedControls:true,androidBack:true,nativeFilePickerToSavedPng:picker,physicalDevice:false},null,2));console.log('PASS: native wardrobe navigation, independent action page, fixed controls and Android back'+(picker?'; system file picker PNG import and SQLite save':''));
}finally{
 if(before){await evaluate(async before=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{const current=await p.load();if(JSON.stringify(current.characters)!==JSON.stringify(before.characters))throw Error('Fixture identity changed');await p.save(before);}finally{await p.end();}},before);await restart();}
 disconnect();
}
