// Dedicated synthetic emulator. Real system document selection, native touch and SQLite.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));let before,inset;
async function wait(fn,arg){for(let i=0;i<120;i++){if(await evaluate(fn,arg))return;await pause(200);}throw Error('Native frame editor timed out');}
async function tap(s){const p=await evaluate(s=>{const e=document.querySelector(s);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};},s);if(!inset){await adb('shell','uiautomator','dump','/sdcard/frame-window.xml');const m=(await adb('shell','cat','/sdcard/frame-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}await adb('shell','input','tap',String(Math.round(p.x+inset.x)),String(Math.round(p.y+inset.y)));await pause(300);}
async function shot(name){await adb('shell','screencap','-p','/sdcard/frame-native.png');await adb('pull','/sdcard/frame-native.png','artifacts/single-frame-native-'+name+'.png');}
async function pick(filename,done){
 let roots=false,list=false;
 for(let i=0;i<14;i++){
  if(await evaluate(done))return;
  const path='/sdcard/frame-picker-'+i+'.xml';try{await adb('shell','uiautomator','dump',path);}catch{await pause(500);continue;}
  const xml=(await adb('shell','cat',path)).stdout;await writeFile('artifacts/single-frame-picker.xml',xml);const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const exact=nodes.find(n=>n.includes('text="'+filename+'"'))||nodes.find(n=>n.includes('content-desc="'+filename+','));
  if(exact){
   // This emulator's DocumentsUI accepts keyboard activation reliably; inspect
   // native focus and activate the exact filename, without injecting a result URI.
   for(let k=0;k<24;k++){
    if(await evaluate(done))return;
    const focusPath='/sdcard/frame-focus.xml';await adb('shell','uiautomator','dump',focusPath);const focusXml=(await adb('shell','cat',focusPath)).stdout;
    const stack=[];let matches=false;
    for(const token of focusXml.match(/<\/?node\b[^>]*>/g)||[]){
     if(token.startsWith('</')){stack.pop();continue;}
     const focused=token.includes('focused="true"');if(focused||stack.some(v=>v))if(token.includes('text="'+filename+'"')||token.includes('content-desc="'+filename+','))matches=true;
     if(!token.endsWith('/>'))stack.push(focused);
    }
    await adb('shell','input','keyevent',matches?'66':'61');await pause(250);
   }
   throw Error('Native keyboard focus did not select '+filename);
  }
  const listButton=!list&&nodes.find(n=>n.includes('content-desc="List view"'));
  const target=listButton||exact||nodes.find(n=>/text="(?:Downloads|下载|Files|文件)"/.test(n))||(!roots&&nodes.find(n=>/content-desc="(?:Show roots|Open navigation drawer)"/.test(n)));
  if(target){if(target===listButton)list=true;if(/Show roots|Open navigation drawer/.test(target))roots=true;const b=target.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);await adb('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
  await pause(600);
 }
 await shot('picker-failure');throw Error('Native document picker did not return selected '+filename);
}
try{
 await adb('shell','am','force-stop','com.google.android.documentsui');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 before=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));assert.deepEqual(before.characters.map(c=>c.name),['林','雨']);
 await adb('push','artifacts/single-frame.png','/sdcard/Download/single-frame.png');await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/single-frame.png');
 await tap('[data-app=world]');await wait(()=>document.querySelector('#world-time')?.textContent.includes('居民'));await tap('#world-menu-open');await evaluate(()=>[...document.querySelectorAll('.world-menu-grid button')].find(b=>b.textContent==='人物').id='frame-people');await tap('#frame-people');await wait(()=>document.querySelector('#world-looks-dialog')?.dataset.view==='people');await tap('[data-person="'+before.characters[0].id+'"]');await wait(()=>!document.querySelector('#looks-add-skin').disabled);await tap('.looks-skin-card[data-skin=default] .looks-card-controls button:last-child');await wait(()=>document.querySelector('#world-looks-dialog').dataset.view==='editor');await tap('#looks-tab-sprite');
 await tap('#looks-walk-editor [data-direction=down][data-frame="1"]');await tap('#looks-walk-editor .looks-selected-upload .file-button');await pick('single-frame.png',()=>document.querySelector('#looks-sprite-name')?.textContent.includes('已替换'));await wait(()=>!document.querySelector('#looks-frame-adjustments').hidden);
 await wait(()=>!document.querySelector('#looks-save').disabled);await shot('before-save');await tap('#looks-save');await pause(500);console.log('Native save status:',await evaluate(()=>document.querySelector('#looks-status').textContent));await wait(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');let saved=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));const editor=saved.character_looks[before.characters[0].id].sprite.frame_editor;assert.equal(editor.cells['0_1'].image,'data:image/png;base64,'+(await readFile('artifacts/single-frame.png')).toString('base64'));assert.equal(editor.cells['0_1'].scale,editor.scale);await shot('saved');
 // Confirm the original image and parameters survive a real process restart.
 await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data)),saved);
 // Verify the existing JSON route on the same native picker adapter.
 await writeFile('artifacts/single-frame-backup.json',JSON.stringify({fixture:'native backup route'}));await adb('push','artifacts/single-frame-backup.json','/sdcard/Download/single-frame-backup.json');
 await evaluate(()=>{window.frameBackupResult=null;Capacitor.Plugins.TDevice.importFile().then(r=>window.frameBackupResult=JSON.parse(r.data)).catch(e=>window.frameBackupResult={error:e.message});return true;});
 await pick('single-frame-backup.json',()=>!!window.frameBackupResult);assert.deepEqual(await evaluate(()=>window.frameBackupResult),{fixture:'native backup route'});
 // Cancelling image selection does not alter business data or report success.
 await evaluate(()=>{window.frameCancelResult=null;Capacitor.Plugins.TDevice.importFile({image:true}).then(()=>window.frameCancelResult='unexpected success').catch(e=>window.frameCancelResult=e.code);return true;});await pause(600);
 for(let k=0;k<4;k++){if(await evaluate(()=>!!window.frameCancelResult))break;await adb('shell','input','keyevent','4');await pause(400);}
 assert.equal(await evaluate(()=>window.frameCancelResult),'image_cancelled');assert.deepEqual(await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data)),saved);
 await writeFile('artifacts/single-frame-native.json',JSON.stringify({nativeTouch:true,systemPickerReturn:true,selectedPngSaved:true,originalSourceAndAlignmentPersisted:true,sqliteRestart:true,nativeKeyboardFileSelection:true,jsonBackupRoute:true,cancelPreservesData:true,modelCalls:0},null,2));console.log('PASS: native single-frame document picker returns PNG, selected slot saves original/alignment in SQLite and survives restart');
}finally{
 if(before){await adb('shell','am','force-stop','com.google.android.documentsui');await restart();await evaluate(async before=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(before);}finally{await p.end();}},before);await restart();}
 disconnect();
}
