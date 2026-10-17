import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
await page.route('**/v1/chat/completions',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  sent.push({body:route.request().postDataJSON(),key:route.request().headers().authorization});
  await route.fulfill({headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: '+JSON.stringify({choices:[{delta:{content:'模拟回复'}}]})+'\n\ndata: [DONE]\n\n'});
});
try {
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8018/');await ready();
  const ids=await page.evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService();
    await s.api('/model-profiles/legacy','PATCH',{name:'聊天 A',base_url:'https://a.example/v1',model:'model-a',protocol:'openai-chat',api_key:'fixture-a'});
    const [group]=await s.api('/model-groups','POST',{name:'日常'});
    await s.api('/model-profiles','POST',{name:'聊天 B',group_id:group.id,base_url:'https://b.example/v1',model:'model-b',protocol:'openai-chat',api_key:'fixture-b'});
    await s.api('/model-profiles','POST',{name:'记忆专用',base_url:'https://memory.example/v1',model:'memory',protocol:'openai-chat',api_key:'fixture-memory'});
    const profiles=await s.api('/model-profiles'),memory=profiles.find(p=>p.name==='记忆专用');
    await s.api('/memory-settings','PATCH',{profile_id:memory.id});
    const character=await s.api('/characters','POST',{name:'林',identity:'',style:'',avatar:''});await s.api('/contacts','POST',{character_id:character.id});
    return {memory:memory.id,b:profiles.find(p=>p.name==='聊天 B').id};
  });
  await page.reload();await ready();
  const ball=page.locator('#api-floating-switcher');assert.match(await ball.getAttribute('aria-label'),/聊天 A/);
  const before=await ball.boundingBox();
  await page.mouse.move(before.x+29,before.y+29);await page.mouse.down();await page.mouse.move(before.x-150,before.y-100,{steps:8});await page.mouse.up();
  assert.equal(await page.locator('#model-switch-dialog').isVisible(),false);
  const moved=await ball.boundingBox();assert.ok(moved.x<before.x-100);
  await ball.click();await page.locator('#model-switch-dialog').waitFor();
  assert.equal(await page.locator('#model-switch-list h3').filter({hasText:'日常'}).count(),1);
  await page.locator('#model-switch-list .connection-row').filter({hasText:'聊天 B'}).getByRole('button',{name:'切换',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#api-floating-switcher').getAttribute('aria-label').includes('聊天 B'));
  const settings=await page.evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService();return {chat:(await s.api('/settings')).active_profile_id,memory:(await s.api('/memory-settings')).profile_id};});
  assert.deepEqual(settings,{chat:ids.b,memory:ids.memory});
  await page.locator('.app-grid [data-app="chat"]').click();await page.locator('#contacts .contact').click();
  await page.locator('#input').fill('切换后发送');await page.locator('#send').click();
  await page.waitForFunction(()=>!document.querySelector('#send').disabled&&!!document.querySelector('.message.assistant'));
  assert.equal(sent[0].body.model,'model-b');assert.equal(sent[0].key,'Bearer fixture-b');
  await page.reload();await ready();const restored=await ball.boundingBox();assert.ok(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2);
  assert.match(await ball.getAttribute('aria-label'),/聊天 B/);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const r=document.querySelector('#api-floating-switcher').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
  const small=await ball.boundingBox();assert.ok(small.x>=0&&small.x+small.width<=390&&small.y+small.height<=844);
  await page.screenshot({path:'artifacts/api-floating-ball.png'});
  await ball.focus();await page.keyboard.press('Enter');await page.locator('#model-switch-dialog').waitFor();
  await page.screenshot({path:'artifacts/api-floating-switcher.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: app-wide draggable API ball; grouped preset switch; correct model/key; dedicated memory profile unchanged; position reload/resize; keyboard access. Mock model only.');
} finally {await browser.close();}
