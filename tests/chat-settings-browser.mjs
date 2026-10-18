import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],sent=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/chat/completions',async route=>{
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'}});
 sent.push(route.request().postDataJSON());
 await route.fulfill({headers:{'access-control-allow-origin':'*','content-type':'text/event-stream'},body:'data: {"choices":[{"delta":{"content":"固定回复"}}]}\n\ndata: [DONE]\n\n'});
});
const open=id=>page.locator('#'+id+'[open]').waitFor();
const close=id=>page.locator('#'+id+' [data-close]').click();
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8018/');await ready();
 await page.evaluate(async()=>{
  const {BrowserPersistence,emptyData}=await import('/assets/local-service.js');const d=emptyData();
  d.settings.model='mock';d.settings.base_url='https://fixture.example/v1';d.memory={version:1,events:[],summaries:[],anchors:[],links:[],watermarks:{},settings:{recall:false}};
  for(const id of ['a','b']){
   d.characters.push({id,name:id==='a'?'甲':'乙',identity:'测试人物',style:'',avatar:''});
   d.sessions.push({id:'chat-'+id,character_id:id,note:'',voice:'',background:'#eef2f3',created_at:'2026-01-01T00:00:00Z'});
   for(let n=0;n<25;n++){const start=d.messages.length+1;d.messages.push({id:start,session_id:'chat-'+id,role:'user',content:'问题'+n,created_at:'2026-01-01T00:00:00Z'},{id:start+1,session_id:'chat-'+id,role:'assistant',content:'回复'+n,created_at:'2026-01-01T00:00:00Z'});d.turns.push({request_id:id+n,session_id:'chat-'+id,user_id:start,assistant_id:start+1,state:'complete'});}
  }
  const p=new BrowserPersistence();await p.load();await p.save(d);
 });
 await page.reload();await ready();await page.locator('.app-grid [data-app="settings"]').click();
 await page.locator('#history-limit').fill('37');await page.locator('#context-form button').click();
 await page.getByText('全局默认已保存；跟随全局的聊天下次发送生效',{exact:true}).waitFor();
 await page.locator('#home-button').click();await page.locator('.app-grid [data-app="chat"]').click();
 const contact=name=>page.locator('#contacts .contact').filter({hasText:name});
 await contact('甲').click();await page.locator('#details').click();
 assert.equal(await page.locator('#chat-history-mode').inputValue(),'inherit');
 assert.equal(await page.locator('#chat-history-limit').isEnabled(),true);
 await page.locator('#chat-history-limit').fill('7');assert.equal(await page.locator('#chat-history-mode').inputValue(),'custom');
 await page.locator('#details-form button').click();await page.locator('#details-dialog').waitFor({state:'hidden'});
 await page.reload();await ready();await page.locator('.app-grid [data-app="chat"]').click();await contact('甲').click();
 const send=async text=>{await page.locator('#input').fill(text);await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);};
 await send('甲测试');assert.equal(sent.at(-1).messages.length,9);
 await page.locator('#back').click();await contact('乙').click();await send('乙测试');assert.equal(sent.at(-1).messages.length,39);
 await page.locator('#back').click();await contact('甲').click();await page.locator('#details').click();
 assert.equal(await page.locator('#chat-history-limit').inputValue(),'7');
 // Invalid and empty numbers cannot silently become zero or overwrite the saved value.
 await page.locator('#chat-history-limit').fill('2001');await page.locator('#details-form button').click();
 await page.getByText('历史消息条数应为 0–2000 的整数',{exact:true}).waitFor();await open('details-dialog');
 await page.locator('#chat-history-limit').fill('');assert.equal(await page.locator('#details-form').evaluate(e=>e.checkValidity()),false);
 await page.locator('#chat-history-mode').selectOption('inherit');assert.equal(await page.locator('#chat-history-limit').inputValue(),'37');
 await page.locator('#note').fill('尚未保存的备注');
 for(const kind of ['button','escape','android']){
  await page.locator('#chat-style-open').click();await open('chat-style-dialog');
  if(kind==='button')await close('chat-style-dialog');
  else if(kind==='escape')await page.keyboard.press('Escape');
  else assert.equal(await page.evaluate(()=>window.tGoBack()),true);
  await open('details-dialog');assert.equal(await page.locator('#note').inputValue(),'尚未保存的备注');
 }
 await page.locator('#chat-style-open').click();await page.locator('#action-prompt').fill('自定义线上动作 {{char}}');
 await page.locator('#chat-style-form button.primary').click();await open('details-dialog');
 assert.equal(await page.locator('#note').inputValue(),'尚未保存的备注');
 await page.locator('#history-open').click();await open('history-dialog');await close('history-dialog');await open('details-dialog');
 await page.locator('#edit-current').click();await open('character-dialog');await close('character-dialog');await open('details-dialog');
 await page.locator('#details-form button').click();await page.locator('#details-dialog').waitFor({state:'hidden'});
 await send('恢复继承');assert.equal(sent.at(-1).messages.length,39);
 await page.locator('#details').click();await page.locator('#history-open').click();
 await page.locator('#search-query').fill('问题1');await page.locator('#search-form button').click();
 await page.locator('#search-results button').first().click();
 await page.waitForTimeout(100);assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('#details').click();await page.locator('#chat-history-limit').fill('0');await page.locator('#details-form button').click();
 await page.locator('#details-dialog').waitFor({state:'hidden'});await send('不带历史');assert.equal(sent.at(-1).messages.length,2);
 // Leaving the conversation must not resurrect its parent dialog later.
 await page.locator('#details').click();await page.locator('#chat-style-open').click();
 await page.evaluate(()=>document.getElementById('home-button').click());
 await page.waitForTimeout(100);assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.locator('#home').isVisible(),true);assert.deepEqual(errors,[]);
 console.log('PASS: direct custom input, global/per-character isolation and persisted request counts; invalid values; nested return via button/Escape/Android callback/save; parent draft retention and navigation cleanup.');
}catch(e){await page.screenshot({path:'artifacts/chat-settings-failure.png'});throw e;}finally{await browser.close();}

