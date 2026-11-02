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
 assert.equal(await page.locator('.wardrobe-management').count(),0);
 await page.locator('.wardrobe-manage-open').tap();await page.locator('#outfit-studio[open]').waitFor();
 assert.equal(await page.locator('.source-body-controls').isVisible(),false);assert.equal(await page.locator('.source-save').isVisible(),false);assert.equal(await page.locator('#outfit-studio .wardrobe-apply').count(),0);
 await page.locator('[data-source-kind=hair]').tap();await page.locator('.source-create').tap();assert.equal(await page.locator('.source-name').evaluate(e=>e===document.activeElement&&!e.disabled),true);await page.locator('.source-name').fill('合成头发');assert.equal(await page.locator('.source-body-controls').isVisible(),false);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.fillStyle='#c04030';x.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
 await page.locator('.source-upload').setInputFiles({name:'synthetic-hair.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>document.querySelector('.source-status').textContent.includes('上传草稿已保存'));
 let c=await read(),hair=c.assets.find(a=>a.kind==='hair');assert.ok(hair.draft);assert.equal(hair.ready[0],false);
 await page.locator('.source-order').selectOption('behind');await page.locator('.source-save').tap();await page.waitForFunction(()=>document.querySelector('.source-status').textContent.includes('原版已保存'));c=await read();hair=c.assets.find(a=>a.kind==='hair');assert.equal(hair.name,'合成头发');assert.equal(hair.ready[0],true);assert.equal(hair.draft,undefined);assert.equal(hair.draw_order[0],'behind');assert.equal(c.people.user.body,'body');
 await page.locator('.source-paint').tap();await page.locator('#outfit-source-painter[open]').waitFor();assert.equal(await page.locator('#outfit-source-painter [data-pose] canvas').count(),3);
 await page.locator('#outfit-source-painter [data-pose="0"]').tap();
 const paintCanvas=page.locator('#outfit-source-painter .paint-canvas');await paintCanvas.scrollIntoViewIfNeeded();const pr=await paintCanvas.boundingBox(),ps=Math.max(1,Math.floor(Math.min(pr.width/64,pr.height/96)));await page.touchscreen.tap(pr.x+Math.floor((pr.width-64*ps)/2)+2.5*ps,pr.y+Math.floor((pr.height-96*ps)/2)+2.5*ps);
 await page.waitForFunction(()=>document.querySelector('#outfit-source-painter .paint-status').textContent==='草稿已保存，房间形象尚未改变');
 assert.notEqual((await read()).assets.find(a=>a.kind==='hair').draft.frames[0],hair.project.frames[1]);
 await page.locator('#outfit-source-painter .paint-copy-idle').tap();await page.locator('#outfit-source-painter .paint-undo').tap();await page.locator('#outfit-source-painter .paint-redo').tap();await page.locator('#outfit-source-painter .paint-close').tap();await page.locator('#outfit-source-painter').waitFor({state:'hidden'});
 await page.locator('.source-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'artifacts/studio-hair-mobile.png'});
 await page.locator('.source-back').tap();await page.locator('[data-source-kind=bottom]').tap();assert.equal(await page.locator('.source-body-controls').isVisible(),false);assert.equal(await page.locator('.source-save').isVisible(),false);await page.locator('.source-close').tap();
 await page.locator('.wardrobe-body-open').tap();await page.locator('#outfit-studio[open]').waitFor();assert.equal(await page.locator('.source-body-controls').isVisible(),true);assert.equal(await page.locator('.source-kinds').isVisible(),false);assert.equal(await page.locator('.source-order-label').isVisible(),false);
 await page.locator('.source-height').fill('72');await page.locator('.source-use-body').tap();await page.waitForFunction(()=>document.querySelector('.source-status').textContent.includes('本体已选用'));assert.equal((await read()).people.user.height,72);await page.screenshot({path:'artifacts/studio-body-mobile.png'});await page.locator('.source-close').tap();
 const renderResult=await page.evaluate(async()=>{
   const {drawOutfit,outfitAtlas}=await import('/assets/outfit-compose.js'),{blankProject}=await import('/assets/outfit-image.js');
   function item(id,kind,color){const p=blankProject();for(let i=0;i<12;i++){const f=Array.from(p.frames[i]);for(let y=8;y<44;y++)for(let x=14;x<50;x++)f[y*64+x]=color;p.frames[i]=f.join('');}return {id,kind,ready:[true,true,true,true],project:p};}
   const cat={assets:[item('body','body','2'),item('hair','hair','3'),item('hat','hat','4')]},person={body:'body',height:80,wear:[{asset:'hair',fit:{scale:1,x:0,y:0}},{asset:'hat',fit:{scale:1,x:0,y:0}}]},canvas=document.createElement('canvas');
   const sample=()=>Array.from(canvas.getContext('2d').getImageData(32,20,1,1).data);
   drawOutfit(canvas,cat,person);const normal=sample();cat.assets[1].draw_order=['front','default','default','default'];drawOutfit(canvas,cat,person);const front=sample();drawOutfit(canvas,cat,person,1);const side=sample();person.wear.pop();cat.assets[1].draw_order[0]='behind';drawOutfit(canvas,cat,person);const behind=sample();
   const atlas=outfitAtlas(cat,person),image=new Image();image.src=atlas.image;await image.decode();const a=document.createElement('canvas');a.width=image.width;a.height=image.height;a.getContext('2d').drawImage(image,0,0);const exported=Array.from(a.getContext('2d').getImageData(64+32,20,1,1).data);
   return {normal,front,side,behind,exported};
 });assert.notDeepEqual(renderResult.front,renderResult.normal);assert.deepEqual(renderResult.side,renderResult.normal);assert.notDeepEqual(renderResult.behind,renderResult.front);assert.deepEqual(renderResult.exported,renderResult.behind);
 const saved=await read();await page.locator('.wardrobe-close').tap();await page.reload();await ready();await enter();assert.deepEqual(await read(),saved);assert.deepEqual(errors,[]);
 console.log('PASS: separate library/editor/body contexts, staged upload, named original, per-direction order, pose thumbnails/copy, native-resolution LPC atlas, body height, persistence');
}finally{await browser.close();}
