// A dedicated emulator is required. Installs 0.9, seeds synthetic data, then
// upgrades in place using the same signing certificate. Never a physical phone.
// node tests/embedded-ob-upgrade.mjs <adb> emulator-5556 <old.apk> <new.apk>
import {adb,connect,evaluate,disconnect} from './embedded-ob-android.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [oldApk,newApk]=process.argv.slice(4);
if(!oldApk||!newApk)throw Error('Both old and new signed APK paths are required');
try{
  // This script owns only the dedicated synthetic emulator install.
  try{await adb('uninstall','io.jcin.tcompanion');}catch{}
  await adb('install',oldApk);await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect(false);
  const baseline=await evaluate(async()=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    if(s.data.characters.length||s.data.messages.length)throw Error('Expected empty test install');
    s.transport=async(settings,key,messages,delta)=>delta('旧版本模拟回复');
    const c=await s.api('/characters','POST',{name:'升级测试人物',identity:'不改变身份',style:'简短',avatar:''});
    const chat=await s.api('/contacts','POST',{character_id:c.id});await s.api('/settings','PATCH',{model:'upgrade-fixture'});
    await s.stream(chat.id,'紫色兰花花盆待修理','upgrade-seed',()=>{});
    await s.api('/memories','POST',{owner_id:c.id,title:'兰花待修',content:'用户说紫色兰花花盆待修理',kind:'statement',evidence:[{message_id:1,quote:'紫色兰花花盆待修理'}]});
    await s.api('/contacts/'+chat.id+'/draft','PATCH',{text:'保留升级前草稿'});
    return {data:await s.api('/backup'),chat:chat.id};
  });
  disconnect();await adb('install','-r',newApk);await adb('shell','am','force-stop','io.jcin.tcompanion');await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();
  const upgraded=await evaluate(async chat=>{
    const {createLocalService}=await import('/assets/local-service.js'),s=await createLocalService(Capacitor.Plugins.TLocal);
    return {data:await s.api('/backup'),preview:await s.api('/contacts/'+chat+'/context-preview','POST',{message:'兰花'}),engine:await s.api('/memory-engine'),version:await Capacitor.Plugins.TUpdate.info()};
  },baseline.chat);
  for(const key of ['characters','sessions','messages','turns','drafts','settings','api_profiles','api_groups'])assert.deepEqual(upgraded.data[key],baseline.data[key],'retained '+key);
  const upgradedMemory={...upgraded.data.memory};
  if(baseline.data.memory.external===undefined){assert.equal(upgradedMemory.external.enabled,false);assert.equal(upgradedMemory.external.url,'');delete upgradedMemory.external;}
  assert.deepEqual(upgradedMemory,baseline.data.memory,'all original memory fields retained');
  assert.equal(upgraded.version.versionCode,14);assert.equal(upgraded.engine.provider,'embedded-ob');
  assert.match(upgraded.preview.messages[0].content,/紫色兰花花盆待修理/);
  assert.equal(upgraded.preview.recall.method,'embedded-ob+bounded-links');
  await writeFile('artifacts/embedded-ob-upgrade-validation.json',JSON.stringify({from:'0.9.0-trial',to:upgraded.version.versionName,retained:['characters','contacts','messages','turns','drafts','memory/evidence/versions','settings','profiles/groups'],method:upgraded.preview.recall.method,sameSignatureInstall:true},null,2));
  console.log('PASS: signed 0.9 → 0.10 in-place upgrade; data retained and legacy memory recalled by embedded OB.');
}finally{disconnect();}
