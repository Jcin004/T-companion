import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticStore} from '../frontend/diagnostics.js';
import {LocalService,emptyData} from '../frontend/local-service.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const memory=()=>({value:null,async load(){return copy(this.value);},async save(v){this.value=copy(v);}});
test('logs match actual context; failures are captured without credentials; ordinary backup excludes logs',async()=>{
 const logs=await new DiagnosticStore(memory()).init(),storage=memory();storage.value=emptyData();storage.key='private-fixture-key';storage.getKey=async()=>storage.key;storage.hasKey=async()=>true;
 let actual;const service=await new LocalService(storage,async(s,key,messages)=>{actual=copy(messages);throw Error('Authorization: Bearer '+key);},logs).init();
 const c=await service.api('/characters','POST',{name:'甲',identity:'甲的身份',style:'简短',avatar:''}),s=await service.api('/contacts','POST',{character_id:c.id});await service.api('/settings','PATCH',{model:'mock'});
 await assert.rejects(service.stream(s.id,'当前问题','request_logs_1',()=>{}));
 const entry=logs.state.entries[0];assert.deepEqual(entry.messages,actual);assert.equal(entry.state,'failed');assert.equal(entry.session_id,s.id);assert.match(entry.error,/已隐藏/);assert.ok(!JSON.stringify(logs.export()).includes(storage.key));
 const backup=await service.api('/backup');assert.ok(!('diagnostics' in backup));assert.ok(!('entries' in backup));assert.ok(!JSON.stringify(backup).includes('Authorization'));
 logs.capture(false);await assert.rejects(service.stream(s.id,'当前问题','request_logs_1',()=>{}));assert.equal(logs.state.entries[1].messages,undefined);assert.match(logs.state.entries[1].context_omitted,/未开启/);
});
test('bounded durable logs recover unfinished requests; nested credentials and query secrets are masked',async()=>{
 const storage=memory(),logs=await new DiagnosticStore(storage).init();logs.rememberSecret('private-test-key');
 logs.record('error','测试',{authorization:'x',nested:{api_key:'private-test-key'},error:'private-test-key Bearer xyz https://a.example?token=hidden'});
 assert.ok(!JSON.stringify(logs.export()).includes('private-test-key'));assert.ok(!JSON.stringify(logs.export()).includes('token=hidden'));
 for(let i=0;i<120;i++)logs.record('system','bounded',{i});assert.equal(logs.state.entries.length,100);
 logs.begin({messages:[{role:'user',content:'问题'}]});await logs.queue;
 const restored=await new DiagnosticStore(storage).init();assert.equal(restored.state.entries.at(-1).state,'interrupted');
 restored.clear();await restored.queue;assert.deepEqual(storage.value.entries,[]);
});
test('oversized context is explicitly omitted; unavailable storage never breaks chat logging',async()=>{
 const logs=await new DiagnosticStore({async load(){throw Error('full');},async save(){throw Error('full');}}).init();
 const id=logs.begin({messages:[{role:'user',content:'a'.repeat(400000)}]});assert.match(logs.state.entries[0].context_omitted,/上限/);
 logs.update(id,{state:'failed',error:'disk'});await logs.queue;assert.match(logs.warning,/保存失败/);assert.equal(logs.state.entries[0].state,'failed');
});
