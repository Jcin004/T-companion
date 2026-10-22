import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/chat/completions',async route=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  sent.push(route.request().postDataJSON());
  await route.fulfill({status:200,headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'模拟回复：一起看看小屋吧。'}}]})+'\n\ndata: [DONE]\n\n'});
});
const app=id=>page.locator('.app-grid [data-app="'+id+'"]').tap();
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8014/');await ready();
  await page.evaluate(async()=>{
    const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),store=new BrowserPersistence(),d=emptyData();
    d.characters=[{id:'a',name:'林',identity:'',style:'',avatar:''},{id:'b',name:'雨',identity:'',style:'',avatar:''}];
    d.settings.model='mock';d.settings.base_url='https://fixture.example/v1';await store.load();await store.save(d);
  });await page.reload();await ready();await app('world');
  await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-canvas').waitFor();
  await page.screenshot({path:'artifacts/world-browser-room.png'});
  const canvas=page.locator('#world-canvas');let bounds=await canvas.boundingBox();
  await page.touchscreen.tap(bounds.x+5.5/12*bounds.width,bounds.y+(.4+(7-3)*.065)*bounds.height);
  await page.waitForTimeout(1600);
  await page.waitForTimeout(950);bounds=await canvas.boundingBox();
  await page.touchscreen.tap(bounds.x+4.5/12*bounds.width,bounds.y+(.4+(6-3)*.065)*bounds.height-bounds.width*.075);
  await page.locator('#world-dialogue[open]').waitFor();
  await page.locator('#world-input').fill('我们在小屋里聊聊。');await page.locator('#world-send').tap();
  await page.waitForFunction(()=>document.querySelector('#world-dialogue-status').textContent==='已保存对话与世界事件');
  assert.equal(sent.length,1);assert.match(sent[0].messages[0].content,/当前场景对话/);
  await page.screenshot({path:'artifacts/world-browser-dialogue.png'});
  await page.locator('#world-close').tap();await page.waitForFunction(()=>!document.body.classList.contains('world-talking'));await page.waitForFunction(()=>document.querySelector('#world-canvas').getBoundingClientRect().height>650);
  bounds=await canvas.boundingBox();await page.touchscreen.tap(bounds.x+bounds.width*.10,bounds.y+bounds.height*.74);await page.getByRole('button',{name:'浇水',exact:true}).waitFor();await page.getByRole('button',{name:'浇水',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('#world-action-status').textContent.includes('浇了水'));await page.locator('#world-menu-open').tap();await page.locator('#world-menu').getByRole('button',{name:'世界记录',exact:true}).tap();
  const save=page.getByRole('button',{name:'保存为林的经历',exact:true}).first();
  await save.tap();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已保存'));
  await page.locator('#world-events-panel header button').tap();await page.locator('#home-button').tap();await app('memory');
  await page.locator('.memory-card').first().waitFor();
  await page.locator('.memory-card .memory-source').first().tap();await page.locator('#world-source-dialog[open]').waitFor();
  await page.screenshot({path:'artifacts/world-browser-source.png'});
  await page.locator('#world-source-dialog').getByRole('button',{name:'关闭',exact:true}).tap();
  await page.locator('.memory-card').first().getByRole('button',{name:'编辑',exact:true}).tap();
  await page.locator('#memory-editor').getByRole('button',{name:'保存记忆',exact:true}).tap();await page.locator('#memory-editor').waitFor({state:'hidden'});
  await page.reload();await ready();await app('world');
  await page.waitForFunction(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');assert.match(await page.locator('#world-time').textContent(),/2 位居民/);
  assert.equal(await page.locator('.app-grid [data-app]').count(),8);
  assert.deepEqual(errors,[]);console.log('PASS: mobile touch movement, scene streaming, interactions, typed source/edit, reload and existing desktop entries');
}finally{await browser.close();}
