// Real browser -> fixture HTTP gateway -> pinned OB core. Chat provider is mocked.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const url=process.env.T_TEST_URL||'http://127.0.0.1:8028/';
const gateway=process.env.T_OB_TEST_GATEWAY||'http://127.0.0.1:8029';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],messages=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
await page.route('https://model-fixture.example/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,authorization'}});
  messages.push(route.request().postDataJSON().messages);
  await route.fulfill({headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: '+JSON.stringify({choices:[{delta:{content:'模拟模型收到记忆'}}]})+'\n\ndata: [DONE]\n\n'});
});
try{
  await page.goto(url);await ready();
  const chat=await page.evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');const service=await createLocalService();
    const person=await service.api('/characters','POST',{name:'林',identity:'测试人物',style:'',avatar:''});
    // Synthetic fixture identity only, in an isolated browser profile.
    await service.transact(d=>{d.characters.find(c=>c.id===person.id).id='lin';});
    await service.api('/settings','PATCH',{base_url:'https://model-fixture.example/v1',model:'fixture',api_key:'synthetic-model-key'});
    return (await service.api('/contacts','POST',{character_id:'lin'})).id;
  });
  await page.reload();await ready();await page.locator('[data-app=memory]').click();await page.locator('#external-memory-open').click();
  const dialog=page.locator('#external-memory-dialog');
  await dialog.getByLabel('聊天前查询外部记忆').check();await dialog.getByLabel('网关地址').fill(gateway);await dialog.getByLabel('访问口令').fill('synthetic-gateway-token-only-for-tests');
  await dialog.getByRole('button',{name:'保存外部记忆设置'}).click();await dialog.getByText('已保存；只影响后续请求',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'测试已保存连接'}).click();await dialog.getByText('连接成功；当前网关为关键词/BM25，未启用向量',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('访问口令').inputValue(),'');
  const result=await page.evaluate(async chat=>{
    const {createLocalService}=await import('/assets/local-service.js');const service=await createLocalService();
    const preview=await service.api('/contacts/'+chat+'/context-preview','POST',{message:'青瓷兰花'});
    await service.stream(chat,'青瓷兰花','browser-ob',()=>{});
    return {preview:preview.messages,external:preview.external,backup:await service.api('/backup')};
  },chat);
  assert.equal(result.external.records.length,1);assert.ok(result.external.records[0].content.includes('花盆裂了'));
  assert.deepEqual(messages[0],result.preview);assert.ok(!JSON.stringify(result.backup).includes('synthetic-gateway-token'));
  await page.reload();await ready();await page.locator('[data-app=memory]').click();await page.locator('#external-memory-open').click();
  await dialog.getByText('此地址已有口令',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('访问口令').inputValue(),'');
  await page.screenshot({path:'artifacts/external-memory-browser.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: real OB HTTP recall, UI connection test, preview/request parity, persisted origin-bound credential; mocked chat');
}finally{await browser.close();}
