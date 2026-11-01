// Isolated browser profile, synthetic memories and intercepted model transport only.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:process.env.T_BROWSER_CHANNEL||'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
await page.route('**/chat/completions',async route=>{
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
 const request=route.request().postDataJSON();requests.push(request);const input=JSON.parse(request.messages[1].content);
 const reviews=input.targets.map(target=>({target_id:target.id,action:target.room==='windowsill'?'fulfill':'resolve',reason:'近期有一条独立经历可以核对。',confidence:'high',basis_memory_ids:[input.experiences[0].id]}));
 const output=JSON.stringify({summary:'本次回看了一条明确经历，并逐项检查两个待处理事项。',reviews});
 return route.fulfill({status:200,headers:{...headers,'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:output}}]})+'\n\ndata: [DONE]\n\n'});
});
const app=id=>page.locator('.app-grid [data-app="'+id+'"]').click();
const home=()=>page.locator('#home-button').click();
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const read=()=>page.evaluate(async()=>{const {BrowserPersistence}=await import('/assets/local-service.js');return new BrowserPersistence().load();});
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8012/');await ready();
 await page.evaluate(async()=>{
  const {BrowserPersistence,emptyData}=await import('/assets/local-service.js'),{ensureMemory}=await import('/assets/memory-core.js'),store=new BrowserPersistence(),data=emptyData();await store.load();ensureMemory(data);
  data.characters=[{id:'a',name:'甲',identity:'',style:'简短',avatar:''},{id:'b',name:'乙',identity:'',style:'',avatar:''}];
  data.sessions=[{id:'chat-a',character_id:'a',note:'',voice:'',background:'#eef2f3',created_at:'2026-10-01T17:00:00Z'},{id:'chat-b',character_id:'b',note:'',voice:'',background:'#eef2f3',created_at:'2026-10-01T17:00:00Z'}];
  data.settings.model='fixture';data.settings.base_url='https://fixture.example/v1';data.settings.history_limit=0;
  data.messages=[
   {id:1,session_id:'chat-a',role:'user',content:'我一直想去海边。',created_at:'2026-10-01T17:00:00Z'},
   {id:2,session_id:'chat-a',role:'assistant',content:'你担心这件事是否能成行。',created_at:'2026-10-01T17:01:00Z'},
   {id:3,session_id:'chat-a',role:'user',content:'今天我们真的去了海边。',created_at:'2026-10-02T17:00:00Z'},
   {id:4,session_id:'chat-a',role:'assistant',content:'以后还会一起去。',created_at:'2026-10-02T17:01:00Z'},
   {id:5,session_id:'chat-b',role:'user',content:'乙自己的私密经历。',created_at:'2026-10-02T17:00:00Z'},
   {id:6,session_id:'chat-b',role:'assistant',content:'只属于乙的记录。',created_at:'2026-10-02T17:01:00Z'}
  ];
  data.turns=[{request_id:'turn-a-1',session_id:'chat-a',user_id:1,assistant_id:2,state:'complete'},{request_id:'turn-a-2',session_id:'chat-a',user_id:3,assistant_id:4,state:'complete'},{request_id:'turn-b-1',session_id:'chat-b',user_id:5,assistant_id:6,state:'complete'}];
  const event=(id,owner,title,content,kind,room,message_id,quote,created_at)=>({id,owner_id:owner,title,content,kind,room,evidence:[{message_id,quote}],participants:[owner],active:true,origin:'manual',created_at,updated_at:created_at,revision:0,versions:[]});
  data.memory.events=[
   event('wish','a','海边期盼','我一直期待去海边。','statement','windowsill',1,'我一直想去海边。','2026-10-01T17:02:00Z'),
   event('concern','a','是否能成行','还不确定是否能一起去。','interpretation','attic',2,'你担心这件事是否能成行。','2026-10-01T17:03:00Z'),
   event('experience','a','去了海边','今天确实一起去了海边。','experience','living_room',3,'今天我们真的去了海边。','2026-10-02T17:02:00Z'),
   event('promise','a','下次约定','以后还会一起去。','promise','bedroom',4,'以后还会一起去。','2026-10-02T17:03:00Z'),
   event('foreign','b','乙的私密经历','乙自己的私密经历。','experience','living_room',5,'乙自己的私密经历。','2026-10-02T17:02:00Z')
  ];
  await store.save(data);
 });
 await page.reload();await ready();await app('memory');await page.locator('#memory-digest').click();await page.locator('#memory-digestion-dialog[open]').waitFor();
 const dialog=page.locator('#memory-digestion-dialog');assert.match(await dialog.textContent(),/待处理 2 条，独立经历 1 条/);assert.match(await dialog.textContent(),/海边期盼/);assert.match(await dialog.textContent(),/去了海边/);assert.doesNotMatch(await dialog.textContent(),/乙自己的私密经历|下次约定/);
 await dialog.getByRole('button',{name:'开始消化'}).click();await page.locator('.memory-digest-report').waitFor();assert.equal(requests.length,1);await page.locator('.memory-digest-details summary').first().click();
 const wish=page.locator('.memory-digest-proposal').filter({hasText:'海边期盼'}),concern=page.locator('.memory-digest-proposal').filter({hasText:'是否能成行'});
 await wish.getByRole('button',{name:'确认变化'}).click();await page.locator('.memory-digest-details summary').first().click();await page.locator('.memory-digest-proposal').filter({hasText:'海边期盼'}).getByText('已确认并写入记忆状态。',{exact:true}).waitFor();
 await page.locator('.memory-digest-proposal').filter({hasText:'是否能成行'}).getByRole('button',{name:'驳回'}).click();await page.locator('.memory-digest-details summary').first().click();await page.locator('.memory-digest-proposal').filter({hasText:'是否能成行'}).getByText('已驳回；原状态保留。',{exact:true}).waitFor();
 let data=await read();assert.equal(data.memory.events.find(item=>item.id==='wish').cognition_state.status,'fulfilled');assert.equal(data.memory.events.find(item=>item.id==='concern').cognition_state,undefined);assert.equal(data.memory.digest_reports.length,1);
 await page.reload();await ready();await app('memory');await page.locator('#memory-digest').click();await page.locator('.memory-digest-report').waitFor();
 await page.locator('.memory-digest-details summary').click();const source=page.locator('.memory-digest-proposal').filter({hasText:'海边期盼'}).getByRole('button',{name:/原话 #3/});await source.click();await page.locator('[data-id="3"]').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: preview isolation, promise exclusion, intercepted model, accept/reject, persistence across reload and source jump. No real model endpoint called.');
}catch(error){await page.screenshot({path:'artifacts/memory-digestion-browser-failure.png'});console.log('Browser errors',errors,'requests',requests.length);throw error;}finally{await browser.close();}
