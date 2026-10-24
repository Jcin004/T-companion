import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {selectPerson,editSkin} from './wardrobe-fixture.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:780},isMobile:true,hasTouch:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No provider expected');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const save=async()=>{await page.locator('#looks-save').tap();await page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');};
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
  await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence();await p.load();const d=emptyData();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await p.save(d);});await page.reload();await ready();
  await page.locator('[data-app=world]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'人物',exact:true}).tap();await selectPerson(page,'a');await editSkin(page);await page.locator('#looks-tab-sprite').tap();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=48;c.height=64;const x=c.getContext('2d');x.fillStyle='#d53227';x.fillRect(14,12,20,44);return c.toDataURL().split(',')[1];});
  await page.locator('#looks-frame-file').setInputFiles({name:'padded.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelector('#looks-walk-editor .looks-calibration').hidden===false);
  const panel=page.locator('#looks-walk-editor .looks-calibration'),canvas=page.locator('#looks-sprite');
  await panel.locator('[data-mode=foot]').tap();await canvas.tap({position:{x:96,y:168}});await page.waitForTimeout(100);
  await panel.locator('[data-mode=head]').tap();await canvas.tap({position:{x:96,y:36}});await page.waitForTimeout(100);await save();
  let a=(await read()).character_looks.a.sprite;assert.equal(a.calibration.foot_x,.5);assert.equal(a.calibration.foot_y,.875);assert.equal(a.calibration.body_height,.6875);
  assert.equal(a.frame_editor.cells['0_1'].image,'data:image/png;base64,'+png);
  await panel.getByRole('slider',{name:'房间中的大小'}).focus();await page.keyboard.press('End');await save();assert.equal((await read()).character_looks.a.sprite.calibration.world_height,.35);
  await panel.getByRole('slider',{name:'房间中的大小'}).evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));});await save();assert.equal((await read()).character_looks.a.sprite.calibration.world_height,.20);
  // The room preview uses the same drawActor/foot projection as the real room.
  const pixels=await page.evaluate(async()=>{const {actorPoint}=await import('/assets/world-art.js'),c=document.querySelector('#looks-room-preview'),p=actorPoint({x:5,y:7},c.width,c.height),x=c.getContext('2d');return {above:[...x.getImageData(Math.round(p.x),Math.round(p.y-8),1,1).data],below:[...x.getImageData(Math.round(p.x),Math.round(p.y+4),1,1).data]};});assert.deepEqual(pixels.above.slice(0,3),[213,50,39]);assert.notDeepEqual(pixels.below.slice(0,3),[213,50,39]);
  // Drag is one draft change on release; cancellation never moves the slot.
  await panel.locator('[data-mode=drag]').tap();await canvas.scrollIntoViewIfNeeded();
  // Real pointer capture requires a trusted down.
  const r=await canvas.boundingBox();await page.mouse.move(r.x+90,r.y+100);await page.mouse.down();await page.mouse.move(r.x+102,r.y+100,{steps:4});await page.mouse.up();await page.waitForTimeout(150);await save();
  a=(await read()).character_looks.a.sprite;assert.equal(a.frame_editor.cells['0_1'].x,4);
  await page.mouse.move(r.x+90,r.y+100);await page.mouse.down();await page.mouse.move(r.x+102,r.y+100);await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await page.mouse.up();await save();assert.equal((await read()).character_looks.a.sprite.frame_editor.cells['0_1'].x,4);
  await panel.locator('[data-zoom="2"]').tap();assert.equal(await canvas.evaluate(c=>parseFloat(c.style.width)),384);
  await panel.locator('[data-zoom="1"]').tap();await canvas.scrollIntoViewIfNeeded();
  // A second finger switches to viewport manipulation, never a foot edit.
  const session=await page.context().newCDPSession(page),oldCalibration=(await read()).character_looks.a.sprite.calibration;
  await panel.locator('[data-mode=foot]').tap();await canvas.scrollIntoViewIfNeeded();
  const bounds=await canvas.boundingBox();
  const touch=[{x:bounds.x+60,y:bounds.y+80,id:1},{x:bounds.x+120,y:bounds.y+80,id:2}];
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch[0]]});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch[0],x:touch[0].x-15},{...touch[1],x:touch[1].x+15}]});await page.waitForFunction(()=>parseFloat(document.querySelector('#looks-sprite').style.width)>192);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await canvas.evaluate(c=>parseFloat(c.style.width)>192));await save();assert.deepEqual((await read()).character_looks.a.sprite.calibration,oldCalibration);
  await panel.locator('[data-zoom="1"]').tap();await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/sprite-calibration-browser.png'});
  const expected=(await read()).character_looks.a;await page.reload();await ready();assert.deepEqual((await read()).character_looks.a,expected);assert.deepEqual(errors,[]);
  console.log('PASS: foot/head picking, room pixels, retained originals, drag, zoom, SQLite-compatible backup and restart');
}catch(e){await page.screenshot({path:'artifacts/sprite-calibration-failure.png'});console.log({errors});throw e;}finally{await browser.close();}
