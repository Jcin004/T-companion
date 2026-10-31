// Synthetic browser database, production editor and real mouse/touch input. No models.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:650,height:950},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 await page.evaluate(async()=>{
   const {LocalService,BrowserPersistence,emptyData}=await import('/assets/local-service.js'),{mountClothingWorkbench}=await import('/assets/clothing-workbench-ui.js');
   const p=new BrowserPersistence();await p.load();await p.save(emptyData());const s=window.paintService=await new LocalService(p,()=>{throw Error('No models allowed');}).init();
   await s.transact(d=>d.characters.push({id:'a',name:'合成人物',identity:'',style:'',avatar:''}));await s.api('/character-looks/a','PATCH',{skins:[{id:'paint',name:'合成画作',skin:1,portraits:[],portrait:0,sprite:null}]});
   const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.classList.contains('paint-canvas'))window.paintView={x:args[1],y:args[2],width:args[3],height:args[4]};return original.apply(this,args);};
   window.paintEditor=mountClothingWorkbench({api:s.api.bind(s),report:e=>{throw e;},toast:()=>{},assetMode:true});paintEditor.open('a','paint','合成画作');
 });
 const dialog=page.locator('#outfit-painter'),canvas=dialog.locator('.paint-canvas');await dialog.waitFor();await canvas.scrollIntoViewIfNeeded();
 const state=()=>page.evaluate(()=>JSON.stringify(paintService.data.character_looks.a.skins[0]));const original=await state();
 const r=await canvas.boundingBox(),anchor={x:r.x+r.width*.6,y:r.y+r.height*.5};let view=await page.evaluate(()=>paintView);const logical={x:(anchor.x-r.x-view.x)/view.width,y:(anchor.y-r.y-view.y)/view.height};
 await page.mouse.move(anchor.x,anchor.y);await page.mouse.wheel(0,-100);view=await page.evaluate(()=>paintView);assert.ok(Math.abs((anchor.x-r.x-view.x)/view.width-logical.x)<.02);assert.equal(await state(),original);
 const beforePan={...view};await page.mouse.down({button:'right'});await page.mouse.move(anchor.x+35,anchor.y+20,{steps:4});await page.mouse.up({button:'right'});view=await page.evaluate(()=>paintView);assert.equal(view.x-beforePan.x,35);assert.equal(view.y-beforePan.y,20);assert.equal(await state(),original);
 await page.mouse.down({button:'middle'});await page.mouse.move(anchor.x+45,anchor.y+30);await page.mouse.up({button:'middle'});assert.equal(await state(),original);
 const cdp=await page.context().newCDPSession(page);const a={x:r.x+100,y:r.y+100,id:1},b={x:r.x+180,y:r.y+100,id:2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-25,y:a.y+20},{...b,x:b.x+25,y:b.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...b,x:b.x+25,y:b.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,x:b.x+35,y:b.y+30}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await state(),original);
 await dialog.locator('.paint-refine').click();await page.waitForFunction(()=>paintService.data.character_looks.a.skins[0].drawing?.draft?.pixel_scale===2);await dialog.locator('.paint-fit').click();await dialog.locator('[data-color="15"]').click();
 await canvas.scrollIntoViewIfNeeded();const fineView=await page.evaluate(()=>paintView),cr=await canvas.boundingBox(),x=cr.x+fineView.x+100.5*fineView.width/128,y=cr.y+fineView.y+150.5*fineView.height/192;
 await page.touchscreen.tap(x,y);await page.waitForFunction(()=>paintService.data.character_looks.a.skins[0].drawing.draft.frames[1][150*128+100]==='f');const fine=await page.evaluate(()=>paintService.data.character_looks.a.skins[0].drawing.draft);assert.equal(fine.frames[1][150*128+101],'0');assert.equal(fine.frames[1].length,128*192);
 await dialog.locator('.paint-apply').click();await dialog.waitFor({state:'hidden'});const applied=await page.evaluate(()=>paintService.data.character_looks.a.skins[0]);assert.equal(applied.drawing.project.pixel_scale,2);
 const dimensions=await page.evaluate(async()=>{const s=paintService.data.character_looks.a.skins[0].sprite,i=new Image();i.src=s.image;await i.decode();return {width:i.width,height:i.height,calibration:s.calibration};});assert.equal(dimensions.width,384);assert.equal(dimensions.height,768);assert.equal(dimensions.calibration.foot_y,88/96);
 const mixed=await page.evaluate(async()=>{
   const {blankProject}=await import('/assets/outfit-image.js'),{refineDrawing}=await import('/assets/clothing-project.js'),{drawOutfit,outfitAtlas}=await import('/assets/outfit-compose.js');
   const body=blankProject(),shirt=refineDrawing(blankProject());body.frames.fill('1'.repeat(6144));shirt.colors[15]='#ff00ff';shirt.frames.fill('0'.repeat(101*128+61)+'f'+'0'.repeat(128*192-101*128-62));
   const catalog={assets:[{id:'body',kind:'body',ready:[true,true,true,true],project:body},{id:'shirt',kind:'top',ready:[true,true,true,true],project:shirt}]},person={body:'body',height:80,wear:[{asset:'shirt',fit:{scale:1,x:0,y:0}}]},canvas=document.createElement('canvas');drawOutfit(canvas,catalog,person);
   const ctx=canvas.getContext('2d'),atlas=outfitAtlas(catalog,person),image=new Image();image.src=atlas.image;await image.decode();return {width:canvas.width,ink:[...ctx.getImageData(61,101,1,1).data],neighbor:[...ctx.getImageData(62,101,1,1).data],atlasWidth:image.width,calibration:atlas.calibration};
 });assert.equal(mixed.width,128);assert.deepEqual(mixed.ink,[255,0,255,255]);assert.notDeepEqual(mixed.neighbor,mixed.ink);assert.equal(mixed.atlasWidth,384);assert.equal(mixed.calibration.world_height,.2);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');const restored=await page.evaluate(async()=>{const {BrowserPersistence,validateBackup}=await import('/assets/local-service.js');return validateBackup(await new BrowserPersistence().load()).character_looks.a.skins[0];});assert.deepEqual(restored,applied);
 assert.deepEqual(errors,[]);console.log('PASS: anchored wheel zoom, right pan, middle-button rejection, two-touch cancellation, half-size pixels, 2x atlas and backup/reload');
}catch(e){console.error({errors,status:await page.locator('#outfit-painter .paint-status').textContent()});throw e;}finally{await browser.close();}
