import {connect,evaluate,disconnect,cdp} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.argv[3]!=='emulator-5582')throw Error('Use dedicated Neighborhood emulator only');
const mode=process.argv[4]||'verify';
try{
 await connect(false);
 if(mode==='seed'||mode==='reseed'){
  const fixture=JSON.parse(await readFile('artifacts/neighborhood-upgrade-seed.json','utf8'));
  await evaluate(async ({fixture,reseed})=>{const {NativePersistence}=await import('/assets/local-service.js'),store=new NativePersistence(Capacitor.Plugins.TLocal);await store.begin();try{const current=await store.load();if(current.characters.length&&!(reseed&&current.synthetic_fixture==='neighborhood-upgrade-v1'))throw Error('Requires empty or explicitly marked synthetic dedicated AVD');await store.save(fixture);}finally{await store.end();}},{fixture,reseed:mode==='reseed'});
  console.log('PASS: synthetic 0.24 chat/memory/wardrobe seeded through old native storage');
 }else{
  for(let i=0;i<100;i++){if(await evaluate(()=>document.querySelector('#status')?.textContent==='记录保存在本机'))break;await new Promise(r=>setTimeout(r,100));}
  const status=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService(Capacitor.Plugins.TLocal),before=JSON.stringify(s.data.world.communication.read),phone=await s.api('/world-phone/b');await s.api('/world?location=courtyard');return {version:s.data.world.version,messages:phone.threads.flatMap(t=>t.messages).length,unchanged:before===JSON.stringify(s.data.world.communication.read),recoverable:!!await s.api('/backup/pre-upgrade'),userAgent:navigator.userAgent};});
  assert.equal(status.version,2);assert.ok(status.messages>0);assert.ok(status.unchanged);assert.ok(status.recoverable);
  const wait=async fn=>{for(let i=0;i<100;i++){if(await evaluate(fn))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI timeout');};
  await wait(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
  for(const [name,id] of [['desktop','home'],['world','world'],['phone','roster']]){
   await evaluate(id=>{document.querySelector('#home-button').click();if(id!=='home')document.querySelector('.app-grid [data-app="'+id+'"]').click();},id);
   if(id==='world')await wait(()=>document.querySelector('#world-canvas')?.dataset.drawn==='yes');
   if(id==='roster'){await wait(()=>!!document.querySelector('#characters article .resident-status button'));await evaluate(()=>document.querySelectorAll('#characters article')[1].querySelector('.resident-status button').click());await wait(()=>!!document.querySelector('.resident-phone-reader'));await evaluate(()=>document.querySelector('.reader-content button').click());await wait(()=>document.querySelector('.reader-content')?.textContent.includes('庭院的散步安排'));}
   const screenshot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/neighborhood-android-'+name+'.png',Buffer.from(screenshot.data,'base64'));
  }
  await writeFile('artifacts/neighborhood-android-ui.json',JSON.stringify(status,null,2));console.log('PASS: Android UI reads native saved threads; observer remains read-only; '+status.userAgent);
 }
}finally{disconnect();}
