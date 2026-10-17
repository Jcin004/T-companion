import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8012/');await ready();
  await page.locator('.app-grid').waitFor();
  const result=await page.evaluate(async()=>{
    const {LocalService,BrowserPersistence}=await import('/assets/local-service.js');
    const store=new BrowserPersistence(),service=await new LocalService(store,async()=>{}).init();
    const owner=await service.api('/characters','POST',{name:'草稿验收人物',identity:'',style:'',avatar:''});
    const chat=await service.api('/contacts','POST',{character_id:owner.id});
    let entered,release;
    const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
    const save=store.save.bind(store);let fail=true;
    store.save=async data=>{if(fail){fail=false;entered();await gate;throw Error('模拟磁盘写入失败');}return save(data);};
    const rejected=service.api('/contacts/'+chat.id,'PATCH',{note:'不应保存'}).catch(error=>error.message);
    await ready;
    const draft=service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'数据库中的草稿'});
    release();const failure=await rejected;await draft;
    const reloaded=await new LocalService(new BrowserPersistence(),async()=>{}).init();
    return {failure,note:reloaded.data.sessions[0].note,draft:reloaded.data.drafts[chat.id]};
  });
  assert.equal(result.failure,'模拟磁盘写入失败');assert.equal(result.note,'');assert.equal(result.draft,'数据库中的草稿');
  await page.reload();await ready();await page.locator('.app-grid [data-app="chat"]').click();
  await page.locator('#contacts .contact').click();
  assert.equal(await page.locator('#input').inputValue(),'数据库中的草稿');
  await page.locator('#input').fill('界面输入的新草稿');await page.locator('#home-button').click();
  await page.waitForFunction(async()=>{
    const {BrowserPersistence}=await import('/assets/local-service.js');
    const store=new BrowserPersistence();try{return Object.values((await store.load()).drafts).includes('界面输入的新草稿');}finally{store.db?.close();}
  });
  // Remove the UI fallback, so the next reload must read the committed document.
  await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
  await page.locator('.app-grid [data-app="chat"]').click();await page.locator('#contacts .contact').click();
  assert.equal(await page.locator('#input').inputValue(),'界面输入的新草稿');
  assert.deepEqual(errors,[]);
  console.log('PASS: real IndexedDB failure isolation, queued draft, UI save and reload without localStorage fallback.');
}finally{await browser.close();}
