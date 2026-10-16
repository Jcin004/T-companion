import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept(d.type()==='prompt'?'日常使用':undefined));
const requests=[];
await page.route('**/v1/chat/completions',async route=>{
  const r=route.request();if(r.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}const body=r.postDataJSON();requests.push({model:body.model,key:r.headers().authorization,prompt:body.messages[0]?.content});
  const text='第一条消息\n\n第二条消息\n\n[动作:笑着挥手][表情:🙂][语音:晚上好]';
  await route.fulfill({status:200,headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\ndata: [DONE]\n\n'});
});
try{
  await page.goto('http://127.0.0.1:8012/');await page.locator('.app-grid [data-app="appearance"]').click();
  await page.locator('#wallpaper').selectOption('dusk');await page.locator('#icon-style').selectOption('glass');await page.locator('#font-family').selectOption('serif');await page.locator('#bubble-user').fill('#badcfa');await page.locator('#appearance-form button.primary').click();
  await page.waitForFunction(()=>document.querySelector('.phone').dataset.icons==='glass');
  await page.screenshot({path:'artifacts/appearance-0.4.png'});
  await page.locator('#home-button').click();await page.screenshot({path:'artifacts/desktop-0.4.png'});
  await page.locator('.app-grid [data-app="settings"]').click();assert.equal(await page.locator('#settings #theme').count(),0);
  await page.locator('#profile-name').fill('主连接');await page.locator('#base-url').fill('https://model-a.example/v1');await page.locator('#model').fill('model-a');await page.locator('#api-key').fill('test-key-a');await page.locator('#model-form button.primary').click();
  await page.waitForFunction(()=>document.querySelector('#active-model-label').textContent.includes('主连接'));
  await page.locator('#new-group').click();await page.getByText('▱ 日常使用',{exact:true}).waitFor();
  await page.locator('#new-profile').click();await page.locator('#profile-name').fill('备用连接');await page.locator('#profile-group').selectOption({label:'日常使用'});await page.locator('#base-url').fill('https://model-b.example/v1');await page.locator('#model').fill('model-b');await page.locator('#api-key').fill('test-key-b');await page.locator('#model-form button.primary').click();
  const other=page.locator('#profile-list .connection-row').filter({has:page.getByText('备用连接',{exact:true})});await other.getByRole('button',{name:'切换',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#active-model-label').textContent.includes('备用连接'));
  await page.screenshot({path:'artifacts/api-groups-0.4.png'});
  await page.locator('#home-button').click();await page.locator('.app-grid [data-app="roster"]').click();await page.locator('#add-character').click();await page.locator('#character-name').fill('林');await page.locator('#character-style').fill('喜欢简短自然的交流');await page.locator('#character-form button.primary').click();await page.locator('#characters button.primary').click();
  await page.locator('#details').click();await page.locator('#chat-style-open').click();await page.locator('#allow-actions').check();await page.locator('#emoji-weight').fill('60');await page.locator('#voice-weight').fill('30');await page.screenshot({path:'artifacts/chat-style-0.4.png'});await page.locator('#chat-style-form button.primary').click();await page.getByText('当前聊天风格已保存',{exact:true}).waitFor();
  await page.locator('#input').fill('【模拟验证】分条与动作');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.message.assistant .bubble').length===5);await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.equal(await page.locator('.message.assistant .bubble').count(),5);assert.equal(await page.locator('.reply-voice').count(),1);assert.equal(requests[0].key,'Bearer test-key-b');assert.match(requests[0].prompt,/当前私聊表达设置/);
  await page.screenshot({path:'artifacts/chat-expressions-0.4.png'});
  await page.locator('#switch-model').click();await page.locator('#model-switch-list .connection-row').filter({hasText:'主连接'}).getByRole('button',{name:'切换',exact:true}).click();await page.getByText('已切换到 主连接',{exact:true}).waitFor();await page.locator('#input').fill('换连接后继续');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===2);assert.equal(requests[1].key,'Bearer test-key-a');
  await page.reload();await page.locator('.app-grid [data-app="chat"]').click();await page.locator('#contacts .contact').click();assert.equal(await page.locator('.reply-voice').count(),2);assert.equal(await page.locator('#quick-actions').textContent(),'动作：开');
  await page.locator('#details').click();await page.locator('#chat-style-open').click();await page.locator('#allow-actions').uncheck();await page.locator('#emoji-weight').fill('0');await page.locator('#voice-weight').fill('0');await page.locator('#chat-style-form button.primary').click();await page.getByText('当前聊天风格已保存',{exact:true}).waitFor();
  await page.locator('#input').fill('关闭后不显示动作');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===3);const last=page.locator('.message.assistant').last();assert.equal(await last.locator('.reply-action,.reply-emoji,.reply-voice').count(),0);assert.ok((await last.textContent()).includes('晚上好'));
  await page.locator('#home-button').click();await page.locator('.app-grid [data-app="settings"]').click();const dl=page.waitForEvent('download');await page.locator('#backup').click();const file=await (await dl).path();const {readFile}=await import('node:fs/promises');const data=await readFile(file,'utf8');assert.ok(!data.includes('test-key-a')&&!data.includes('test-key-b'));
  assert.deepEqual(errors,[]);console.log('PASS: appearance app; grouped API switching with separate keys; split/action/emoji/voice; refresh; secret-free backup. Mock model only.');
}catch(e){await page.screenshot({path:'artifacts/preferences-failure.png'});console.error('Browser status:',await page.locator('#status').textContent(),'Toast:',await page.locator('#toast').textContent(),'requests',requests.length,'errors',errors);throw e;}finally{await browser.close();}
