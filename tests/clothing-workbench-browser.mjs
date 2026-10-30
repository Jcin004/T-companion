// Synthetic room/catalog only; actual pointer interaction and IndexedDB persistence.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {selectPerson} from './wardrobe-fixture.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:430,height:850},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No models allowed');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const saved=()=>page.waitForFunction(()=>document.querySelector('.paint-status')?.textContent==='草稿已保存，房间形象尚未改变');
async function enter(){
 await page.evaluate(async()=>{const {LocalService}=await import('/assets/local-service.js'),original=LocalService.prototype.api;LocalService.prototype.api=function(...args){window.fixtureService=this;return original.apply(this,args);};});
 await page.locator('[data-app=world]').tap();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='进入小屋'&&b.getBoundingClientRect().height)||document.querySelector('#world-menu-open')?.getBoundingClientRect().height);
 if(await page.getByRole('button',{name:'进入小屋',exact:true}).isVisible())await page.getByRole('button',{name:'进入小屋',exact:true}).tap();
 await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'人物',exact:true}).tap();await selectPerson(page,'a');
}
async function point(x,y){await page.locator('.paint-canvas').scrollIntoViewIfNeeded();const r=await page.locator('.paint-canvas').boundingBox(),s=Math.max(1,Math.floor(Math.min(r.width/64,r.height/96)));return {x:r.x+Math.floor((r.width-64*s)/2)+(x+.5)*s,y:r.y+Math.floor((r.height-96*s)/2)+(y+.5)*s};}
async function stroke(from,to=from,cancel=false){
 const revision=(await drawing())?.revision||0,a=await point(...from),b=await point(...to);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:3});
 if(cancel)await page.locator('.paint-canvas').evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
 await page.mouse.up();
 if(!cancel){await page.waitForFunction(({skin,revision})=>fixtureService.data.character_looks.a.skins.find(s=>s.id===skin).drawing?.revision>revision,{skin,revision});await saved();}
}
let skin;
const drawing=async()=>(await read()).character_looks.a.skins.find(s=>s.id===skin).drawing;
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
 await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence(),d=emptyData();await p.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await p.save(d);});await page.reload();await ready();await enter();
 const original=await read();
 await page.locator('#looks-add-skin').tap();await page.locator('#looks-name-input').fill('绿格背心');await page.locator('[name=skin-create-mode][value=draw]').check();await page.locator('#looks-name-dialog button[type=submit]').tap();await page.locator('#clothing-workbench').waitFor();
 skin=(await read()).character_looks.a.skins[0].id;const base=await page.evaluate(async()=>{const {newDrawing}=await import('/assets/clothing-project.js');return newDrawing();});
 await page.locator('[data-unit="4"]').tap();await stroke([7,7]);let draft=(await drawing()).draft;
 for(let y=4;y<8;y++)for(let x=4;x<8;x++)assert.equal(draft.frames[1][y*64+x],'2');
 for(let i=0;i<12;i++)if(i!==1)assert.equal(draft.frames[i],base.frames[i]);
 await stroke([8,4],[28,4]);await page.locator('.paint-undo').tap();await saved();assert.equal((await drawing()).draft.frames[1],draft.frames[1]);
 await page.locator('.paint-redo').tap();await saved();assert.equal((await drawing()).draft.frames[1][4*64+27],'2');
 draft=(await drawing()).draft;await stroke([4,12],[28,12],true);await page.waitForTimeout(200);assert.deepEqual((await drawing()).draft,draft);
 await page.locator('[data-unit="2"]').tap();await page.locator('.paint-mirror').check();await page.locator('[data-color="9"]').tap();await stroke([4,12]);draft=(await drawing()).draft;assert.equal(draft.frames[1][12*64+4],'9');assert.equal(draft.frames[1][12*64+59],'9');
 await page.locator('[data-tool=erase]').tap();await stroke([4,12]);assert.equal((await drawing()).draft.frames[1][12*64+4],'0');assert.equal((await drawing()).draft.frames[1][12*64+59],'0');
 await page.locator('.paint-undo').tap();await saved();
 await page.locator('[data-tool=fill]').tap();await stroke([0,0]);assert.equal((await drawing()).draft.frames[1][0],'9');await page.locator('.paint-undo').tap();await saved();
 await page.locator('[data-tool=pen]').tap();await page.locator('.paint-mirror').uncheck();
 const beforePinch=(await drawing()).draft;
 // Inject a storage failure on the real service, then retry the same retained draft.
 await page.evaluate(()=>{const s=fixtureService,save=s.storage.save.bind(s.storage);s.storage.save=async d=>{if(window.rejectPaintSave)throw Error('synthetic paint disk failure');return save(d);};window.rejectPaintSave=true;});
 const a=await point(8,20);await page.mouse.click(a.x,a.y);await page.waitForFunction(()=>document.querySelector('.paint-status').textContent.includes('synthetic paint disk failure'));assert.deepEqual((await drawing()).draft,beforePinch);
 await page.evaluate(()=>window.rejectPaintSave=false);await page.locator('.paint-retry').tap();await saved();assert.notDeepEqual((await drawing()).draft,beforePinch);
 await page.locator('.paint-pose select').selectOption('1');await page.locator('[data-pose="0"]').tap();await stroke([8,16]);
 const savedDraft=(await drawing()).draft;assert.equal(savedDraft.frames[3][16*64+8],'9');assert.equal(savedDraft.frames[4],base.frames[4]);
 await page.locator('.paint-canvas').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/clothing-browser-workbench.png'});
 const close=await page.locator('.paint-close').boundingBox();assert.ok(close.y>=0&&close.y+close.height<850);
 await page.locator('.paint-close').tap();await page.reload();await ready();await enter();await page.locator('.looks-paint-open').tap();await page.locator('#clothing-workbench').waitFor();assert.deepEqual((await drawing()).draft,savedDraft);
 await page.locator('.paint-preview summary').tap();await page.locator('.paint-play').tap();await page.waitForTimeout(300);await page.locator('.paint-play').tap();
 await page.locator('.paint-apply').tap();await page.locator('#clothing-workbench').waitFor({state:'hidden'});
 const after=await read(),newSkin=after.character_looks.a.skins[0];assert.equal(newSkin.sprite.frames,3);assert.equal(newSkin.sprite.row_count,4);assert.equal(newSkin.drawing.draft,undefined);assert.deepEqual(newSkin.drawing.project,savedDraft);assert.equal(newSkin.ai_allowed,false);assert.equal(after.character_looks.a.active_skin_id,'default');assert.deepEqual(after.characters,original.characters);
 const rendered=await page.evaluate(async skin=>{const {bodyPixels}=await import('/assets/clothing-template.js'),{clothingAtlas}=await import('/assets/clothing-render.js'),{compositePixels}=await import('/assets/pixel-paint.js');const a=clothingAtlas(skin.drawing.project),i=new Image();i.src=a.image;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);for(let n=0;n<12;n++){const actual=x.getImageData(n%3*64,Math.floor(n/3)*96,64,96).data,expected=compositePixels(skin.drawing.project,n);if(actual.some((v,j)=>v!==expected[j]))throw Error('Flattened sprite differs from editable layers');}return {width:i.width,height:i.height,bodyUnchanged:bodyPixels(0,1).some(Boolean)};},newSkin);assert.deepEqual(rendered,{width:192,height:384,bodyUnchanged:true});

 await page.locator('.looks-paint-open').tap();await page.locator('#clothing-workbench').waitFor();
 const beforeGesture=(await drawing()).project;
 const cdp=await page.context().newCDPSession(page),p1=await point(10,10),p2=await point(30,10);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p1,id:10}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p1,id:10},{...p2,id:11}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p1,id:10},{...p2,x:p2.x+40,id:11}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(200);assert.deepEqual((await drawing()).project,beforeGesture);assert.equal((await drawing()).draft,undefined);
 assert.ok(parseInt(await page.locator('.paint-zoom output').textContent())>3);
 await page.locator('.paint-fit').click();await page.waitForFunction(()=>document.querySelector('.paint-zoom output').textContent==='3×');
 await page.locator('.paint-close').click();await page.locator('#clothing-workbench').waitFor({state:'hidden'});await cdp.detach();
 assert.deepEqual(errors,[]);await writeFile('artifacts/clothing-browser.json',JSON.stringify({gridSnap:true,fastStroke:true,undoRedo:true,eraserMirror:true,piskelFill:true,pointerCancel:true,pinchCancel:true,saveFailureRetry:true,frameIsolation:true,draftRestart:true,atomicApply:true,flattenedPixelsMatch:true,oldRosterAndActiveSkinPreserved:true,fixedClose:true,modelRequests:0},null,2));console.log('PASS: grid clothing workbench, pointer cancellation, restart, recovery, independent poses and exact world atlas');
}finally{await page.screenshot({path:'artifacts/clothing-browser-last.png'}).catch(()=>{});await browser.close();}
