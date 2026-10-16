import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
try{
 await page.goto('http://127.0.0.1:8012/');
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
   return {calls,available,error,permissionText,final:box.textContent,restored:restored.textContent,webDisabled:web.querySelector('button').disabled,privateChecks,privateDisabled:privateBox.querySelector('button').disabled,privateText:privateBox.textContent};
 });
 assert.deepEqual(result.calls,['check','download','download','install','install','install']);
 assert.match(result.available,/下载/);assert.match(result.error,/下载中断/);assert.match(result.permissionText,/允许/);assert.match(result.final,/再次打开/);assert.match(result.restored,/继续安装/);assert.equal(result.webDisabled,true);
 assert.equal(result.privateChecks,0);assert.equal(result.privateDisabled,true);assert.match(result.privateText,/私有手动更新.*渠道尚未发布/);
 console.log('Updater UI passed: check, interrupted download retry, permission return, installer cancellation, cache recovery, web fallback');
}finally{await browser.close();}
