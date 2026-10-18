import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));let variant=0;
await page.route('**/v1/chat/completions',async route=>{
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
 const request=route.request().postDataJSON();requests.push(request);const rows=JSON.parse(request.messages[1].content);
 const one=rows.find(r=>r.title==='orchid'),two=rows.find(r=>r.title==='parcel');
 const proposal={from:{kind:'memory',id:one.id},to:{kind:'memory',id:two.id},type:variant++?'contradicts':'supplements',reason:'需要人工核对的关联理由',proof:[{kind:'memory',id:one.id,...one.evidence[0]},{kind:'memory',id:two.id,...two.evidence[0]}]};
 await route.fulfill({headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({proposals:[proposal]})}}]})+'\n\ndata: [DONE]\n\n'});
});
const ready=()=>page.waitForFunction(()=>document.getElementById('status')?.textContent==='记录保存在本机');
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8018/');await ready();
 const seed=await page.evaluate(async()=>{
  const {createLocalService}=await import('/assets/local-service.js');const s=await createLocalService();s.transport=async(c,k,m,delta)=>delta('固定回复');
  const a=await s.api('/characters','POST',{name:'候选测试人物',identity:'重视诚实',style:'',avatar:''}),b=await s.api('/characters','POST',{name:'另一个人物',identity:'',style:'',avatar:''});
  await s.api('/settings','PATCH',{model:'chat-fixture',base_url:'https://fixture.example/v1'});
  const chat=await s.api('/contacts','POST',{character_id:a.id});
  for(const [n,word]of ['orchid','parcel','不应发送的未选内容'].entries()){
   await s.stream(chat.id,word,'seed'+n,()=>{});
   await s.api('/memories','POST',{owner_id:a.id,title:word,content:word,kind:'statement',evidence:[{message_id:n*2+1,quote:word}]});
  }
  await s.api('/model-profiles','POST',{name:'记忆专用',base_url:'https://fixture.example/v1',model:'memory-fixture',api_key:'',protocol:'openai-chat'});
  const profile=(await s.api('/model-profiles')).find(p=>p.name==='记忆专用');await s.api('/memory-settings','PATCH',{profile_id:profile.id});
  return {a:a.id,b:b.id,one:s.data.memory.events[0].id,two:s.data.memory.events[1].id};
 });
 await page.reload();await ready();await page.locator('.app-grid [data-app="memory"]').click();
 const open=async()=>{
  await page.locator('.memory-card[data-memory-id="'+seed.one+'"] button').filter({hasText:'查看关联'}).click();
  await page.getByRole('button',{name:'AI 关联候选',exact:true}).click();
 };
 const generate=async()=>{
  await page.getByRole('button',{name:'选择材料并生成候选',exact:true}).click();
  await page.locator('input[data-ref="memory:'+seed.two+'"]').check();
  await page.locator('#memory-proposal-generate').click();
  await page.locator('[data-proposal-id]').waitFor();
 };
 await open();await page.locator('#memory-link-proposals-dialog[open]').waitFor();
 await page.getByRole('button',{name:'选择材料并生成候选',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.tGoBack()),true);
 await page.locator('#memory-link-proposals-dialog').waitFor({state:'hidden',timeout:2000});
 assert.equal(await page.locator('#memory-links-dialog').isVisible(),true);
 await page.getByRole('button',{name:'AI 关联候选',exact:true}).click();
 await generate();assert.equal(requests.length,1);assert.equal(requests[0].model,'memory-fixture');assert.ok(!requests[0].messages[1].content.includes('不应发送'));
 assert.equal(await page.evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService()).data.memory.links.length;}),0);
 const card=page.locator('[data-proposal-id]');assert.equal(await card.locator('.memory-source').count(),2);
 await card.locator('.proposal-type').selectOption('causes');await card.locator('.proposal-note').fill('人工改为因果解读，仍可复核');await card.locator('.proposal-accept').click();
 await page.getByText('已确认；关联按当前召回设置生效',{exact:true}).waitFor();
 await page.locator('#memory-link-proposals-dialog header button').click();
 await page.locator('#memory-links-dialog .memory-link').waitFor();assert.match(await page.locator('#memory-links-dialog').textContent(),/人工改为因果解读/);
 await page.locator('#memory-links-dialog header button').click();
 await page.reload();await ready();await page.locator('.app-grid [data-app="memory"]').click();await open();
 await page.getByText('已处理候选',{exact:true}).click();await page.getByText(/已确认 · orchid/).waitFor();
 await generate();
 await page.evaluate(async id=>{const {createLocalService}=await import('/assets/local-service.js');await(await createLocalService()).api('/memories/'+id,'PATCH',{active:false});},seed.two);
 await page.reload();await ready();await page.locator('.app-grid [data-app="memory"]').click();await open();
 assert.equal(await page.locator('[data-proposal-id] .proposal-accept').isDisabled(),true);
 await page.getByRole('button',{name:'拒绝候选',exact:true}).click();await page.getByText(/待确认 0 条/).waitFor();
 await page.locator('#memory-link-proposals-dialog header button').click();await page.locator('#memory-links-dialog header button').click();
 await page.locator('#memory-owner').selectOption(seed.b);await page.locator('.memory-card').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: explicit selected-only materials and dedicated model; pending proof/review/edit; parent relation refresh; persistence; stale confirmation disabled, rejection and owner isolation. Mock model only.');
}catch(e){await page.screenshot({path:'artifacts/proposal-browser-failure.png'});throw e;}finally{await browser.close();}
