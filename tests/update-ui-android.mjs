// Isolated emulator only: old WebView UI, fake update transport, no model requests.
import {adb,connect,evaluate,disconnect} from './embedded-ob-android.mjs';
import assert from 'node:assert/strict';
try {
  await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');
  await connect();
  const result=await evaluate(async()=>{
    const {mountAppUpdate}=await import('/assets/app-update.js');
    let infoCalls=0,downloadCalls=0,listener;
    const plugin={info:async()=>{infoCalls++;return {};},addListener:(_,fn)=>{listener=fn;return {remove(){}};},
      check:async()=>({available:{versionName:'fixture-only',sizeBytes:1048576,releaseNotes:[]}}),
      download:()=>{downloadCalls++;return new Promise(resolve=>{window.finishUpdateFixture=resolve;});},
      install:async()=>({status:'permission'})};
    const box=document.createElement('div');document.body.append(box);mountAppUpdate(box,plugin);
    await new Promise(resolve=>setTimeout(resolve,0));await box.querySelector('#check-update').onclick();
    window.updateFixtureRun=box.querySelector('#check-update').onclick();listener({bytes:524288,total:1048576});box.remove();
    const replacement=document.createElement('div');document.body.append(replacement);mountAppUpdate(replacement,plugin);
    await replacement.querySelector('#check-update').onclick();
    const progress=replacement.querySelector('progress').value,disabled=replacement.querySelector('#check-update').disabled;
    window.finishUpdateFixture();await window.updateFixtureRun;
    const message=replacement.textContent;replacement.remove();
    return {infoCalls,downloadCalls,progress,disabled,message};
  });
  assert.equal(result.infoCalls,1);assert.equal(result.downloadCalls,1);assert.equal(result.progress,.5);assert.equal(result.disabled,true);assert.match(result.message,/允许.*继续安装/);
  console.log('PASS: Android WebView imports updater, shares one task across remount, retains 50% progress and permission-return action');
} finally {disconnect();}
