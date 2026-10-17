import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
try{
 await page.goto(process.env.T_TEST_URL||'http://127.0.0.1:8018/');
 const result=await page.evaluate(async()=>{
   const {mountAppUpdate}=await import('/assets/app-update.js');
   const box=document.createElement('div');document.body.append(box);
   let calls=[],permission=true,fail=true;
   const plugin={addListener:()=>({remove(){}}),info:async()=>({}),check:async()=>{calls.push('check');return {available:{versionName:'0.6-test',sizeBytes:1024,releaseNotes:['测试更新']}};},download:async()=>{calls.push('download');if(fail){fail=false;throw Error('下载中断');}},install:async()=>{calls.push('install');return {status:permission?'permission':'installer'};}};
   mountAppUpdate(box,plugin);await new Promise(r=>setTimeout(r,0));
   const button=box.querySelector('button');
   await button.onclick();const available=button.textContent;
   await button.onclick();const error=box.textContent;
   await button.onclick();const permissionText=box.textContent;
   permission=false;await button.onclick();await button.onclick();
   const restored=document.createElement('div');mountAppUpdate(restored,{...plugin,info:async()=>({ready:{versionName:'restored'}})});await new Promise(r=>setTimeout(r,0));
   const web=document.createElement('div');mountAppUpdate(web,null);
   let privateChecks=0;const privateBox=document.createElement('div');mountAppUpdate(privateBox,{...plugin,info:async()=>({channelPublished:false}),check:async()=>{privateChecks++;throw Error('should not query an unpublished channel');}});await new Promise(r=>setTimeout(r,0));await privateBox.querySelector('button').onclick();
   const customBox=document.createElement('div');document.body.append(customBox);let saved=[],checked=0;const logs=[];
   const customPlugin={...plugin,info:async()=>({configurableChannel:true,manifestSources:['https://old.example/update.json']}),setSources:async({sources})=>{saved=sources;return {manifestSources:sources};},check:async()=>{checked++;const error=Error('检查更新清单失败：无法解析更新服务器地址');error.data={stage:'检查更新清单',host:'old.example',attempts:[{host:'old.example',status:'failed',reason:'DNS'}]};throw error;}};
   mountAppUpdate(customBox,customPlugin,()=>false,(label,data)=>logs.push({label,data}));await new Promise(r=>setTimeout(r,0));
   const field=customBox.querySelector('textarea'),saveForm=customBox.querySelector('form');const loaded=field.value;
   field.value='https://own.example/update.json\nhttps://backup.example/update.json';await saveForm.onsubmit({preventDefault(){}});
   const savedText=customBox.textContent;await customBox.querySelector('#check-update').onclick();const failedText=customBox.textContent;
   field.value='https://own.example/update.json?key=must-not-save';await saveForm.onsubmit({preventDefault(){}});const rejectedText=customBox.textContent;
   const resultSaved=[...saved];field.value='';await saveForm.onsubmit({preventDefault(){}});
   return {loaded,resultSaved,savedText,failedText,rejectedText,reset:saved,checked,logs,calls,available,error,permissionText,final:box.textContent,restored:restored.textContent,webDisabled:web.querySelector('button').disabled,privateChecks,privateDisabled:privateBox.querySelector('button').disabled,privateText:privateBox.textContent};
 });
 assert.deepEqual(result.calls,['check','download','download','install','install','install']);
 assert.match(result.available,/下载/);assert.match(result.error,/下载中断/);assert.match(result.permissionText,/允许/);assert.match(result.final,/再次打开/);assert.match(result.restored,/继续安装/);assert.equal(result.webDisabled,true);
 assert.equal(result.privateChecks,0);assert.equal(result.privateDisabled,true);assert.match(result.privateText,/私有手动更新.*渠道尚未发布/);
 assert.equal(result.loaded,'https://old.example/update.json');assert.deepEqual(result.resultSaved,['https://own.example/update.json','https://backup.example/update.json']);assert.deepEqual(result.reset,[]);assert.equal(result.checked,1);
 assert.match(result.savedText,/已保存/);assert.match(result.failedText,/无法解析/);assert.match(result.rejectedText,/不能包含/);
 const failure=result.logs.find(log=>log.label==='更新失败');assert.equal(failure.data.host,'old.example');assert.equal(failure.data.attempts[0].reason,'DNS');assert.ok(!JSON.stringify(result.logs).includes('must-not-save'));
 console.log('Updater UI passed: check, interrupted download retry, permission return, installer cancellation, cache recovery, web fallback');
}finally{await browser.close();}
