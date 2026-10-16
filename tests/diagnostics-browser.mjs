import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));let failure=true;const sent=[];
await page.route('**/chat/completions',async route=>{
 if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'}});return;}
 sent.push(route.request().postDataJSON());
 await route.fulfill(failure?{status:401,headers:{'access-control-allow-origin':'*'},body:'unauthorized'}:{status:200,headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: {"choices":[{"delta":{"content":"日志测试回复"}}]}\n\ndata: [DONE]\n\n'});
});
const home=async app=>{await page.locator('#home-button').click();await page.locator(`.app-grid [data-app="${app}"]`).click();};
try{
 await page.goto('http://127.0.0.1:8012/');await page.locator('.app-grid [data-app="settings"]').click();
 await page.locator('#model').fill('diagnostic-fixture');await page.locator('#base-url').fill('https://fixture.example/v1');await page.locator('#api-key').fill('diagnostic-test-private-key');await page.locator('#model-form button.primary').click();
 await home('roster');await page.locator('#add-character').click();await page.locator('#character-name').fill('日志测试角色');await page.locator('#character-identity').fill('住在山间');await page.locator('#character-form button.primary').click();await page.locator('#characters button.primary').click();
 await page.locator('#input').fill('当前未发送的草稿');await home('logs');await page.locator('#context-refresh').click();await page.getByText('当前未发送的草稿',{exact:false}).last().waitFor();assert.match(await page.locator('#context-preview').textContent(),/住在山间/);
 await home('chat');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#send').disabled===false);await home('logs');await page.locator('#log-filter').selectOption('error');await page.getByText(/模型请求 · failed/).click();await page.waitForFunction(()=>document.querySelector('#log-list').textContent.includes('拒绝授权'));
 await page.locator('#log-filter').selectOption('request');const details=page.locator('#log-list details').first();await details.locator('summary').click();await page.locator('#logs').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'artifacts/logs-0.5.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.locator('#log-export').click();const download=await downloadPromise;const data=JSON.parse(await readFile(await download.path(),'utf8'));assert.ok(!JSON.stringify(data).includes('diagnostic-test-private-key'));
 const request=data.entries.find(e=>e.category==='request');assert.deepEqual(request.messages,sent[0].messages);assert.equal(request.state,'failed');
 await page.locator('#capture-context').uncheck();failure=false;await home('chat');await page.locator('#input').fill('关闭上下文记录后的新请求');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#messages').textContent.includes('日志测试回复')&&!document.querySelector('#send').disabled);
 await page.reload();await page.locator('.app-grid [data-app="logs"]').click();assert.equal(await page.locator('#capture-context').isChecked(),false);await page.locator('#log-filter').selectOption('request');await page.locator('#log-list details').first().locator('summary').click();await page.waitForFunction(()=>document.querySelector('#log-list details').textContent.includes('本次未开启'));
 await page.locator('#log-clear').click();await page.reload();await page.locator('.app-grid [data-app="logs"]').click();await page.locator('#log-filter').selectOption('request');assert.equal(await page.locator('#log-list details').count(),0);assert.deepEqual(errors,[]);
 console.log('Logs UI passed: draft preview, actual sent context equality, HTTP errors, redacted export, opt-out, restart, clear, independent app.');
}finally{await browser.close();}
