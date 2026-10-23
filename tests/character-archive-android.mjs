// Dedicated synthetic emulator; native buttons/picker, real SQLite and mocked model.
import {adb,connect,evaluate,disconnect,restart} from './embedded-ob-android.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));let before,inset;
async function wait(fn,arg){for(let i=0;i<180;i++){if(await evaluate(fn,arg))return;await pause(150);}throw Error('Native archive condition timed out');}
async function tap(selector){
 const p=await evaluate(s=>{const e=document.querySelector(s);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:(r.x+r.width/2)*devicePixelRatio,y:(r.y+r.height/2)*devicePixelRatio};},selector);
 if(!inset){await adb('shell','uiautomator','dump','/sdcard/archive-window.xml');const m=(await adb('shell','cat','/sdcard/archive-window.xml')).stdout.match(/class="android.webkit.WebView"[^>]*bounds="\[(\d+),(\d+)\]/);assert.ok(m);inset={x:+m[1],y:+m[2]};}
 await adb('shell','input','tap',String(Math.round(p.x+inset.x)),String(Math.round(p.y+inset.y)));await pause(250);
}
async function set(selector,value){await evaluate(({selector,value})=>{const e=document.querySelector(selector);e.value=value;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));},{selector,value});}
const data=()=>evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
async function shot(name){await adb('shell','screencap','-p','/sdcard/archive-native.png');await adb('pull','/sdcard/archive-native.png','artifacts/archive-native-'+name+'.png');}
async function pick(filename,done){
 let roots=false,list=false;
 for(let i=0;i<14;i++){
  if(await evaluate(done))return;
  const path='/sdcard/archive-picker-'+i+'.xml';try{await adb('shell','uiautomator','dump',path);}catch{await pause(500);continue;}
  const xml=(await adb('shell','cat',path)).stdout;await writeFile('artifacts/single-archive-picker.xml',xml);const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const exact=nodes.find(n=>n.includes('text="'+filename+'"'))||nodes.find(n=>n.includes('content-desc="'+filename+','));
  if(exact){
   // This emulator's DocumentsUI accepts keyboard activation reliably; inspect
   // native focus and activate the exact filename, without injecting a result URI.
   for(let k=0;k<24;k++){
    if(await evaluate(done))return;
    const focusPath='/sdcard/archive-focus.xml';await adb('shell','uiautomator','dump',focusPath);const focusXml=(await adb('shell','cat',focusPath)).stdout;
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
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 before=await data();assert.deepEqual(before.characters.map(c=>c.name),['林','雨']);assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,25);
 const owner=before.characters[0].id;
 await tap('[data-app="archive"]');await wait(()=>document.querySelector('#archive-owner').options.length===3);await set('#archive-owner',owner);await wait(()=>document.querySelectorAll('#archive-content .archive-picture-card').length===1);
 let saved=await data();assert.equal(saved.character_archive.items[0].source.type,'legacy_portrait');assert.equal(saved.character_looks[owner].portraits[0].image,before.character_looks[owner].portraits[0].image);
 const png=await evaluate(()=>{const c=document.createElement('canvas');c.width=48;c.height=64;c.getContext('2d').fillStyle='#bb3355';c.getContext('2d').fillRect(0,0,48,64);return c.toDataURL();});await writeFile('artifacts/archive-native-upload.png',Buffer.from(png.split(',')[1],'base64'));await adb('push','artifacts/archive-native-upload.png','/sdcard/Download/archive-expression.png');await adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/archive-expression.png');
 await tap('#archive-tools label');await pick('archive-expression.png',()=>document.querySelector('#archive-status').textContent.includes('图片已保存'));await wait(()=>document.querySelectorAll('#archive-content .archive-picture-card').length===2);
 saved=await data();const asset=saved.character_archive.items.find(a=>a.source.type==='upload');assert.ok(asset);assert.equal(asset.owner_id,owner);assert.equal(asset.image,png);
 await tap('[data-asset="'+asset.id+'"]');await set('#archive-picture-name','得意的林');await tap('#archive-rename');await wait(()=>document.querySelector('#archive-picture-status').textContent==='图片名称已保存');await set('#archive-binding-emotion','new');await set('#archive-expression-name','得意');await tap('#archive-bind');await wait(()=>document.querySelector('#archive-picture-status').textContent.includes('已用于表情'));
 saved=await data();const portrait=saved.character_looks[owner].portraits.find(p=>p.asset_id===asset.id);assert.ok(portrait);assert.equal(await evaluate(()=>document.querySelector('#archive-delete').disabled),true);await shot('picture');
 await evaluate(()=>document.querySelector('#archive-picture-dialog .archive-detail-scroll').scrollTop=9999);assert.equal(await evaluate(()=>{const r=document.querySelector('#archive-picture-close').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;}),true);await tap('#archive-picture-close');await tap('#archive-tab-expressions');await shot('expressions');
 // Persisted picture drives existing world dialogue after an actual app restart.
 await restart();await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');assert.deepEqual(await data(),saved);
 await evaluate(emotion=>{window.archiveCalls=0;import('/assets/local-service.js').then(({LocalService})=>{LocalService.prototype.callModel=async function(messages,delta){archiveCalls++;delta('[情绪:'+emotion+']今天很得意。');};});},portrait.emotion);
 await tap('[data-app="world"]');await wait(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');
 const target=await evaluate(async owner=>{const {actorPoint}=await import('/assets/world-art.js'),d=JSON.parse((await Capacitor.Plugins.TLocal.load()).data),c=document.querySelector('#world-canvas'),r=c.getBoundingClientRect(),p=actorPoint(d.world.positions[owner],r.width,r.height);return {x:(r.x+p.x)*devicePixelRatio,y:(r.y+p.y-r.width*.075)*devicePixelRatio};},owner);await adb('shell','input','tap',String(Math.round(target.x+inset.x)),String(Math.round(target.y+inset.y)));await wait(()=>document.querySelector('#world-dialogue').open);
 await set('#world-input','今天感觉如何？');await tap('#world-send');await wait(()=>document.querySelector('#world-dialogue-status').textContent==='已保存对话与世界事件');assert.equal(await evaluate(()=>window.archiveCalls),1);assert.equal(await evaluate(()=>document.querySelector('#world-portrait img').src),asset.image);await shot('world');
 const result={nativeButtons:true,systemPngPicker:true,nativeKeyboardFileSelection:true,legacyMigration:true,archiveSourceAndBinding:true,sqliteRestart:true,fixedClose:true,worldPortrait:true,mockRequests:1,physicalDevice:false};await writeFile('artifacts/archive-native-validation.json',JSON.stringify(result,null,2));console.log('PASS: Android native archive upload/name/binding, legacy migration, fixed close, SQLite restart and mocked world portrait');
}finally{
 if(before){await adb('shell','am','force-stop','com.google.android.documentsui');await restart();await evaluate(async before=>{const {NativePersistence}=await import('/assets/local-service.js'),p=new NativePersistence(Capacitor.Plugins.TLocal);await p.begin();try{await p.load();await p.save(before);}finally{await p.end();}},before);await restart();}
 disconnect();
}
