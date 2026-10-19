import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {externalConfig,externalKeyId,nativeMemoryRequest} from '../frontend/external-memory.js';
import {DiagnosticStore} from '../frontend/diagnostics.js';

const token='synthetic-ob-token-not-a-real-secret';
const settings={enabled:true,url:'https://memory-fixture.example',timeout_ms:300,limit:4,budget:2000};
async function fixture(request){
  const keys=new Map(),disk={value:emptyData(),fail:false,async load(){return structuredClone(this.value);},async save(v){if(this.fail)throw Error('disk full');this.value=structuredClone(v);},async setKey(k,id){keys.set(id,k);},async getKey(id){return keys.get(id)||'model-fixture';},async hasKey(id){return keys.has(id);}};
  const logs=await new DiagnosticStore({async load(){},async save(){}}).init(),sent=[],calls=[];
  const service=await new LocalService(disk,async(s,k,m,delta)=>{sent.push(m);delta('模拟回复');},logs,async(...args)=>{calls.push(args);return request(...args);}).init();
  const person=await service.api('/characters','POST',{name:'林',identity:'只使用名册身份',style:'',avatar:''}),other=await service.api('/characters','POST',{name:'雨',identity:'另一个人',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:person.id});await service.api('/settings','PATCH',{model:'fixture'});
  const enable=()=>service.api('/external-memory','PATCH',{...settings,token});
  return {service,disk,keys,logs,sent,calls,person,other,chat,enable};
}
const reply=(body,records=[{id:'bucket1',content:'兰花花盆裂了，还没有买新盆。',source:{kind:'ob_bucket',id:'bucket1'}}])=>({version:1,provider:'ombre',character_id:body.character_id,scope:body.scope,records,vector_enabled:false});

test('disabled default makes no request; enabled recall derives identity and sends only current query',async()=>{
  const f=await fixture(async(c,p,b)=>reply(b));
  await f.service.stream(f.chat.id,'旧的私人对话','old',()=>{});assert.equal(f.calls.length,0);
  await f.enable();await f.service.stream(f.chat.id,'兰花','new',()=>{});
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0][2],{character_id:f.person.id,scope:'daily',query:'兰花',limit:4,budget:2000});
  assert.equal(f.sent.length,2);assert.match(f.sent.at(-1)[0].content,/bucket1/);
  assert.ok(!JSON.stringify(f.calls[0][2]).includes('旧的私人对话'));
  assert.ok(!JSON.stringify(f.sent).includes(token));assert.ok(!JSON.stringify(await f.service.api('/backup')).includes(token));assert.ok(!JSON.stringify(f.logs.export()).includes(token));
  assert.equal((await f.service.api('/external-memory')).last.vector_enabled,false);
});

test('wrong character or story response is rejected before prompt construction',async()=>{
  for(const override of [{character_id:'foreign'},{scope:'story'},{version:2}]){
    const f=await fixture(async(c,p,b)=>({...reply(b),...override}));await f.enable();const events=[];
    await f.service.stream(f.chat.id,'兰花','wrong',(...e)=>events.push(e));
    assert.ok(!f.sent[0][0].content.includes('bucket1'));assert.equal(f.service.externalMemory.last.reason,'invalid_response');
    assert.ok(events.some(([kind])=>kind==='memory-status'));
  }
});

test('timeout and authorization failure fall back without losing the chat or retrying the model',async()=>{
  for(const request of [()=>new Promise(()=>{}),async()=>{throw Error('unauthorized');}]){
    const f=await fixture(request);await f.enable();const start=Date.now();await f.service.stream(f.chat.id,'兰花','failure',()=>{});
    assert.ok(Date.now()-start<1500);assert.equal(f.sent.length,1);assert.equal(f.service.data.turns[0].state,'complete');assert.equal(f.service.externalMemory.last.state,'fallback');
  }
});

