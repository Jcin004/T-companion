// Dedicated synthetic emulator: real SQLite/OB, mock model, original-signature upgrade.
import {adb,connect,evaluate,disconnect} from './embedded-ob-android.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const snapshot='artifacts/memory-source-upgrade-before.json';
const hash=text=>createHash('sha256').update(text).digest('hex');
try{
  await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');
  await connect();
  let ready=false;
  for(let i=0;i<150;i++){
    if(await evaluate(()=>document.querySelector('#status')?.textContent==='记录保存在本机')){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(ready,true,'App startup must release its initialization write lease');
  if(process.argv.includes('--seed')){
    const result=await evaluate(async()=>{
      const {createLocalService}=await import('/assets/local-service.js');
      const s=await createLocalService(Capacitor.Plugins.TLocal);
      if(s.data.characters.length||s.data.messages.length)throw Error('New empty synthetic emulator required');
      s.transport=async(settings,key,messages,delta)=>delta('合成回复');
      const a=await s.api('/characters','POST',{name:'林',identity:'合成人物甲',style:'',avatar:''});
      const b=await s.api('/characters','POST',{name:'雨',identity:'合成人物乙',style:'',avatar:''});
      await s.api('/settings','PATCH',{model:'synthetic',base_url:'https://fixture.invalid/v1'});
      const chat=await s.api('/contacts','POST',{character_id:a.id});
      await s.stream(chat.id,'蓝色兰花','synthetic-seed',()=>{});
      await s.api('/memories','POST',{owner_id:a.id,title:'兰花',content:'用户说蓝色兰花',kind:'statement',evidence:[{message_id:1,quote:'蓝色兰花'}]});
      await s.api('/world/setup','POST',{character_ids:[a.id,b.id]});
      await s.api('/world/commands','POST',{request_id:'synthetic-wait',type:'advance',actor_id:a.id});
      await s.storage.setKey('synthetic-upgrade-key',s.data.active_profile_id);
      return {data:await s.api('/backup'),owner:a.id,chat:chat.id};
    });
    const info=await evaluate(()=>Capacitor.Plugins.TUpdate.info());
    assert.equal(info.versionCode,31);
    const credentials=hash((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout);
    await writeFile(snapshot,JSON.stringify({...result,credentials}));
    console.log('Captured synthetic code-31 source, memory, world and credential fingerprint');
  }else{
    const before=JSON.parse(await readFile(snapshot,'utf8'));
    assert.equal((await evaluate(()=>Capacitor.Plugins.TUpdate.info())).versionCode,32);
    const credentials=hash((await adb('shell','run-as','io.jcin.tcompanion','cat','shared_prefs/t-secrets.xml')).stdout);
    assert.equal(credentials,before.credentials);
    const result=await evaluate(async before=>{
      const {createLocalService}=await import('/assets/local-service.js');
      const s=await createLocalService(Capacitor.Plugins.TLocal);
      if(JSON.stringify(await s.api('/backup'))!==JSON.stringify(before.data))throw Error('Upgrade changed business data');
      let calls=0;
      s.transport=async(settings,key,messages,delta)=>{calls++;delta('合成回复');};
      const base=await s.api('/backup');
      try{
        await s.transact(data=>{
          const firstId=Math.max(...data.messages.map(m=>m.id))+1,at=new Date().toISOString();
          data.sessions.unshift({id:'isolated-story',character_id:before.owner,mode:'story',created_at:at});
          data.messages.push({id:firstId,session_id:'isolated-story',role:'user',content:'独立剧情秘密',created_at:at},
            {id:firstId+1,session_id:'isolated-story',role:'assistant',content:'剧情回答',created_at:at});
          data.turns.push({request_id:'isolated-turn',session_id:'isolated-story',user_id:firstId,assistant_id:firstId+1,state:'complete'});
        });
        const sources=await s.api('/memory-sources?owner='+before.owner);
        if(sources.some(m=>m.content.includes('独立剧情秘密')))throw Error('Story source leaked');
        if((await s.api('/contacts')).some(c=>c.id==='isolated-story'))throw Error('Story became online contact');
        const preview=await s.api('/contacts/'+before.chat+'/context-preview','POST',{message:'蓝色兰花'});
        if(preview.recall.method!=='embedded-ob+bounded-links'||!preview.messages[0].content.includes('蓝色兰花'))throw Error('Real OB recall failed');
        if(JSON.stringify(preview).includes('独立剧情秘密'))throw Error('Story leaked through OB');
        let blocked=false;
        try{await s.stream('isolated-story','test','blocked-native',()=>{});}catch(e){blocked=e.message.includes('独立剧情');}
        if(!blocked||calls!==0)throw Error('Blocked story called model');
        const canonical=await s.api('/memory-sources?owner='+before.owner+'&source_type=world_event');
        if(!canonical.length||JSON.stringify(canonical)!==JSON.stringify(await s.api('/world/sources?owner='+before.owner)))throw Error('World source routes disagree');
        return {method:preview.recall.method,modelCalls:calls,sourceCount:sources.length,checks:['31→32 full document retained','credential fingerprint retained','story sources excluded','online contacts isolated','real Python/OB recall','no model call for blocked story','world route compatibility']};
      }finally{
        await s.api('/backup/restore','POST',base);
      }
    },before);
    await adb('shell','am','force-stop','io.jcin.tcompanion');
    await adb('shell','am','start','-n','io.jcin.tcompanion/.MainActivity');
    disconnect();await connect();
    const restored=await evaluate(async()=>{const {createLocalService}=await import('/assets/local-service.js');return (await createLocalService(Capacitor.Plugins.TLocal)).api('/backup');});
    assert.deepEqual(restored,before.data);
    result.checks.push('process restart retains restored synthetic fixture');
    await writeFile('artifacts/memory-source-android-validation.json',JSON.stringify(result,null,2));
    console.log('PASS: '+result.checks.length+' native upgrade/source checks; real SQLite/OB, mocked model');
  }
}finally{disconnect();}
