import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const home=()=>page.locator('#home-button').click();
const app=id=>page.locator('.app-grid [data-app="'+id+'"]').click();
await page.route('**/v1/chat/completions',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,content-type'}});
  requests.push(route.request().postDataJSON().messages);
  await route.fulfill({headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'},body:'data: '+JSON.stringify({choices:[{delta:{content:'模拟模型已收到这些材料'}}]})+'\n\ndata: [DONE]\n\n'});
});
try {
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8018/');await ready();
  const ids=await page.evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService();s.transport=async(a,k,m,delta)=>delta('已记录');
    const c=await s.api('/characters','POST',{name:'林',identity:'重视诚实',style:'简短',avatar:''}),chat=await s.api('/contacts','POST',{character_id:c.id});
    await s.api('/settings','PATCH',{model:'fixture',base_url:'https://memory-fixture.example/v1',api_key:'fixture-only-key'});
    for(const [index,word]of ['orchid','parcel'].entries()){
      await s.stream(chat.id,word,'fixture-'+index,()=>{});
      await s.api('/memories','POST',{owner_id:c.id,title:word,content:'用户提过 '+word,kind:'statement',evidence:[{message_id:index*2+1,quote:word}]});
    }
    await s.api('/self','POST',{owner_id:c.id,label:'诚实',interpretation:'愿意如实表达',quote:'重视诚实'});
    const [two,one]=await s.api('/memories?owner='+c.id),[anchor]=await s.api('/self?owner='+c.id);
    for(const [target,type,kind]of [[two,'causes','memory'],[anchor,'supports','anchor']])await s.api('/memory-links','POST',{owner_id:c.id,from:{kind:'memory',id:one.id},to:{kind,id:target.id},type,note:'人工确认的关联'});
    return {chat:chat.id,one:one.id,two:two.id,anchor:anchor.id};
  });
  await page.reload();await ready();await app('memory');await page.locator('#memory-config').click();
  const dialog=page.locator('#memory-settings-dialog');
  const context=dialog.getByLabel('指代提问参考最近几条用户消息');await context.fill('1');
  await dialog.getByRole('button',{name:'保存设置'}).click();await page.getByText('记忆设置已保存',{exact:true}).waitFor();
  await home();await app('chat');await page.locator('#contacts .contact').click();await page.locator('#input').fill('orchid');
  await home();await app('logs');await page.locator('#context-refresh').click();
  await page.locator('#context-preview .recall-receipt').waitFor();
  const preview=await page.locator('#context-preview .recall-receipt').textContent();assert.match(preview,/已复核关联（一跳）/);assert.match(preview,/已携带/);
  assert.ok((await page.locator('#context-preview').textContent()).includes(ids.anchor));
  await page.screenshot({path:'artifacts/memory-recall-preview.png'});
  await home();await app('chat');await page.locator('#send').click();
  await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.equal(requests.length,1);assert.ok(requests[0][0].content.includes(ids.one)&&requests[0][0].content.includes(ids.two)&&requests[0][0].content.includes(ids.anchor));
  await home();await app('logs');const latest=page.locator('.log-entry').first();await latest.locator('summary').click();
  await latest.locator('.recall-receipt').waitFor();assert.match(await latest.textContent(),/已复核关联（一跳）/);
  await page.screenshot({path:'artifacts/memory-recall-log.png'});
  await page.reload();await ready();await app('memory');await page.locator('#memory-config').click();
  assert.equal(await dialog.getByLabel('指代提问参考最近几条用户消息').inputValue(),'1');
  await dialog.getByLabel('沿已复核关联扩展一跳').uncheck();await dialog.getByLabel('使用人工保存的核心标签解读').uncheck();await dialog.getByRole('button',{name:'保存设置'}).click();
  await home();await app('chat');await page.locator('#contacts .contact').click();await page.locator('#input').fill('orchid');await page.locator('#send').click();await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  assert.equal(requests.length,2);
  const contextText=requests[1][0].content;
  assert.ok(contextText.includes(ids.one)&&!contextText.includes(ids.two)&&!contextText.includes(ids.anchor));
  assert.deepEqual(errors,[]);
  console.log('PASS: memory settings persistence; preview and request carry directed links/anchor evidence; readable receipt in logs; disabling links/anchors removes them. Mock model only.');
} finally {await browser.close();}