test('cancelling during external recall stops the model call and preserves a retryable turn',async()=>{
  let started;const ready=new Promise(resolve=>{started=resolve;});
  const f=await fixture(()=>{started();return new Promise(()=>{});});await f.enable();
  const operation=f.service.stream(f.chat.id,'兰花','cancelled',()=>{});await ready;f.service.cancel();
  await assert.rejects(operation,/已停止/);assert.equal(f.sent.length,0);assert.equal(f.service.data.turns[0].state,'cancelled');
  f.service.externalMemory.request=async(c,p,b)=>reply(b);
  await f.service.stream(f.chat.id,'兰花','cancelled',()=>{});assert.equal(f.service.data.turns.length,1);assert.equal(f.sent.length,1);
});

test('same local content is not injected twice; whole external records obey the budget',async()=>{
  let rows;
  const f=await fixture(async(c,p,b)=>reply(b,rows));
  await f.service.stream(f.chat.id,'兰花','seed',()=>{});
  await f.service.api('/memories','POST',{owner_id:f.person.id,title:'兰花',content:'兰花',kind:'experience',evidence:[{message_id:1,quote:'兰花'}]});
  rows=[{id:'same',content:'兰花',source:{kind:'ob_bucket',id:'same'}},{id:'huge',content:'兰花'.repeat(2000),source:{kind:'ob_bucket',id:'huge'}},{id:'valid',content:'买新盆',source:{kind:'ob_bucket',id:'valid'}}];
  await f.enable();await f.service.stream(f.chat.id,'兰花','dedup',()=>{});
  assert.deepEqual(f.service.externalMemory.last.ids,['valid']);
  assert.ok(!f.sent.at(-1)[0].content.includes('huge'));
});

test('preview and actual request share assembly; global recall switch disables remote disclosure',async()=>{
  const f=await fixture(async(c,p,b)=>reply(b));await f.enable();
  const preview=await f.service.api('/contacts/'+f.chat.id+'/context-preview','POST',{message:'兰花'});assert.equal(f.sent.length,0);
  await f.service.stream(f.chat.id,'兰花','actual',()=>{});assert.deepEqual(f.sent[0],preview.messages);
  await f.service.api('/memory-settings','PATCH',{recall:false});const count=f.calls.length;
  await f.service.stream(f.chat.id,'兰花','off',()=>{});assert.equal(f.calls.length,count);
});

test('credentials are origin bound even after document save failure; backups restore disabled',async()=>{
  const f=await fixture(async(c,p,b)=>reply(b));await f.enable();
  const backup=await f.service.api('/backup');assert.equal(validateBackup(backup).memory.external.enabled,false);
  f.disk.fail=true;
  await assert.rejects(f.service.api('/external-memory','PATCH',{...settings,url:'https://different-fixture.example',token:'different-synthetic-secret-token'}),/disk full/);
  assert.equal(f.service.externalMemory.config().url,settings.url);
  assert.equal(f.keys.get(await externalKeyId(settings.url)),token);
  assert.throws(()=>externalConfig({...settings,url:'http://192.0.2.1'}),/HTTPS/);
  assert.throws(()=>externalConfig({...settings,token}),/格式/);
});

test('native adapter uses encrypted credential reference and propagates cancellation',async()=>{
  let data,finish;const cancellations=[];
  const plugin={memoryRequest:async input=>{data=input;return new Promise(resolve=>{finish=resolve;});},async cancel(value){cancellations.push(value);}};
  const ctrl=new AbortController(),task=nativeMemoryRequest(plugin)(settings,'/v1/health',null,ctrl.signal);
  while(!data)await new Promise(resolve=>setTimeout(resolve,1));ctrl.abort();finish({body:'{}'});
  await assert.rejects(task,/cancelled/);assert.equal(data.profile_id,await externalKeyId(settings.url));assert.equal(cancellations[0].id,data.id);assert.ok(!JSON.stringify(data).includes(token));
});
