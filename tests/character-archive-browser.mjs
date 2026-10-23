// Isolated browser data, synthetic PNGs and mocked model responses only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0;
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
await page.route('**/chat/completions',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization'}});calls++;await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'[情绪:'+await page.evaluate(()=>window.archiveEmotion)+']今天很得意。'}}]})+'\n\ndata: [DONE]\n\n'});});
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8016');await ready();
 await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),p=new BrowserPersistence(),d=emptyData();await p.load();d.characters=[{id:'a',name:'林',identity:'合成甲',style:''},{id:'b',name:'雨',identity:'合成乙',style:''}];d.settings.model='mock';d.settings.base_url='https://fixture.example/v1';await p.save(d);});await page.reload();await ready();
 await page.evaluate(async()=>{const {LocalService}=await import('/assets/local-service.js'),api=LocalService.prototype.api;LocalService.prototype.api=function(...args){window.fixtureService=this;return api.apply(this,args);};});
 await page.locator('[data-app=archive]').tap();await page.locator('#archive-owner').selectOption('a');
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=48;c.height=64;c.getContext('2d').fillStyle='#bb3355';c.getContext('2d').fillRect(0,0,48,64);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('#archive-file').setInputFiles({name:'proud.png',mimeType:'image/png',buffer});await page.waitForFunction(()=>document.querySelector('#archive-status').textContent.includes('图片已保存'));
 let data=await read();const asset=data.character_archive.items[0];assert.equal(asset.owner_id,'a');assert.equal(asset.source.filename,'proud.png');
 await page.locator('.archive-picture-card').tap();await page.locator('#archive-picture-name').fill('得意的林');await page.locator('#archive-rename').tap();await page.waitForFunction(()=>document.querySelector('#archive-picture-status').textContent==='图片名称已保存');
 await page.locator('#archive-binding-emotion').selectOption('new');await page.locator('#archive-expression-name').fill('得意');await page.locator('#archive-bind').tap();await page.waitForFunction(()=>document.querySelector('#archive-picture-status').textContent.includes('已用于表情'));
 assert.equal(await page.locator('#archive-delete').isDisabled(),true);data=await read();const portrait=data.character_looks.a.portraits[0];await page.evaluate(id=>window.archiveEmotion=id,portrait.emotion);assert.equal(portrait.asset_id,asset.id);
 // The return control remains visible while the details body scrolls.
 await page.locator('.archive-detail-scroll').first().evaluate(e=>e.scrollTop=e.scrollHeight);const close=await page.locator('#archive-picture-close').boundingBox();assert.ok(close.y>=0&&close.y<844);
 await page.locator('#archive-picture-close').tap();await page.locator('#archive-tab-expressions').tap();assert.equal(await page.locator('#archive-content .archive-picture-card strong').textContent(),'得意');
 await page.screenshot({path:'artifacts/archive-expressions.png'});
 await page.locator('#archive-owner').selectOption('b');assert.equal(await page.locator('#archive-content .archive-picture-card').count(),0);await page.locator('#archive-owner').selectOption('a');
 // Upload save failure retains the same pending request for retry.
 await page.evaluate(()=>{const s=fixtureService,save=s.storage.save.bind(s.storage);s.storage.save=async d=>{if(window.archiveFail)throw Error('synthetic archive disk failure');return save(d);};window.archiveFail=true;});
 await page.locator('#archive-tab-album').tap();await page.locator('#archive-file').setInputFiles({name:'retry.png',mimeType:'image/png',buffer});await page.waitForFunction(()=>document.querySelector('#archive-status').textContent.includes('synthetic'));
 assert.equal((await read()).character_archive.items.length,1);await page.evaluate(()=>window.archiveFail=false);await page.locator('#archive-retry').tap();await page.waitForFunction(()=>document.querySelector('#archive-retry').hidden);assert.equal((await read()).character_archive.items.length,2);
 // World consumes the actual archive-bound portrait through existing scene flow.
 await page.locator('[data-home]').filter({visible:true}).first().tap();await page.locator('[data-app=world]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-canvas[data-drawn=yes]').waitFor();
 const bounds=await page.locator('#world-canvas').boundingBox(),a=(await read()).world.positions.a;await page.touchscreen.tap(bounds.x+(a.x+.5)/12*bounds.width,bounds.y+(.4+(a.y-3)*.065)*bounds.height-bounds.width*.075);await page.locator('#world-dialogue[open]').waitFor();
 await page.locator('#world-input').fill('今天感觉如何？');await page.locator('#world-send').tap();await page.waitForFunction(()=>document.querySelector('#world-dialogue-status').textContent==='已保存对话与世界事件');await page.waitForFunction(image=>document.querySelector('#world-portrait img')?.src===image,asset.image);assert.equal(calls,1);
 await page.screenshot({path:'artifacts/archive-world-expression.png'});
 await page.locator('#world-close').tap();
 // Old wardrobe has an archive picker without a second image store.
 await page.locator('#world-menu-open').tap();await page.locator('.world-menu-grid').getByRole('button',{name:'人物',exact:true}).tap();await page.locator('[data-person=a]').tap();await page.locator('.looks-skin-card[data-skin=default]').getByRole('button',{name:'编辑',exact:true}).tap();await page.locator('[data-emotion=happy]').tap();await page.locator('#looks-pick-archive').tap();await page.locator('#archive-picker .archive-picture-card').first().tap();await page.locator('#looks-save').tap();await page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');assert.equal((await read()).character_looks.a.portraits.find(p=>p.emotion==='happy').asset_id,asset.id);
 await page.locator('#looks-close').tap();await page.reload();await ready();data=await read();assert.equal(data.character_archive.items.length,2);assert.equal(data.character_looks.a.portraits[0].asset_id,asset.id);
 const restored=await page.evaluate(async()=>{const {validateBackup}=await import('/assets/local-service.js'),d=await fixtureService.api('/backup');return validateBackup(d).character_archive;}).catch(async()=>{return page.evaluate(async()=>{const {BrowserPersistence,validateBackup}=await import('/assets/local-service.js');return validateBackup(await new BrowserPersistence().load()).character_archive;});});assert.deepEqual(restored,data.character_archive);
 assert.deepEqual(errors,[]);console.log('PASS: archive upload/name, custom expression, character isolation, failed-save retry, fixed return, scene portrait, wardrobe picker and restart/backup');
}finally{await browser.close();}
