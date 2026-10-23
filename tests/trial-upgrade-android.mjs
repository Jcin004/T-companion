// Dedicated synthetic emulator: preserve the complete document and encrypted key
// across an original-signature upgrade. Optional real public-channel check, no model.
import {adb,connect,evaluate,disconnect} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const path='artifacts/integrated-upgrade-before.json';
const version=Number(process.env.T_VERSION_CODE||24);
try{
 await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');await connect();
 for(let i=0;i<150;i++){if(await evaluate(()=>document.querySelector('#status')?.textContent==='记录保存在本机'))break;await new Promise(r=>setTimeout(r,200));}
 const data=await evaluate(async()=>JSON.parse((await Capacitor.Plugins.TLocal.load()).data));
 assert.deepEqual(data.characters.map(c=>[c.name,c.identity]),[['林','甲合成人物'],['雨','乙合成人物私有']],'synthetic fixture required');
 if(process.argv.includes('--snapshot')){
  await evaluate(async()=>{if(!(await Capacitor.Plugins.TLocal.hasKey({profile_id:'legacy'})).value)await Capacitor.Plugins.TLocal.setKey({profile_id:'legacy',value:'synthetic-upgrade-key'});});
  const secrets=(await adb('shell','run-as','io.jcin.tcompanion','sha256sum','shared_prefs/t-secrets.xml')).stdout.split(/\s/)[0];
  const info=await evaluate(()=>Capacitor.Plugins.TUpdate.info());assert.equal(info.versionCode,Number(process.env.T_OLD_VERSION_CODE||23));
  assert.ok(data.character_looks&&Object.values(data.character_looks).some(c=>c.skins?.length),'old skin catalog exists');
  assert.ok(data.world.events.length&&data.memory.events.length&&data.messages.length,'old world/chat/memory exist');
  await writeFile(path,JSON.stringify({data,secrets}));console.log('Saved synthetic previous-version world, skin catalog, chat, memories and encrypted-key fingerprint');
 }else{
  const before=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(data,before.data,'all business data retained');
  const secrets=(await adb('shell','run-as','io.jcin.tcompanion','sha256sum','shared_prefs/t-secrets.xml')).stdout.split(/\s/)[0];assert.equal(secrets,before.secrets);
  assert.equal(await evaluate(async()=>(await Capacitor.Plugins.TLocal.hasKey({profile_id:'legacy'})).value),true);
  if(!process.argv.includes('--expect-available')){
   assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,version);
   assert.match(await evaluate(async()=>await(await fetch('/source-commit.txt')).text()),/^[a-f0-9]{40}\s*$/);
  }
  if(process.argv.includes('--expect-available')||process.argv.includes('--expect-current')){
   assert.deepEqual((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).manifestSources,[],'default channel');
   const started=Date.now(),result=await evaluate(()=>Capacitor.Plugins.TUpdate.check());
   if(process.argv.includes('--expect-available'))assert.equal(result.available?.versionCode,version);
   else {assert.equal(result.available,undefined);assert.match(result.message,/最新/);}
   await writeFile('artifacts/integrated-channel-'+(result.available?'old':'new')+'.json',JSON.stringify({elapsed_ms:Date.now()-started,...result},null,2));
  }
  console.log('PASS: complete world, skin, chat, memory and encrypted credentials retained'+(process.argv.includes('--expect-available')?'; old app discovers public newer version':process.argv.includes('--expect-current')?'; installed version reports current via default native channel':''));
 }
}finally{disconnect();}
