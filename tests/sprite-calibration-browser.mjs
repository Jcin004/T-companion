// Synthetic single-frame images only. Never calls a model.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {selectPerson,editSkin} from './wardrobe-fixture.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:780},isMobile:true,hasTouch:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No provider expected');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const save=async()=>{await page.locator('#looks-save').tap();await page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
async function drag(canvas,dx,dy,cancel=false){
  await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox();
  await page.mouse.move(r.x+96,r.y+140);await page.mouse.down();await page.mouse.move(r.x+96+dx,r.y+140+dy,{steps:5});
  if(cancel)await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
  await page.mouse.up();await page.waitForTimeout(180);
}
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
  await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence();await p.load();const d=emptyData();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await p.save(d);});await page.reload();await ready();
  await page.locator('[data-app=world]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'人物',exact:true}).tap();await selectPerson(page,'a');await editSkin(page);await page.locator('#looks-tab-sprite').tap();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=96;const x=c.getContext('2d');x.fillStyle='#d53227';x.fillRect(22,8,20,80);return c.toDataURL().split(',')[1];});
  await page.locator('#looks-frame-file').setInputFiles({name:'padded.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelector('#looks-walk-editor .looks-calibration').hidden===false);await save();
  const panel=page.locator('#looks-walk-editor .looks-calibration'),canvas=page.locator('#looks-sprite');
  assert.equal(await panel.locator('[data-mode=head],[data-mode=foot]').count(),0);
  assert.equal(await page.locator('#looks-direction,#looks-atlas-preset').count(),0);
  assert.equal(await page.locator('#looks-walk-editor .looks-import-dialog').evaluate(e=>e.open),false);
  assert.equal(await panel.locator('.looks-atlas-settings').count(),0);
  assert.equal(await panel.locator('.calibration-room canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v!==0)),false,'closed room preview is lazy');
  await page.locator('#looks-walk-editor .looks-sheet-grid canvas').first().evaluate(c=>window.originalSheetCell=c);
  assert.equal(await panel.locator('.calibration-frame-fine').getAttribute('open'),null);
  assert.match(await panel.locator('.calibration-standard').textContent(),/64×96.*80.*8/);
  assert.equal((await read()).character_looks.a.sprite.calibration,undefined,'opening does not change existing scale');
  // 8 source pixels of bottom padding at 3x = 24 display pixels.
  await drag(canvas,0,24);await save();
  let a=(await read()).character_looks.a.sprite;near(a.calibration.foot_y,88/96);near(a.calibration.world_height/a.calibration.body_height,.24);
  assert.equal(a.frame_editor.cells['0_1'].image,'data:image/png;base64,'+png);assert.equal(a.frame_editor.cells['0_1'].y,0,'main drag adjusts the group, not one source cell');
  await drag(canvas,15,10,true);await save();assert.deepEqual((await read()).character_looks.a.sprite,a,'cancel does not edit the atlas');
  assert.equal(await panel.locator('input[type=range],[data-zoom],[data-mode]').count(),0);
  const slider=panel.getByRole('textbox',{name:'人物大小百分比',exact:true});
  await slider.evaluate(e=>{e.value='150';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));});await save();
  a=(await read()).character_looks.a.sprite;near(a.calibration.world_height/a.calibration.body_height,.36);
  assert.equal(await page.locator('#looks-walk-editor .looks-sheet-grid canvas').first().evaluate(c=>c===window.originalSheetCell),true,'size edits reuse unchanged sheet thumbnails');
  // A focused slider and a focused number field must scroll, never change value.
  await slider.scrollIntoViewIfNeeded();await slider.focus();const v=await slider.inputValue(),scroll=await page.locator('.looks-scroll').evaluate(e=>e.scrollTop),box=await slider.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,85);await page.waitForTimeout(100);
  assert.equal(await slider.inputValue(),v);assert.ok(await page.locator('.looks-scroll').evaluate(e=>e.scrollTop)>scroll);
  await panel.locator('.calibration-frame-fine>summary').tap();const number=page.locator('#looks-frame-x');await number.scrollIntoViewIfNeeded();await number.focus();const n=await number.inputValue(),nb=await number.boundingBox();
  await page.mouse.move(nb.x+nb.width/2,nb.y+nb.height/2);await page.mouse.wheel(0,-65);await page.waitForTimeout(100);assert.equal(await number.inputValue(),n);
  await panel.locator('.calibration-frame-fine>summary').tap();await save();assert.deepEqual((await read()).character_looks.a.sprite,a);
  await slider.evaluate(e=>{e.value='100';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));});await save();
  await panel.locator('.calibration-room>summary').tap();await page.waitForTimeout(120);
  // Both views have real pixels; the room uses the same foot projection as world.
  const pixels=await page.evaluate(async()=>{const {actorPoint}=await import('/assets/world-art.js'),c=document.querySelector('#looks-room-preview'),p=actorPoint({x:6,y:7},c.width,c.height),x=c.getContext('2d');return {above:[...x.getImageData(Math.round(p.x),Math.round(p.y-8),1,1).data],below:[...x.getImageData(Math.round(p.x),Math.round(p.y+4),1,1).data]};});assert.deepEqual(pixels.above.slice(0,3),[213,50,39]);assert.notDeepEqual(pixels.below.slice(0,3),[213,50,39]);
  // Zoom and playback never change calibration or move the fixed reference.
  assert.equal(await panel.locator('[data-zoom]').count(),0);
  const expected=(await read()).character_looks.a;
  await canvas.scrollIntoViewIfNeeded();
  const session=await page.context().newCDPSession(page),bounds=await canvas.boundingBox();
  const touches=[{x:bounds.x+60,y:bounds.y+80,id:1},{x:bounds.x+120,y:bounds.y+80,id:2}];
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touches[0]]});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touches[0],x:touches[0].x-15},{...touches[1],x:touches[1].x+15}]});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#looks-sprite').style.width)>192);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await save();assert.deepEqual((await read()).character_looks.a,expected);
  await panel.locator('.calibration-view-reset').tap();
  await page.locator('#looks-preview-play').tap();await page.waitForTimeout(350);await page.locator('#looks-preview-play').tap();await save();assert.deepEqual((await read()).character_looks.a,expected);
  await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/sprite-calibration-browser.png'});await panel.locator('#looks-room-preview').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/sprite-reference-room.png'});
  await page.reload();await ready();assert.deepEqual((await read()).character_looks.a,expected);assert.deepEqual(errors,[]);
  console.log('PASS: fixed 64x96 reference, shared scale/ground drag, cancel, wheel scroll, room pixels, original PNG, playback and restart');
}catch(e){await page.screenshot({path:'artifacts/sprite-calibration-failure.png'});console.log({errors});throw e;}finally{await browser.close();}
