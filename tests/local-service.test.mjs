import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,buildContext,validateBackup} from '../frontend/local-service.js';
const copy=v=>JSON.parse(JSON.stringify(v));
function storage(){return {value:emptyData(),key:'',async load(){return copy(this.value);},async save(v){this.value=copy(v);},async hasKey(){return !!this.key;},async setKey(v){this.key=v;},async getKey(){return this.key;}};}
async function setup(transport){const persistence=storage(),service=await new LocalService(persistence,transport).init();const c=await service.api('/characters','POST',{name:'林',identity:'来自山间',style:'简短',avatar:''});const s=await service.api('/contacts','POST',{character_id:c.id});await service.api('/settings','PATCH',{model:'mock'});return {service,persistence,s,c};}
test('persist before transport; retry is idempotent and excludes failed partial context',async()=>{
  let count=0;const {service,persistence,s}=await setup(async(settings,key,messages,delta)=>{assert.equal(persistence.value.turns[0].state,'generating');assert.ok(persistence.value.messages.some(m=>m.role==='user'));count++;if(count===1){delta('失败片段');throw Error('offline');}assert.ok(!JSON.stringify(messages).includes('失败片段'));delta('成功');});
  await assert.rejects(service.stream(s.id,'你好','request1',()=>{}),/offline/);
  assert.equal(service.data.turns[0].state,'failed');await service.stream(s.id,'你好','request1',()=>{});await service.stream(s.id,'你好','request1',()=>{});
  assert.equal(count,2);assert.equal(service.data.messages.length,2);assert.equal(service.data.messages[1].content,'成功');assert.equal(service.data.turns[0].state,'complete');
  await assert.rejects(service.stream(s.id,'变更消息','request1',()=>{}),/不匹配/);
});
test('interrupted recovery, character isolation, canonical identity projection and secret-free backups',async()=>{
  const {service,persistence,s,c}=await setup(async()=>{});service.data.turns.push({request_id:'interrupted',session_id:s.id,user_id:1,assistant_id:2,state:'generating'});service.data.messages.push({id:1,session_id:s.id,role:'user',content:'旧问题',created_at:'2026-01-01T00:00:00Z'},{id:2,session_id:s.id,role:'assistant',content:'未完成',created_at:'2026-01-01T00:00:00Z'});await service.persist();
  const recovered=await new LocalService(persistence,async()=>{}).init();assert.equal(recovered.data.turns[0].state,'interrupted');
  c.profile={schema_version:1,character_id:'secret_metadata',canon:{immutable_facts:['固定事实']},persona:{values:['诚实']}};Object.assign(recovered.data.characters[0],c);
  const context=buildContext(recovered.data,s.id,'当前问题');assert.equal(context.length,2);assert.ok(context[0].content.includes('固定事实'));assert.ok(!context[0].content.includes('secret_metadata'));assert.ok(!context[0].content.includes('未完成'));
  const other=await recovered.api('/characters','POST',{name:'另一个',identity:'',style:'',avatar:''});const session=await recovered.api('/contacts','POST',{character_id:other.id});assert.equal((await recovered.api('/contacts/'+session.id+'/messages')).items.length,0);
  await recovered.api('/settings','PATCH',{api_key:'private-key'});const exported=await recovered.api('/backup');assert.ok(!JSON.stringify(exported).includes('private-key'));assert.ok(!('api_key' in await recovered.publicSettings()));validateBackup(exported);
  const broken=copy(exported);broken.messages[0].session_id='missing';assert.throws(()=>validateBackup(broken));
});
test('stable tied timestamps: pagination, search and timezone calendar anchor',async()=>{
  const {service,s}=await setup(async()=>{});service.data.messages=Array.from({length:600},(_,i)=>({id:i+1,session_id:s.id,role:i%2?'assistant':'user',content:'历史 '+(i+1),created_at:'2026-01-01 16:00:00'}));
  const page=await service.api('/contacts/'+s.id+'/messages');assert.equal(page.items[0].id,561);assert.ok(page.has_before);
  const before=await service.api('/contacts/'+s.id+'/messages?before=561');assert.equal(before.items[39].id,560);
  const days=await service.api('/contacts/'+s.id+'/calendar?month=2026-01');assert.equal(days['2026-01-02'],1);
  const anchor=await service.api('/contacts/'+s.id+'/messages?anchor=301');assert.equal(anchor.items[20].id,301);assert.ok(anchor.has_after&&anchor.has_before);
  assert.equal((await service.api('/contacts/'+s.id+'/search?q=历史%20301'))[0].id,301);
});
test('cancellation saves partial as incomplete; duplicate in-flight sends do not run',async()=>{
  let release;const {service,s}=await setup(async(settings,key,messages,delta,signal)=>{delta('部分');await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve);});});
  const pending=service.stream(s.id,'问题','cancelreq',()=>{});await new Promise(resolve=>setTimeout(resolve,10));await assert.rejects(service.stream(s.id,'问题','cancelreq',()=>{}),/正在生成/);service.cancel();release();await assert.rejects(pending,/停止/);assert.equal(service.data.turns[0].state,'cancelled');assert.equal(service.data.messages[1].content,'部分');assert.equal(buildContext(service.data,s.id,'新问题').length,2);
});
