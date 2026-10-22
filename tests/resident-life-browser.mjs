import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/chat/completions',async route=>{
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
 const {messages}=route.request().postDataJSON(),prompt=messages[0].content;let text;
 if(prompt.includes('任务：')){
  const p=JSON.parse(messages[1].content),e=p.observed_events[0];
  if(prompt.includes('任务：memory'))text=JSON.stringify({memories:e?[{title:'盆栽经历',content:e.content,kind:'experience',evidence:[{source_type:'world_event',event_id:e.id,quote:e.content}]}]:[]});
  else if(prompt.includes('任务：share'))text=JSON.stringify({share:true,event_id:e.id,quote:e.content,comment:'下次想和你一起看看。'});
  else text=JSON.stringify({actor_id:p.actor_id,type:'wait',plan:'准备照看盆栽'});
 }else text='模拟回答：我记得自己的那次经历。';
 await route.fulfill({status:200,headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\ndata: [DONE]\n\n'});
});
const home=()=>page.locator('#home-button').tap(),app=id=>page.locator('.app-grid [data-app="'+id+'"]').tap();
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8014/');await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
 await page.evaluate(async()=>{const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),store=new BrowserPersistence(),d=emptyData();d.characters=[{id:'a',name:'林',identity:'',style:'',avatar:''},{id:'b',name:'雨',identity:'',style:'',avatar:''}];d.settings.model='mock';d.settings.base_url='https://fixture.example/v1';await store.load();await store.save(d);});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');await app('world');await page.getByRole('button',{name:'进入小屋',exact:true}).tap();await page.locator('#world-canvas[data-drawn="yes"]').waitFor();
 await page.locator('#world-menu-open').tap();await page.locator('#world-menu').getByRole('button',{name:'居民生活',exact:true}).tap();await page.locator('#life-enabled').check();await page.locator('#life-quiet_start').fill('0');await page.locator('#life-quiet_end').fill('0');await page.locator('#life-save').tap();await page.waitForTimeout(150);
 await page.locator('#life-run').tap();await page.waitForFunction(()=>document.querySelector('#life-status')?.textContent.includes('complete'));
 await page.screenshot({path:'artifacts/life-browser-run.png'});await page.locator('#world-life-panel header button').tap();await home();await app('chat');
 await page.locator('#contacts .contact').first().tap();await page.getByText('主动分享',{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'事件来源',exact:true}).first().tap();await page.locator('#world-source-dialog[open]').waitFor();await page.locator('#world-source-dialog').getByRole('button',{name:'关闭'}).tap();
 await page.locator('#input').fill('你刚才停留了片刻？');await page.locator('#send').tap();await page.waitForFunction(()=>!document.querySelector('#send').disabled);
 await page.getByRole('button',{name:'到世界询问',exact:true}).first().tap();await page.locator('#world-canvas').waitFor();
 await page.screenshot({path:'artifacts/life-browser-world.png'});await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');await app('chat');assert.equal(await page.locator('#contacts .contact').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: no-user autonomous batch, reflection, proactive inbox, source, continued chat and world entry, reload');
}finally{await browser.close();}
