// Synthetic mobile touch acceptance, intercepted model and TTS. No paid calls.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
const tapMenu=async name=>{await page.locator('#world-menu-open').tap();await page.locator('#world-menu').getByRole('button',{name,exact:true}).tap();};
async function actor(id){const d=await read(),p=d.world.positions[id],r=await page.locator('#world-canvas').boundingBox();await page.touchscreen.tap(r.x+(p.x+.5)/12*r.width,r.y+(.4+(p.y-3)*.065)*r.height-r.width*.075);}
await page.route('**/chat/completions',async route=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  sent.push(route.request().postDataJSON());const content='雨也在窗边。\n\n我去拉一下窗帘。\n[世界行动:{"type":"interact","target_id":"window"}]';
  await route.fulfill({status:200,headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n'});
});
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8014/');await ready();
  await page.evaluate(async()=>{
    const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),s=new BrowserPersistence(),d=emptyData();await s.load();
    d.characters=[{id:'a',name:'林',identity:'合成身份',style:'',avatar:''},{id:'b',name:'雨',identity:'另一份合成身份',style:'',avatar:''}];d.settings.model='mock';d.settings.base_url='https://fixture.example/v1';await s.save(d);
  });await page.reload();await ready();
  await page.evaluate(()=>{window.spoken=[];window.speechSynthesis.getVoices=()=>[{name:'mock',voiceURI:'mock',lang:'zh-CN'}];window.speechSynthesis.speak=u=>window.spoken.push(u.text);window.speechSynthesis.cancel=()=>{};});
  await page.locator('[data-app="world"]').tap();await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('#world-canvas').dataset.drawn==='yes');
  assert.equal(await page.locator('#api-floating-switcher').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'浇水',exact:true}).count(),0,'no remote watering');
  // Tap plant to approach, then explicitly water. Approach alone cannot water it.
  const bounds=await page.locator('#world-canvas').boundingBox();await page.touchscreen.tap(bounds.x+bounds.width*.10,bounds.y+bounds.height*.74);
  await page.getByRole('button',{name:'浇水',exact:true}).waitFor();let d=await read();assert.equal(d.world.events.filter(e=>e.source.command?.target_id==='plant').length,0);
  await page.getByRole('button',{name:'浇水',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('#world-action-status').textContent.includes('浇了水'));
  assert.equal((await read()).world.events.filter(e=>e.source.command?.target_id==='plant').length,1);
  await page.screenshot({path:'artifacts/visual-browser-explore.png'});
  await actor('a');await page.locator('#world-dialogue[open]').waitFor();
  const room=await page.locator('#world-canvas').boundingBox(),dialog=await page.locator('#world-dialogue').boundingBox();assert.equal(Math.round(room.height),Math.round(bounds.height),'dialogue cannot compress room');assert.ok(dialog.y>room.y,'bottom dialogue overlays the room');
  await page.locator('#world-input').fill('房间里还有谁？去试试窗帘。');await page.locator('#world-send').tap();await page.waitForFunction(()=>document.querySelector('#world-dialogue-status').textContent==='已保存对话与世界事件');
  assert.equal(sent.length,1);assert.match(sent[0].messages[0].content,/room_occupants/);assert.match(sent[0].messages[0].content,/雨/);assert.doesNotMatch(sent[0].messages[0].content,/另一份合成身份/);
  d=await read();assert.equal(d.world.curtain,true);assert.equal(d.turns[0].world_action.state,'complete');assert.ok(d.world.events.filter(e=>e.source.type==='scene_action').length>=1);
  const before=JSON.stringify(d);await page.locator('#world-next').tap();assert.match(await page.locator('#world-current-line').textContent(),/拉一下窗帘/);
  await page.locator('#world-replay').tap();await page.locator('#world-replay').tap();assert.equal(sent.length,1);assert.equal(await page.evaluate(()=>spoken.length),2);assert.doesNotMatch(await page.evaluate(()=>spoken[0]),/世界行动/);assert.equal(JSON.stringify(await read()),before,'replay reads saved text only');
  await page.locator('#world-records').tap();await page.locator('#world-history-dialog[open]').waitFor();assert.match(await page.locator('#world-lines').textContent(),/雨也在窗边/);assert.equal(await page.getByRole('button',{name:'回看这几句',exact:true}).count(),0);await page.locator('#world-history-close').tap();
  await page.screenshot({path:'artifacts/visual-browser-dialogue.png'});
  await page.locator('#world-close').tap();await tapMenu('人物');await page.locator('#world-looks-dialog[open]').waitFor();
  await page.locator('#looks-owner').selectOption('a');await page.locator('.looks-default summary').tap();await page.locator('#looks-skin').selectOption('2');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
  for(const name of ['表情甲','表情乙']){await page.locator('#looks-portrait-file').setInputFiles({name:name+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(n=>document.querySelector('#looks-portrait-choice').options.length===n,name==='表情甲'?1:2);}
  await page.locator('#looks-tab-sprite').tap();await page.locator('#looks-sprite-file').setInputFiles({name:'walk.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('#looks-direction').selectOption('up');await page.locator('#looks-save').tap();await page.waitForFunction(()=>document.querySelector('#looks-status').textContent==='人物形象已保存');
  d=await read();assert.equal(d.character_looks.a.skin,2);assert.equal(d.character_looks.a.portraits.length,2);assert.equal(d.character_looks.a.sprite.frames,4);assert.equal(d.characters[0].identity,'合成身份');await page.screenshot({path:'artifacts/visual-browser-looks.png'});
  await page.locator('#looks-close').tap();await page.locator('#world-menu-open').tap();await page.screenshot({path:'artifacts/visual-browser-menu.png'});assert.equal(await page.locator('.world-menu-grid button').count(),10);
  await page.reload();await ready();await page.locator('[data-app="world"]').tap();assert.deepEqual((await read()).character_looks,d.character_looks);
  assert.deepEqual(errors,[]);console.log('PASS: near-only touch interaction, bottom portrait dialogue, room perception, executed curtain action, saved-text/TTS replay, history, appearance import/preview/save/reload, menu and original API access');
}catch(e){console.log('UI diagnostics',errors,await page.locator('#world-dialogue-status').textContent(),await page.locator('#toast').textContent());await page.screenshot({path:'artifacts/visual-browser-failure.png'});throw e;}finally{await browser.close();}
