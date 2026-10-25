// Synthetic asymmetric frames only: selected-position isolation and world anchors.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {selectPerson,editSkin,openAtlasOptions} from './wardrobe-fixture.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:430,height:850},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/chat/completions',()=>{throw Error('No model expected');});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const atlas=async()=>(await read()).character_looks.a.sprite;
async function save(){await page.locator('#looks-save').tap();await page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');}
async function drag(dx,dy,cancel=false){
 const canvas=page.locator('#looks-sprite');await canvas.scrollIntoViewIfNeeded();
 const r=await canvas.boundingBox();const scale=await canvas.evaluate(async c=>{const {fittingRect}=await import('/assets/sprite-calibration.js');return fittingRect(64,96,c.width,c.height).width/64;});
 const sx=scale*r.width/192,sy=scale*r.height/288;
 await page.mouse.move(r.x+r.width*.5,r.y+r.height*.4);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+dx*sx,r.y+r.height*.4+dy*sy,{steps:6});
 if(cancel)await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
 await page.mouse.up();await page.waitForTimeout(150);await save();
}
const frame=async f=>{await page.locator(`#looks-walk-editor [data-direction=down][data-frame="${f}"]`).tap();};
const pixels=a=>page.evaluate(async a=>{const i=new Image();i.src=a.image;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const result=[];for(let row=0;row<4;row++)for(let f=0;f<3;f++)result.push([...x.getImageData(f*64,row*96,64,96).data]);return result;},a);
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
 await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence(),d=emptyData();await p.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:'',avatar:''},{id:'b',name:'雨',identity:'合成乙',style:'',avatar:''}];await p.save(d);});await page.reload();await ready();
 await page.locator('[data-app=world]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'人物',exact:true}).tap();await selectPerson(page,'a');await editSkin(page);await page.locator('#looks-tab-sprite').tap();
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=192;c.height=384;const x=c.getContext('2d');for(let r=0;r<4;r++)for(let f=0;f<3;f++){x.fillStyle='#d53227';x.fillRect(f*64+[12,20,28][f],r*96+8,16,80);}return c.toDataURL().split(',')[1];}),'base64');
 await openAtlasOptions(page);await page.locator('#looks-import-layout').selectOption('three');await page.locator('#looks-sprite-file').setInputFiles({name:'offset-frames.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>document.querySelector('#looks-sheet-size').textContent.includes('64 × 96'));await save();
 const original=await atlas(),initialPixels=await pixels(original);
 await frame(1);await drag(3,-2);
 const second=await atlas(),secondPixels=await pixels(second);
 assert.equal(second.calibration,undefined,'moving frame two must not change shared calibration');
 assert.equal(second.frame_editor.cells['0_1'].x,3);assert.equal(second.frame_editor.cells['0_1'].y,-2);
 assert.equal(second.frame_editor.base_image,original.image,'the imported source remains unchanged');
 for(let i=0;i<12;i++)if(i!==1)assert.deepEqual(secondPixels[i],initialPixels[i],`frame ${i} is untouched`);
 assert.notDeepEqual(secondPixels[1],initialPixels[1]);
 await frame(2);await drag(-5,-2);const third=await atlas(),thirdPixels=await pixels(third);
 for(let i=0;i<12;i++)if(i!==2)assert.deepEqual(thirdPixels[i],secondPixels[i],`third-frame edit preserves frame ${i}`);
 await frame(0);await drag(11,-2);const aligned=await atlas(),alignedPixels=await pixels(aligned);
 assert.deepEqual(alignedPixels[0],alignedPixels[1]);assert.deepEqual(alignedPixels[1],alignedPixels[2],'three asymmetric source frames share the same body center and feet after independent alignment');
 assert.equal(aligned.frame_editor.cells['0_1'].x,3);assert.equal(aligned.frame_editor.cells['0_2'].x,-5);
 // In-world projection: walking selects every frame at the same world position.
 const projection=await page.evaluate(async a=>{const {loadWorldArt,drawActor}=await import('/assets/world-art.js');const c=document.createElement('canvas');c.width=600;c.height=900;const x=c.getContext('2d'),w={looks:{user:{skin:0,portraits:[],sprite:a}},residents:[],state:{facing:{user:'down'}}};await loadWorldArt(w);return [0,.5,1,1.5].map(distance=>{x.clearRect(0,0,c.width,c.height);drawActor(x,w,'user',{x:5,y:8},{walking:true,distance});const d=x.getImageData(0,0,c.width,c.height).data;let minX=600,maxX=-1,bottom=-1;for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){const i=(y*c.width+xx)*4;if(d[i]===213&&d[i+1]===50&&d[i+2]===39&&d[i+3]>240){minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);bottom=Math.max(bottom,y);}}return {center:(minX+maxX)/2,bottom};});},aligned);
 assert.ok(projection[0].bottom>0);for(const p of projection)assert.deepEqual(p,projection[0],'walking does not shift the rendered body or feet between frames');
 // Numeric editing works on a tile never uploaded separately; cancel is inert.
 await page.locator('#looks-walk-editor [data-direction=left][data-frame="0"]').tap();await page.locator('#looks-walk-editor .calibration-frame-fine>summary').tap();await page.locator('#looks-frame-x').fill('2');await page.locator('#looks-frame-x').press('Tab');await page.waitForTimeout(120);await save();
 assert.equal((await atlas()).frame_editor.cells['1_0'].x,2);
 await frame(1);const cancelled=await atlas();await drag(2,2,true);assert.deepEqual(await atlas(),cancelled);
 // Expanding numbers must not silently change the scope of preview dragging.
 await drag(1,0);assert.equal((await atlas()).frame_editor.cells['0_1'].x,4);assert.deepEqual((await pixels(await atlas()))[2],alignedPixels[2]);
 await page.locator('#looks-walk-editor .calibration-move-all input').check();await frame(2);assert.equal(await page.locator('#looks-walk-editor .calibration-move-all input').isChecked(),false,'new selection restores single-frame scope');
 const saved=await atlas();await page.reload();await ready();assert.deepEqual(await atlas(),saved);assert.deepEqual(errors,[]);
 console.log('PASS: imported-frame two/three isolation, retained original, independent alignment, stable walking body/feet, numeric untouched tile, cancel, scope reset and persistence');
}catch(e){await page.screenshot({path:'artifacts/frame-position-failure.png'});throw e;}finally{await browser.close();}
