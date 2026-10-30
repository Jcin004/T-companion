// Synthetic state and real touch UI. No model or real user data.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:430,height:850},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No models allowed');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return (await new BrowserPersistence().load()).outfit_catalog;});
async function enter(){await page.locator('[data-app=world]').tap();const enter=page.getByRole('button',{name:'进入小屋',exact:true});await page.waitForFunction(()=>document.querySelector('#world-menu-open')?.getBoundingClientRect().height||[...document.querySelectorAll('button')].some(b=>b.textContent==='进入小屋'&&b.getBoundingClientRect().height));if(await enter.isVisible())await enter.tap();await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'衣柜',exact:true}).tap();await page.locator('#outfit-wardrobe[open]').waitFor();}
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence(),d=emptyData();await p.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await p.save(d);});await page.reload();await ready();await enter();
 assert.equal((await read()).assets[0].ready.filter(Boolean).length,4);
 await page.evaluate(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true}));
 await page.locator('[data-kind=top]').tap();await page.locator('.wardrobe-name').fill('合成绿上衣');await page.locator('.wardrobe-create').tap();await page.locator('.wardrobe-edit:enabled').waitFor();
 const garment=(await read()).assets.find(a=>a.kind==='top');await page.locator('.wardrobe-edit').tap();await page.locator('#outfit-painter[open]').waitFor();
 const canvas=page.locator('#outfit-painter .paint-canvas');await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),s=Math.max(1,Math.floor(Math.min(r.width/64,r.height/96))),x=r.x+Math.floor((r.width-64*s)/2)+30.5*s,y=r.y+Math.floor((r.height-96*s)/2)+50.5*s;await page.touchscreen.tap(x,y);
 await page.waitForFunction(()=>document.querySelector('#outfit-painter .paint-status').textContent==='草稿已保存，房间形象尚未改变');const draft=(await read()).assets.find(a=>a.id===garment.id);assert.ok(draft.draft);assert.equal(draft.project.frames[1][50*64+30],'0');
 await page.locator('#outfit-painter .paint-apply').tap();await page.locator('#outfit-painter').waitFor({state:'hidden'});await page.locator('.wardrobe-wear:enabled').waitFor();await page.locator('.wardrobe-wear').tap();await page.locator('[data-fit=scale]:visible').waitFor();
 assert.equal((await read()).people.user.wear[0].asset,garment.id);await page.locator('.wardrobe-apply').tap();await page.getByText('本体或已穿衣物缺少方向，请先补齐下、左、右、上',{exact:true}).waitFor();await page.locator('[data-fit=x]').fill('3');await page.locator('[data-fit=x]').press('Tab');await page.locator('.wardrobe-short:enabled').waitFor();
 const saved=await read();assert.equal(saved.people.user.wear[0].fit.x,3);assert.equal(saved.assets.find(a=>a.id===garment.id).project.frames[1][50*64+30],'2');
 await page.locator('.wardrobe-play').tap();await page.locator('.wardrobe-play').tap();await page.locator('.wardrobe-close').tap();await page.reload();await ready();await enter();assert.deepEqual(await read(),saved);
 await page.locator('[data-kind=top]').tap();await page.locator('.wardrobe-edit').tap();await page.locator('#outfit-painter[open]').waitFor();await page.locator('#outfit-painter .paint-close').tap();await page.locator('#outfit-painter').waitFor({state:'hidden'});
 await page.screenshot({path:'artifacts/outfit-wardrobe-mobile.png'});assert.deepEqual(errors,[]);
 const lab=await browser.newPage({viewport:{width:800,height:800}});await lab.goto('http://127.0.0.1:8016/assets/outfit-fit-lab.html');await lab.locator('#status').filter({hasText:'原始素体已读取'}).waitFor();await lab.screenshot({path:'artifacts/outfit-two-heights.png'});await lab.close();
 console.log('PASS: body import, missing-direction guard, independent asset drawing/draft/apply, wear/fit, restart and continued editing; no model requests');
}finally{await browser.close();}
