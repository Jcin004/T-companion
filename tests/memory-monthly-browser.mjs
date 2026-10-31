import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.route('**/chat/completions',async route=>{
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
 if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 const request=route.request().postDataJSON(),prompt=request.messages[0].content;requests.push(request);
 let output;
 if(prompt.includes('总结当天'))output={summary:'用户提到想在春天散步。'};
 else if(prompt.includes('精炼月度回顾'))output={summary:'本月现有记录：用户期盼春天散步。'};
 else throw Error('Unexpected model request');
 await route.fulfill({status:200,headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(output)}}]})+'\n\ndata: [DONE]\n\n'});
});
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const close=id=>page.locator('#'+id+' header button').click();
const monthly=async()=>{await page.locator('#memory-month').fill('2026-02');await page.locator('#memory-monthly').click();await page.locator('#monthly-dialog').waitFor();};
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8023');await ready();
 await page.evaluate(async()=>{
  const {BrowserPersistence,emptyData}=await import('/assets/local-service.js');const d=emptyData(),at='2026-01-31T16:30:00Z';
  d.characters=[{id:'a',name:'林',identity:'合成人物',style:'',avatar:''},{id:'b',name:'雨',identity:'',style:'',avatar:''}];
  d.sessions=[{id:'chat',character_id:'a',created_at:at}];d.settings.model='mock';d.settings.base_url='https://fixture.invalid/v1';
  d.messages=[{id:1,session_id:'chat',role:'user',content:'我想在春天散步',created_at:at},{id:2,session_id:'chat',role:'assistant',content:'嗯，先记着这个想法。',created_at:at}];
  d.turns=[{request_id:'seed',session_id:'chat',user_id:1,assistant_id:2,state:'complete'}];
  const store=new BrowserPersistence();await store.load();await store.save(d);
 });
 await page.reload();await ready();await page.locator('[data-app=memory]').click();
 await monthly();assert.equal(requests.length,0);assert.equal(await page.locator('#monthly-dialog').getByRole('button',{name:'生成月度回顾',exact:true}).isDisabled(),true);await close('monthly-dialog');
 await page.locator('#memory-add').click();await page.locator('#memory-editor input').first().fill('春天散步');await page.locator('#memory-editor textarea').first().fill('用户期盼春天散步');await page.locator('#memory-editor-room').selectOption('windowsill');await page.locator('#memory-editor').getByRole('button',{name:'保存记忆',exact:true}).click();await page.locator('#memory-editor').waitFor({state:'hidden'});
 await page.locator('#memory-room').selectOption('study');await page.waitForFunction(()=>document.querySelectorAll('.memory-card').length===0);
 await page.locator('#memory-room').selectOption('windowsill');await page.locator('.memory-card h2').waitFor();assert.match(await page.locator('#memory-room-counts').textContent(),/窗台 1/);
 await page.locator('.memory-card').getByRole('button',{name:'编辑',exact:true}).click();assert.equal(await page.locator('#memory-editor-room').inputValue(),'windowsill');await page.locator('#memory-editor-room').selectOption('attic');await page.locator('#memory-editor').getByRole('button',{name:'保存记忆',exact:true}).click();await page.locator('#memory-editor').waitFor({state:'hidden'});await page.locator('#memory-room').selectOption('attic');await page.locator('.memory-card').waitFor();
 await page.locator('#memory-day').fill('2026-02-01');await page.locator('#memory-daily').click();await page.locator('#daily-dialog').getByRole('button',{name:'生成总结',exact:true}).click();await page.locator('#daily-dialog').getByRole('button',{name:'按原话重写',exact:true}).waitFor();await close('daily-dialog');
 await monthly();await page.locator('#monthly-dialog').getByRole('button',{name:'生成月度回顾',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#monthly-content')?.value==='本月现有记录：用户期盼春天散步。');
 assert.equal(requests.length,2);assert.equal(JSON.parse(requests[1].messages[1].content).days[0].day,'2026-02-01');await page.screenshot({path:'artifacts/monthly-review-mobile.png',fullPage:true});
 await page.locator('#monthly-content').fill('人工校对的月度回顾');await page.locator('#monthly-dialog').getByRole('button',{name:'保存编辑',exact:true}).click();await page.locator('#monthly-dialog').getByRole('button',{name:'修改记录',exact:true}).click();await page.locator('#memory-versions').getByText('本月现有记录：用户期盼春天散步。',{exact:true}).waitFor();await close('memory-versions');await close('monthly-dialog');
 await page.locator('#memory-daily').click();await page.locator('#daily-content').fill('后来校对的日总结');await page.locator('#daily-dialog').getByRole('button',{name:'保存编辑',exact:true}).click();await page.getByText('总结已保存',{exact:true}).waitFor();await close('daily-dialog');await monthly();await page.locator('#monthly-dialog .memory-stale').waitFor();assert.equal(await page.locator('#monthly-content').inputValue(),'人工校对的月度回顾');await close('monthly-dialog');
 await page.reload();await ready();await page.locator('[data-app=memory]').click();await page.locator('#memory-room').selectOption('attic');await page.locator('.memory-card').waitFor();await monthly();await page.locator('#monthly-dialog .memory-stale').waitFor();
 await page.locator('#monthly-dialog details summary').click();await page.locator('#monthly-dialog').getByRole('button',{name:'原话 #1',exact:true}).click();await page.locator('[data-id="1"]').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: mobile room edit/filter, daily→monthly, no call on open, manual/history, stale warning, restart and raw-source jump; mock model only.');
}catch(e){await page.screenshot({path:'artifacts/monthly-browser-failure.png'});throw e;}finally{await browser.close();}
