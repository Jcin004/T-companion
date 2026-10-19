import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData} from '../frontend/local-service.js';
import {EmbeddedMemory} from '../frontend/embedded-memory.js';

async function fixture(){
  const state={value:emptyData(),fail:false,async load(){return structuredClone(this.value);},async save(data){if(this.fail)throw Error('disk full');this.value=structuredClone(data);},async setKey(){},async getKey(){return '';},async hasKey(){return false;}};
  const calls=[],sent=[],plugin={fail:false,foreign:false,async execute({request}){
    const r=JSON.parse(request);calls.push(r);if(this.fail)throw Error('OB unavailable');
    return {result:JSON.stringify({provider:'embedded-ob',commit:'fixture',count:r.records.length,vector_enabled:false,
      ranked:r.queries?.map(()=>this.foreign?[{id:'foreign',score:90}]:r.records.filter(e=>e.owner_id===r.owner&&e.active).slice(0,1).map(e=>({id:e.id,score:90})))})};
  }};
  const service=await new LocalService(state,async(s,k,m,delta)=>{sent.push(m);delta('模拟回复');},null,async()=>{throw Error('external gateway must not run');},new EmbeddedMemory(plugin)).init();
  const person=await service.api('/characters','POST',{name:'林',identity:'名册身份',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:person.id});await service.api('/settings','PATCH',{model:'fixture'});
  await service.stream(chat.id,'兰花是紫色的','seed',()=>{});
  const add=()=>service.api('/memories','POST',{owner_id:person.id,title:'兰花',content:'用户说兰花是紫色的',kind:'statement',evidence:[{message_id:1,quote:'兰花是紫色的'}]});
  return {state,calls,sent,plugin,service,person,chat,add};
}

test('Android uses OB candidates with original sources in preview and real sends, no optional gateway',async()=>{
  const f=await fixture();await f.add();
  f.service.data.memory.external.enabled=true; // A legacy enabled setting must not activate network on Android.
  const preview=await f.service.api('/contacts/'+f.chat.id+'/context-preview','POST',{message:'ob-marker'});
  assert.equal(preview.recall.method,'embedded-ob+bounded-links');
  assert.match(preview.messages[0].content,/兰花是紫色的/);
  const queries=f.calls.filter(c=>c.action==='recall').length;
  await f.service.stream(f.chat.id,'ob-marker','send',()=>{});
  assert.equal(f.calls.filter(c=>c.action==='recall').length,queries+1);
  assert.match(f.sent.at(-1)[0].content,/兰花是紫色的/);
  assert.equal((await f.service.api('/memory-engine')).ready,true);
  await assert.rejects(f.service.api('/external-memory'),/内置 OB/);
  assert.ok(f.calls.every(c=>!JSON.stringify(c).includes('base_url')));
});

test('failed projection or SQLite commit leaves no visible memory and reconciles on the next operation',async()=>{
  const f=await fixture();f.plugin.fail=true;
  await assert.rejects(f.add(),/OB unavailable/);assert.equal(f.state.value.memory.events.length,0);
  f.plugin.fail=false;f.state.fail=true;
  await assert.rejects(f.add(),/disk full/);assert.equal(f.service.data.memory.events.length,0);
  f.state.fail=false;await f.service.api('/contacts/'+f.chat.id+'/context-preview','POST',{message:'anything'});
  assert.equal(f.calls.at(-1).records.length,0);
  await f.add();assert.equal(f.state.value.memory.events.length,1);
  const id=f.service.data.memory.events[0].id;
  await f.service.api('/memories/'+id,'PATCH',{active:false});assert.equal(f.calls.at(-1).records[0].active,false);
  await f.service.api('/memories/'+id,'DELETE');assert.deepEqual(f.calls.at(-1).records,[]);
});

test('invalid native candidates and engine failure never silently fall back to browser ranking',async()=>{
  const f=await fixture();await f.add();f.plugin.foreign=true;
  await assert.rejects(f.service.api('/contacts/'+f.chat.id+'/context-preview','POST',{message:'兰花'}),/范围错误/);
  f.plugin.foreign=false;f.plugin.fail=true;const count=f.sent.length;
  await assert.rejects(f.service.stream(f.chat.id,'兰花','bad-engine',()=>{}),/OB unavailable/);
  assert.equal(f.sent.length,count);assert.equal(f.service.data.turns.at(-1).state,'failed');
});

test('legacy records rebuild on initialization and restore, same schema and export',async()=>{
  const f=await fixture();await f.add();const backup=await f.service.api('/backup');
  f.service.embeddedMemory.invalidate();await f.service.init();
  assert.equal(f.calls.at(-1).action,'sync');assert.equal(f.calls.at(-1).records.length,1);
  assert.deepEqual((await f.service.api('/backup')).memory,backup.memory);
  await f.service.api('/memories/'+backup.memory.events[0].id,'DELETE');
  await f.service.api('/backup/restore','POST',backup);
  assert.equal(f.calls.at(-1).records.length,1);
  assert.deepEqual((await f.service.api('/backup')).memory,backup.memory);
});
