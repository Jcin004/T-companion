// Dedicated synthetic Android emulator: native touch, screenshot and system picker.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let before,inset;
async function wait(fn,arg){for(let i=0;i<120;i++){if(await evaluate(fn,arg))return;await pause(200);}throw Error('Sprite workshop UI timed out');}
async function point(selector){const p=await evaluate(s=>{const e=document.querySelector(s);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio,scale:devicePixelRatio};},selector);if(!inset){await adb('shell','uiautomator','dump','/sdcard/workshop-window.xml');const m=(await adb('shell','cat','/sdcard/workshop-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}return {x:Math.round(p.x+inset.x),y:Math.round(p.y+inset.y),scale:p.scale};}
async function tap(s){const p=await point(s);await adb('shell','input','tap',String(p.x),String(p.y));await pause(250);}
async function shot(name){await adb('shell','screencap','-p','/sdcard/workshop-screen.png');await adb('pull','/sdcard/workshop-screen.png','artifacts/workshop-native-'+name+'.png');}
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 before=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));assert.deepEqual(before.characters.map(c=>c.name),['林','雨']);
 await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal),w=(await s.api('/world')).state;await s.api('/world-life/settings','POST',{enabled:false,background:false});await s.api('/character-looks/user','PATCH',{skin:0,sprite:null});for(const [actor_id,target]of [[w.residents[1],{x:9,y:10}],['user',{x:5,y:8}]])if(w.positions[actor_id].x!==target.x||w.positions[actor_id].y!==target.y)await s.api('/world/commands','POST',{type:'move',actor_id,target,request_id:'workshop_setup_'+actor_id+'_'+Date.now()});});
 await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 await evaluate(()=>{window.workshopDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='world-canvas'&&a[0].src?.endsWith('/residents.png')&&a.length===9&&a[1]<a[3]*4)workshopDraws.push({x:a[5],frame:a[1]/a[3],t:performance.now()});return draw.apply(this,a);};});
 await tap('[data-app=world]');await wait(()=>document.querySelector('#world-canvas')?.dataset.drawn==='yes');
 const p=await point('#world-joystick');await adb('shell','input','swipe',String(p.x),String(p.y),String(Math.round(p.x+40*p.scale)),String(p.y),'1000');await pause(450);
 const draws=await evaluate(()=>workshopDraws);assert.ok(draws.length>20);assert.ok(draws.slice(1).every((d,i)=>d.x>=draws[i].x),'no forward flash then rewind');assert.equal(draws.at(-1).frame,0);assert.deepEqual([...new Set(draws.map(d=>d.frame))].sort(),[0,1,2,3]);await shot('room');
 await tap('#world-menu-open');await evaluate(()=>{[...document.querySelectorAll('.world-menu-grid button')].find(b=>b.textContent==='人物').id='workshop-open-people';});await tap('#workshop-open-people');await wait(()=>document.querySelector('#world-looks-dialog')?.dataset.view==='people');
 await tap('[data-person="'+before.characters[0].id+'"]');await wait(()=>!document.querySelector('#looks-add-skin').disabled);await tap('.looks-skin-card[data-skin="default"] button:last-child');await wait(()=>document.querySelector('#world-looks-dialog').dataset.view==='editor');await tap('#looks-tab-sprite');
 assert.equal(await evaluate(()=>document.querySelectorAll('#looks-walk-editor .looks-sheet-grid button').length),12);await shot('grid');
 await tap('#looks-tab-portrait');await tap('#looks-add-expression');await evaluate(()=>{document.querySelector('#looks-name-input').value='原生测试微笑';});await tap('#looks-name-dialog button[type=submit]');await wait(()=>document.querySelector('#looks-expression-cards [aria-pressed=true]').textContent.includes('原生测试微笑'));
 await tap('#looks-tab-action');await tap('#looks-category-gesture');await tap('#looks-add-gesture');await evaluate(()=>{document.querySelector('#looks-name-input').value='原生测试挥手';});await tap('#looks-name-dialog button[type=submit]');await wait(()=>document.querySelector('#looks-action-title').textContent==='原生测试挥手');
 // Use a real PNG and native document picker. No DOM file injection.
 await adb('push','artifacts/workshop-sheet.png','/sdcard/Download/workshop-sheet.png');await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/workshop-sheet.png');
 await evaluate(()=>{const e=document.querySelector('#looks-action-import-layout');e.value='three';e.dispatchEvent(new Event('change',{bubbles:true}));});
 if(process.argv.includes('--picker')){await tap('#looks-action-editor .file-button');await pause(1000);}
 if(process.argv.includes('--picker')){
  let picked=false,openedRoots=false;
  for(let i=0;i<10;i++){
   if(await evaluate(()=>document.querySelector('#looks-action-sprite-name').textContent.includes('已上传'))){picked=true;break;}
   const file='/sdcard/workshop-picker-'+i+'.xml';try{await adb('shell','uiautomator','dump',file);}catch{await pause(500);continue;}
   const xml=(await adb('shell','cat',file)).stdout;await writeFile('artifacts/workshop-picker-latest.xml',xml);const nodes=xml.match(/<node\b[^>]*>/g)||[];
   const target=nodes.find(n=>/(?:text|content-desc)="[^"]*workshop-sheet\.png[^"]*"/.test(n))||nodes.find(n=>/text="(?:Files|文件|Downloads|下载)"/.test(n))||(!openedRoots&&nodes.find(n=>/content-desc="(?:Show roots|显示根目录|Open navigation drawer)"/.test(n)));
   if(target){if(/content-desc="(?:Show roots|显示根目录|Open navigation drawer)"/.test(target))openedRoots=true;const m=target.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);await adb('shell','input','tap',String(Math.round((+m[1]+ +m[3])/2)),String(Math.round((+m[2]+ +m[4])/2)));}
   await pause(700);
  }
  await shot('picker-result');assert.ok(picked,'native PNG picker must return to editor');
 }
 await tap('#looks-save');await wait(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');
 const saved=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));const look=saved.character_looks[before.characters[0].id];assert.ok(Object.values(look.expressions).includes('原生测试微笑'));assert.ok(Object.values(look.gestures).some(g=>g.name==='原生测试挥手'));
 if(process.argv.includes('--picker'))assert.ok(Object.values(look.gestures).find(g=>g.name==='原生测试挥手').atlas.image.startsWith('data:image/png;'));
 await evaluate(()=>document.querySelector('.looks-scroll').scrollTop=99999);assert.ok(await evaluate(()=>['looks-back','looks-close','looks-save'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})));await shot('gesture');await adb('shell','input','keyevent','4');await wait(()=>!document.querySelector('#world-looks-dialog').open);await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data)),saved);
 await writeFile('artifacts/workshop-native.json',JSON.stringify({nativeTouch:true,nativeScreenshots:true,worldVisible:true,orderedFrames:true,idleOnRelease:true,grid:true,customExpressions:true,customGestures:true,pngPickerToSaved:process.argv.includes('--picker'),restartRetained:true,modelCalls:0},null,2));console.log('PASS: native smooth movement/idle, world screenshot, grid, custom expression/gesture creation, fixed controls, Android back, SQLite and restart'+(process.argv.includes('--picker')?', real system PNG picker return/save':''));
}finally{
 if(before){await evaluate(async before=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(before);}finally{await p.end();}},before);await restart();}
 disconnect();
}
