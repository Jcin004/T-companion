// Synthetic mobile-touch fixture. No model service is used.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/chat/completions',()=>{throw Error('Joystick must not call a model');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return (await new BrowserPersistence().load()).world;});
const sleep=ms=>page.waitForTimeout(ms);
let touch;
async function hold(dx,dy){
  const r=await page.locator('#world-joystick').boundingBox();
  touch={x:r.x+r.width/2,y:r.y+r.height/2};
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});
  await turn(dx,dy);
}
async function turn(dx,dy){await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+dx,y:touch.y+dy,id:1}]});}
async function release(){await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);}
const input=await page.context().newCDPSession(page);
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8014/');await ready();
  await page.evaluate(async()=>{
    const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),s=new BrowserPersistence(),d=emptyData();
    d.characters=[{id:'a',name:'林',identity:'',style:'',avatar:''},{id:'b',name:'雨',identity:'',style:'',avatar:''}];
    await s.load();await s.save(d);
  });await page.reload();await ready();await page.locator('[data-app="world"]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();
  await hold(40,0);await sleep(650);await release();
  let w=await read();assert.ok(w.positions.user.x>=7,'hold repeats saved steps');assert.equal(w.positions.user.y,8);
  const stopped=w.events.length;await sleep(450);assert.equal((await read()).events.length,stopped,'release stops');
  await hold(40,0);await sleep(1200);await release();w=await read();assert.deepEqual(w.positions.user,{x:10,y:8});
  const edge=w.events.length;await hold(40,0);await sleep(500);await release();assert.equal((await read()).events.length,edge,'wall generates no event');
  await hold(-40,0);await sleep(230);await turn(0,40);await sleep(300);await release();w=await read();assert.ok(w.positions.user.x<10);assert.ok(w.positions.user.y>8);
  // A canceled touch and navigation while holding must also stop the repeat timer.
  await hold(0,-40);await sleep(100);await input.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await sleep(250);
  const cancelled=(await read()).events.length;await sleep(400);assert.equal((await read()).events.length,cancelled);
  await hold(-40,0);await sleep(80);await page.evaluate(()=>document.querySelector('#home-button').click());await release();
  const left=(await read()).events.length;await sleep(400);assert.equal((await read()).events.length,left);
  await page.locator('[data-app="world"]').tap();await sleep(150);
  const walk=async(x,y)=>{const r=await page.locator('#world-canvas').boundingBox();await page.touchscreen.tap(r.x+(x+.5)/12*r.width,r.y+(y+.5)/13*r.height);await sleep(1000);};
  await walk(5,6);let blocked=(await read()).events.length;
  await hold(-40,0);await sleep(400);await release();assert.equal((await read()).events.length,blocked,'resident blocks the adjacent tile');
  await walk(5,4);blocked=(await read()).events.length;
  await hold(0,-40);await sleep(400);await release();assert.equal((await read()).events.length,blocked,'desk blocks the adjacent tile');
  // A failed first save does not move the actor or create repeated failed writes.
  await page.evaluate(async()=>{
    const {BrowserPersistence}=await import('/assets/local-service.js'),save=BrowserPersistence.prototype.save;
    window.joystickSave=save;window.failedSaves=0;
    BrowserPersistence.prototype.save=async()=>{window.failedSaves++;throw Error('synthetic disk full');};
  });const beforeFailure=await read();await hold(40,0);await sleep(550);await release();
  assert.deepEqual(await read(),beforeFailure);assert.equal(await page.evaluate(()=>window.failedSaves),1);
  await page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');BrowserPersistence.prototype.save=window.joystickSave;});
  await page.locator('#world-retry').tap();await sleep(300);w=await read();assert.equal(w.events.length,beforeFailure.events.length+1);
  assert.equal(new Set(w.events.map(e=>e.id)).size,w.events.length);
  const saved=w;await page.reload();await ready();await page.locator('[data-app="world"]').tap();assert.deepEqual(await read(),saved);
  await page.screenshot({path:'artifacts/joystick-browser-room.png'});
  assert.deepEqual(errors,[]);console.log('PASS: real mobile touch hold/direction/release/cancel, walls, navigation, save failure/stable retry, restart; no models');
}finally{await browser.close();}
