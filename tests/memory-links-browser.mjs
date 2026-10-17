import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const ready=()=>page.waitForFunction(()=>document.querySelector('#status')?.textContent==='记录保存在本机');
const home=()=>page.locator('#home-button').click(),app=id=>page.locator('.app-grid [data-app="'+id+'"]').click();
const links=()=>page.locator('#memory-links-dialog');
try{
  await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8012/');await ready();
  await page.evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js');
    const service=await createLocalService();service.transport=async(s,k,m,delta)=>delta('想听沿途的故事');
    const a=await service.api('/characters','POST',{name:'林',identity:'重视诚实',style:'简短',avatar:''});
    await service.api('/characters','POST',{name:'雨',identity:'',style:'',avatar:''});
    const chat=await service.api('/contacts','POST',{character_id:a.id});
    await service.api('/settings','PATCH',{model:'fixture'});await service.stream(chat.id,'喜欢山间散步','seed',()=>{});
    const value={owner_id:a.id,title:'山间散步',content:'用户说喜欢散步',kind:'statement',evidence:[{message_id:1,quote:'喜欢山间散步'}]};
    await service.api('/memories','POST',value);await service.api('/memories','POST',{...value,title:'沿途故事',content:'角色想听沿途的故事'});
    await service.api('/self','POST',{owner_id:a.id,label:'诚实',interpretation:'愿意如实表达',quote:'重视诚实'});
  });
  await page.reload();await ready();await app('memory');
  await page.locator('.memory-card').filter({has:page.getByRole('heading',{name:'山间散步',exact:true})}).getByRole('button',{name:'查看关联',exact:true}).click();
  await links().getByRole('button',{name:'＋ 新建关联',exact:true}).click();
  await page.locator('#memory-link-type').selectOption('causes');await page.locator('#memory-link-note').fill('我将这两段话理解为前后相连');await page.locator('#memory-link-save').click();
  await links().getByText('山间散步 → 是…的起因 → 沿途故事',{exact:true}).waitFor();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/memory-links.png'});
  await links().getByRole('button',{name:'编辑关联',exact:true}).click();await page.locator('#memory-link-type').selectOption('contradicts');await page.locator('#memory-link-save').click();
  await links().getByText('山间散步 → 存在矛盾 → 沿途故事',{exact:true}).waitFor();
  await links().getByRole('button',{name:'查看：沿途故事',exact:true}).click();await links().getByRole('heading',{name:'沿途故事',exact:true}).waitFor();
  await links().locator('.memory-source').first().click();await page.locator('[data-id="1"]').waitFor();
  await home();await app('self');await page.locator('#self-list').getByRole('button',{name:'关联记忆',exact:true}).click();
  await links().getByRole('button',{name:'＋ 新建关联',exact:true}).click();assert.equal(await page.locator('#memory-link-type').inputValue(),'supports');
  await page.locator('#memory-link-save').click();await links().getByText(/作为标签依据 → 诚实/).waitFor();
  await links().getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload();await ready();await app('self');await page.locator('#self-list').getByRole('button',{name:'关联记忆',exact:true}).click();
  await links().getByText(/作为标签依据 → 诚实/).waitFor();await links().getByRole('button',{name:'删除关联',exact:true}).click();
  assert.equal(await links().locator('.memory-link').count(),0);await links().getByRole('button',{name:'关闭',exact:true}).click();
  await home();await app('memory');await page.locator('#memory-owner').selectOption({label:'雨'});
  await page.getByText('还没有记忆。可以从已完成的聊天选择原话，或让模型整理。',{exact:true}).waitFor();assert.equal(await page.locator('.memory-card').count(),0);
  await page.locator('#memory-owner').selectOption({label:'林'});await page.locator('.memory-card').first().getByRole('button',{name:'查看关联',exact:true}).click();
  await links().getByText(/存在矛盾/).waitFor();assert.equal(await links().locator('.memory-link').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: directional relation create/edit/view/source, anchor evidence, reload, delete and owner isolation; fixture transport only.');
}finally{await browser.close();}
