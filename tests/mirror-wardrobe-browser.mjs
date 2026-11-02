// Synthetic state and real touch UI. No model or real user data.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:430,height:850},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No models allowed');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return (await new BrowserPersistence().load()).outfit_catalog;});
async function enter(){await page.locator('[data-app=world]').tap();const enter=page.getByRole('button',{name:'进入小屋',exact:true});await page.waitForFunction(()=>document.querySelector('#world-menu-open')?.getBoundingClientRect().height||[...document.querySelectorAll('button')].some(b=>b.textContent==='进入小屋'&&b.getBoundingClientRect().height));if(await enter.isVisible())await enter.tap();await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'衣柜',exact:true}).tap();await page.locator('#outfit-wardrobe[open]').waitFor();}
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
 await page.evaluate(async()=>{
   const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),{starterBody,blankProject}=await import('/assets/outfit-image.js'),{WALK_TEMPLATE}=await import('/assets/outfit-motion.js');
   const d=emptyData(),p=new BrowserPersistence();await p.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];
   const body=await starterBody(),shirt=blankProject();for(let i=0;i<12;i++){const f=Array.from(shirt.frames[i]);for(let y=44;y<64;y++)for(let x=19;x<45;x++)f[y*64+x]='8';shirt.frames[i]=f.join('');}
   d.outfit_catalog={version:1,revision:0,assets:[{id:'body',name:'原创素体',kind:'body',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project:body},{id:'shirt',name:'共用白衬衫',kind:'top',revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project:shirt}],people:{user:{body:'body',height:80,wear:[]},a:{body:'body',height:64,wear:[]}}};await p.save(d);
 });await page.reload();await ready();await enter();
 assert.equal(await page.locator('.wardrobe-management').isVisible(),false);assert.equal(await page.locator('[data-slot]').count(),6);
 await page.locator('[data-slot=top]').tap();await page.locator('.wardrobe-wear').tap();await page.locator('.wardrobe-fit-open').tap();await page.locator('[data-fit=x]').fill('3');await page.locator('[data-fit=x]').press('Tab');await page.waitForFunction(()=>document.querySelector('.wardrobe-status').textContent.includes('穿搭已保存'));
 await page.locator('[data-page=sets]').tap();await page.locator('.wardrobe-set-name').fill('日常共用');await page.locator('.wardrobe-set-save').tap();await page.getByRole('button',{name:'日常共用 · 试穿',exact:true}).waitFor();
 await page.locator('.wardrobe-person').selectOption('a');await page.getByRole('button',{name:'日常共用 · 试穿',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('.wardrobe-status').textContent.includes('已穿上这套搭配'));
 let c=await read();assert.equal(c.assets.length,2);assert.equal(c.people.user.adaptations.shirt.fit.x,3);assert.equal(c.people.a.adaptations.shirt.fit.x,0);
 await page.locator('[data-page=clothes]').tap();await page.locator('.wardrobe-fit-open').tap();await page.locator('.wardrobe-adapt-edit').tap();await page.locator('#outfit-painter[open]').waitFor();
 const canvas=page.locator('#outfit-painter .paint-canvas');await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),scale=Math.max(1,Math.floor(Math.min(r.width/64,r.height/96)));await page.touchscreen.tap(r.x+Math.floor((r.width-64*scale)/2)+30.5*scale,r.y+Math.floor((r.height-96*scale)/2)+50.5*scale);
 await page.waitForFunction(()=>document.querySelector('#outfit-painter .paint-status').textContent==='草稿已保存，房间形象尚未改变');c=await read();assert.ok(c.people.a.adaptations.shirt.draft);assert.equal(c.assets[1].draft,undefined);
 await page.locator('#outfit-painter .paint-apply').tap();await page.locator('#outfit-painter').waitFor({state:'hidden'});await page.locator('.wardrobe-wear:enabled').waitFor();c=await read();assert.equal(c.people.a.adaptations.shirt.project.frames[1][50*64+30],'2');assert.equal(c.assets[1].project.frames[1][50*64+30],'8');
 await page.locator('.wardrobe-wear').tap();await page.locator('.wardrobe-wear').tap();assert.equal((await read()).people.a.adaptations.shirt.project.frames[1][50*64+30],'2');
 await page.locator('.wardrobe-manage-open').tap();await page.locator('.wardrobe-edit').tap();await page.locator('#outfit-painter[open]').waitFor();await page.locator('#outfit-painter .paint-canvas').scrollIntoViewIfNeeded();const r2=await canvas.boundingBox(),s2=Math.max(1,Math.floor(Math.min(r2.width/64,r2.height/96)));await page.touchscreen.tap(r2.x+Math.floor((r2.width-64*s2)/2)+31.5*s2,r2.y+Math.floor((r2.height-96*s2)/2)+50.5*s2);await page.waitForFunction(()=>document.querySelector('#outfit-painter .paint-status').textContent==='草稿已保存，房间形象尚未改变');await page.locator('#outfit-painter .paint-apply').tap();await page.locator('#outfit-painter').waitFor({state:'hidden'});
 c=await read();assert.equal(c.assets[1].editions.length,1);assert.equal(c.people.a.adaptations.shirt.project.frames[1][50*64+31],'8');assert.ok(c.people.user.adaptations.shirt.revision<c.assets[1].revision);
 await page.locator('.wardrobe-manage-close').tap();await page.locator('.wardrobe-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'artifacts/mirror-wardrobe-mobile.png'});
 await page.locator('.wardrobe-apply').tap();await page.waitForFunction(()=>document.querySelector('.wardrobe-status').textContent==='已应用到世界；旧皮肤保留。');await page.locator('.wardrobe-close').tap();await page.reload();await ready();await enter();assert.deepEqual(await read(),c);
 assert.deepEqual(errors,[]);console.log('PASS: mobile mirror, shared set on two people, independent fit/drawing/draft, original edition pinning, rewear, world apply, reload; no models');
}finally{await browser.close();}
