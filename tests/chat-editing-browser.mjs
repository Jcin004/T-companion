import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const url=process.env.T_TEST_URL||'http://127.0.0.1:8018/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1000,height:900},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage(),prompts=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/v1/chat/completions',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  prompts.push(route.request().postDataJSON().messages[0].content);
  await route.fulfill({headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: '+JSON.stringify({choices:[{delta:{content:'第一条消息\n\n[动作:在自己这端笑了笑]'}}]})+'\n\ndata: [DONE]\n\n'});
});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const clipboard=()=>page.evaluate(()=>navigator.clipboard.readText());
try {
  await page.goto(url);await ready();
  await page.locator('.app-grid [data-app="settings"]').click();
  await page.locator('#base-url').fill('https://chat-fixture.example/v1');
  await page.locator('#model').fill('fixture');await page.locator('#api-key').fill('fixture-key');
  await page.locator('#model-form button.primary').click();
  await page.getByText('连接已保存；可点击切换使用',{exact:true}).waitFor();
  await page.locator('#home-button').click();await page.locator('.app-grid [data-app="roster"]').click();
  await page.locator('#add-character').click();await page.locator('#character-name').fill('林');
  await page.locator('#character-form button.primary').click();await page.locator('#characters button.primary').click();
  await page.locator('#details').click();await page.locator('#chat-style-open').click();
  await page.locator('#allow-actions').check();assert.match(await page.locator('#action-prompt').inputValue(),/线上私聊/);
  const template='{{char}}向{{user}}发消息，动作倾向{{action_weight}}；用[动作:描写]表达自己这端的表情。';
  await page.locator('#action-prompt').fill(template);
  await page.locator('#chat-style-form button.primary').click();await page.getByText('当前聊天风格已保存',{exact:true}).waitFor();await page.locator('#details-dialog[open]').waitFor();await page.locator('#details-dialog [data-close]').click();
  await page.locator('#input').fill('你好');await page.locator('#send').click();
  await page.waitForFunction(()=>!document.querySelector('#send').disabled&&document.querySelectorAll('.reply-action').length===1);
  assert.match(prompts[0],/林向用户发消息，动作倾向40/);
  const bubble=page.locator('.message.assistant .reply-text');
  await bubble.click({button:'right'});
  await page.getByRole('menuitem',{name:'复制整条消息',exact:true}).click();
  assert.match(await clipboard(),/第一条消息/);
  await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'选择整条消息'}).click();
  assert.match(await page.evaluate(()=>getSelection().toString()),/自己这端/);
  await bubble.click({button:'right'});await page.getByRole('menuitem',{name:'复制所选文字'}).click();
  assert.match(await clipboard(),/第一条消息/);
  await page.locator('#input').fill('abc');
  await page.locator('#input').click({button:'right'});await page.getByRole('menuitem',{name:'全选',exact:true}).click();
  assert.equal(await page.locator('#input').evaluate(e=>e.value.slice(e.selectionStart,e.selectionEnd)),'abc');
  await page.locator('#input').click({button:'right'});await page.getByRole('menuitem',{name:'剪切',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#input').value==='');assert.equal(await clipboard(),'abc');
  await page.locator('#input').click({button:'right'});await page.getByRole('menuitem',{name:'粘贴',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#input').value==='abc');
  // Clipboard write failures must use the fallback rather than claiming success.
  await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw Error('fixture denied');}}));
  await page.locator('.message.assistant .message-tools button').filter({hasText:'复制'}).click();
  assert.match(await clipboard(),/第一条消息/);
  await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'readText',{configurable:true,value:async()=>{throw Error('fixture denied');}}));
  await page.locator('#input').click({button:'right'});await page.getByRole('menuitem',{name:'粘贴',exact:true}).click();
  await page.getByText('未获剪贴板权限，请用 Ctrl+V 或手机长按粘贴',{exact:true}).waitFor();
  assert.equal(await page.locator('#input').inputValue(),'abc');
  await page.reload();await ready();await page.locator('.app-grid [data-app="chat"]').click();await page.locator('#contacts .contact').click();
  await page.locator('#details').click();await page.locator('#chat-style-open').click();
  assert.equal(await page.locator('#action-prompt').inputValue(),template);
  await page.locator('#reset-action-prompt').click();assert.match(await page.locator('#action-prompt').inputValue(),/线上私聊/);
  await page.screenshot({path:'artifacts/chat-action-template.png'});
  assert.deepEqual(errors,[]);
  // Android touch context menus must remain available to the OS.
  await page.locator('#chat-style-dialog [data-close]').click();
  assert.equal(await bubble.evaluate(e=>e.dispatchEvent(new PointerEvent('contextmenu',{bubbles:true,cancelable:true,pointerType:'touch'}))),true);
  assert.equal(await page.locator('.text-menu').isVisible(),false);
  console.log('PASS: action template persistence and real prompt; message selection/copy; composer cut/paste/select; clipboard fallback/denial; touch menu preserved. Mock model only.');
} catch(e) {
  await page.screenshot({path:'artifacts/chat-editing-failure.png'});throw e;
} finally {await browser.close();}

