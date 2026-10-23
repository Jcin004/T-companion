import {openAtlasOptions} from './wardrobe-fixture.mjs';
import {selectPerson,editSkin} from './wardrobe-fixture.mjs';
// Isolated touch fixture. Observe real Canvas draws, never contact a model.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/chat/completions',()=>{throw Error('No model request expected');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const waitSaved=()=>page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');
async function png(colors){
  const data=await page.evaluate(colors=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');for(let y=0;y<4;y++)for(let i=0;i<4;i++){x.fillStyle=colors[i];x.fillRect(i*16,y*16,16,16);}return c.toDataURL().split(',')[1];},colors);
  return Buffer.from(data,'base64');
}
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8015/');await ready();
  await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),s=new BrowserPersistence(),d=emptyData();await s.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await s.save(d);});
  await page.reload();await ready();await page.locator('[data-app="world"]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-canvas[data-drawn="yes"]').waitFor();
  // Capture each rendered user sprite. A refresh to the saved endpoint used to
  // jump one tile forward, then rewind to play that same step.
  await page.evaluate(()=>{window.motionDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='world-canvas'&&args[0].src?.endsWith('/residents.png')&&args.length===9&&args[1]<args[3]*4)motionDraws.push({frame:args[1]/args[3],x:args[5],t:performance.now()});return draw.apply(this,args);};});
  const input=await page.context().newCDPSession(page),r=await page.locator('#world-joystick').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y,id:1}]});await page.waitForTimeout(700);await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);
  const draws=await page.evaluate(()=>motionDraws);assert.ok(draws.length>20);
  for(let i=1;i<draws.length;i++)assert.ok(draws[i].x>=draws[i-1].x,'no forward flash followed by rewind');
  assert.deepEqual([...new Set(draws.map(d=>d.frame))].sort(),[0,1,2,3],'all four ordered poses are actually drawn');assert.equal(draws.at(-1).frame,0,'release returns to standing');
  assert.ok(draws.some((d,i)=>i&&d.x>draws[i-1].x&&d.x-draws[i-1].x<10),'positions interpolate between cells');
  const stopped=await read();await page.waitForTimeout(400);assert.deepEqual(await read(),stopped);
  await page.locator('#world-menu-open').tap();await page.getByRole('button',{name:'人物',exact:true}).tap();await selectPerson(page,'a');await editSkin(page);
  const first=await png(['#a22','#2a2','#22a','#aa2']),second=await png(['#b33','#3b3','#33b','#bb3']);
  await writeFile('artifacts/motion-upload.png',first);
  await page.locator('#looks-portrait-file').setInputFiles({name:'林的立绘.png',mimeType:'image/png',buffer:first});await page.waitForFunction(()=>document.querySelector('#looks-portrait-choice').options[0].text==='林的立绘');
  await page.locator('#looks-tab-sprite').tap();await openAtlasOptions(page,'looks');await page.locator('#looks-import-layout').selectOption('legacy');await page.locator('#looks-sprite-file').setInputFiles({name:'林的小人.png',mimeType:'image/png',buffer:first});await page.waitForFunction(()=>document.querySelector('#looks-sprite-name').textContent.includes('已上传'));
  const pixels=()=>page.locator('#looks-sprite').evaluate(c=>c.getContext('2d').getImageData(10,10,1,1).data.slice(0,3).join(','));
  const idle=await pixels();await page.waitForTimeout(250);assert.equal(await pixels(),idle,'preview starts stationary');
  await page.locator('#looks-preview-play').tap();await page.waitForFunction(()=>document.querySelector('#looks-pose').textContent.includes('第 2 帧'));assert.notEqual(await pixels(),idle);
  await page.locator('#looks-preview-play').tap();assert.equal(await pixels(),idle,'stop restores first uploaded frame');
  await page.locator('#looks-save').tap();await waitSaved();const a=(await read()).character_looks.a;
  await selectPerson(page,'b');await editSkin(page);await page.locator('#looks-tab-sprite').tap();assert.equal(await page.locator('#looks-sprite-name').textContent(),'尚未上传 · 房间继续使用默认小人');
  await page.locator('#looks-tab-portrait').tap();await page.locator('#looks-portrait-file').setInputFiles({name:'雨的立绘.png',mimeType:'image/png',buffer:second});await page.waitForFunction(()=>document.querySelector('#looks-portrait-choice').options[0].text==='雨的立绘');
  await page.locator('#looks-tab-sprite').tap();await openAtlasOptions(page,'looks');await page.locator('#looks-import-layout').selectOption('legacy');await page.locator('#looks-sprite-file').setInputFiles({name:'雨的小人.png',mimeType:'image/png',buffer:second});await page.waitForFunction(()=>document.querySelector('#looks-sprite-name').textContent.includes('已上传'));await page.locator('#looks-save').tap();await waitSaved();
  let d=await read();assert.deepEqual(d.character_looks.a,a);assert.notDeepEqual(d.character_looks.b.sprite,a.sprite);assert.equal(d.characters[0].identity,'合成甲');assert.equal(d.characters[1].identity,'合成乙');
  // A read that finishes after switching person cannot attach to the new one.
  await selectPerson(page,'a');await editSkin(page);await page.locator('#looks-tab-portrait').tap();
  await page.evaluate(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){setTimeout(()=>read.call(this,file),250);};});
  await page.locator('#looks-portrait-file').setInputFiles({name:'不能串人的图片.png',mimeType:'image/png',buffer:first});await selectPerson(page,'b');await editSkin(page);await page.waitForTimeout(550);await page.locator('#looks-save').tap();await waitSaved();assert.deepEqual((await read()).character_looks,d.character_looks);
  await page.locator('#looks-tab-sprite').tap();await page.locator('.looks-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
  const close=await page.locator('#looks-close').boundingBox(),owner=await page.locator('#looks-back').boundingBox(),save=await page.locator('#looks-save').boundingBox();assert.ok(close.y>=0&&close.y+close.height<844);assert.ok(owner.y>=0);assert.ok(save.y+save.height<844);
  await page.screenshot({path:'artifacts/motion-browser-scrolled.png'});await page.locator('#looks-close').tap();assert.equal(await page.locator('#world-looks-dialog').isVisible(),false);
  await page.reload();await ready();assert.deepEqual((await read()).character_looks,d.character_looks);assert.deepEqual(errors,[]);
  console.log('PASS: continuous four-pose interpolation and idle; per-person portrait/sprite uploads, delayed import isolation, fixed close/owner/save, persistence; no model');
}finally{await browser.close();}
