import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LocalService,emptyData,buildContext} from '../frontend/local-service.js';

async function fixture(){
  const disk={value:emptyData(),saves:0,keyReads:0,async load(){return structuredClone(this.value);},async save(data){this.saves++;this.value=structuredClone(data);},async hasKey(){return true;},async getKey(){this.keyReads++;return 'query-fixture-secret';}};
  let sent;
  const service=await new LocalService(disk,async(s,key,messages,delta)=>{sent=structuredClone(messages);delta('收到');}).init();
  const owner=await service.api('/characters','POST',{name:'林',identity:'来自山间',style:'简短',avatar:'',profile:{schema_version:1,character_id:'internal-metadata',canon:{nature:'人',immutable_facts:['已确认事实']},persona:{values:['诚实']}}});
  const other=await service.api('/characters','POST',{name:'雨',identity:'来自远方',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:owner.id});
  await service.api('/settings','PATCH',{model:'fixture',history_limit:2,wallpaper:'dusk'});
  await service.api('/contacts/'+chat.id,'PATCH',{chat_style:{mode:'dynamic',actions:true,emoji:20,voice:10}});
  await service.stream(chat.id,'喜欢散步','source',()=>{});
  return {service,disk,owner,other,chat,sent:()=>sent};
}

test('profile and identity-source queries return isolated snapshots from the roster',async()=>{
  const {service,disk,owner}=await fixture(),before=structuredClone(disk.value),saves=disk.saves;
  const profile=await service.api('/characters/'+owner.id);
  assert.equal(profile.name,'林');profile.profile.persona.values.push('不应写入');profile.identity='不应写入';
  const source=await service.api('/characters/'+owner.id+'/identity-source');
  assert.match(source.text,/来自山间/);assert.ok(!source.text.includes('不应写入'));
  assert.deepEqual(service.data,before);assert.equal(disk.saves,saves);
  await assert.rejects(service.api('/characters/missing'),/角色不存在/);
});

test('preview uses the actual context builder without model, credentials, writes or draft changes',async()=>{
  const {service,disk,chat,sent}=await fixture();
  await service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'已保存草稿'});
  const before=structuredClone(service.data),saves=disk.saves,keyReads=disk.keyReads;
  const preview=await service.api('/contacts/'+chat.id+'/context-preview','POST',{message:'预览新输入'});
  assert.deepEqual(preview.messages,buildContext(service.data,chat.id,'预览新输入'));
  assert.equal(preview.messages.length,4);assert.match(preview.messages[0].content,/已确认事实/);
  assert.ok(!JSON.stringify(preview).includes('query-fixture-secret'));
  assert.ok(!JSON.stringify(preview.messages).includes('internal-metadata'));
  preview.messages[0].content='修改预览副本';
  assert.deepEqual(service.data,before);assert.deepEqual(disk.value,before);
  assert.equal(disk.saves,saves);assert.equal(disk.keyReads,keyReads);
  const again=await service.api('/contacts/'+chat.id+'/context-preview','POST',{message:'预览新输入'});
  await service.stream(chat.id,'预览新输入','next',()=>{});
  assert.deepEqual(again.messages,sent());
});

test('appearance query excludes connection data and works with its independent local settings',async()=>{
  const {service,disk}=await fixture(),saves=disk.saves;
  const appearance=await service.api('/appearance');
  assert.equal(appearance.wallpaper,'dusk');assert.ok(!('model' in appearance));assert.ok(!('base_url' in appearance));assert.ok(!('api_key' in appearance));
  appearance.wallpaper='changed';assert.equal(service.data.settings.wallpaper,'dusk');assert.equal(disk.saves,saves);
});

test('source location requires the owning character and completed evidence, including old messages',async()=>{
  const {service,disk,owner,other,chat}=await fixture();
  await service.transact(d=>{for(let i=0;i<160;i++){const id=3+2*i;d.messages.push({id,session_id:chat.id,role:'user',content:'后续输入',created_at:'2026-01-02T00:00:00Z'},{id:id+1,session_id:chat.id,role:'assistant',content:'后续回复',created_at:'2026-01-02T00:00:00Z'});d.turns.push({request_id:'old_'+i,session_id:chat.id,user_id:id,assistant_id:id+1,state:'complete'});}});
  const saves=disk.saves;
  assert.equal((await service.api('/memory-sources?owner='+owner.id)).some(m=>m.id===1),false);
  const location=await service.api('/memory-sources/1/location?owner='+owner.id);
  assert.equal(location.message.content,'喜欢散步');assert.equal(location.contact.id,chat.id);
  location.contact.note='改副本';location.message.content='改副本';
  assert.equal(service.data.sessions[0].note,'');assert.equal(service.data.messages[0].content,'喜欢散步');assert.equal(disk.saves,saves);
  await assert.rejects(service.api('/memory-sources/1/location?owner='+other.id),/不属于/);
  await assert.rejects(service.api('/memory-sources/1/location'),/角色不存在/);
  await assert.rejects(service.api('/memory-sources/no/location?owner='+owner.id),/标识/);
  service.transport=async(s,k,m,delta)=>{delta('未完成');throw Error('fixture failure');};
  await assert.rejects(service.stream(chat.id,'失败输入','failed',()=>{}),/fixture failure/);
  await assert.rejects(service.api('/memory-sources/'+service.data.turns.at(-1).user_id+'/location?owner='+owner.id),/未完成/);
});

test('invalid preview requests and non-read query methods leave the document untouched',async()=>{
  const {service,disk,chat,owner}=await fixture(),before=structuredClone(service.data),saves=disk.saves;
  for(const message of [null,23,'x'.repeat(20001)])await assert.rejects(service.api('/contacts/'+chat.id+'/context-preview','POST',{message}),/格式|长度/);
  await assert.rejects(service.api('/contacts/missing/context-preview','POST',{message:''}),/会话不存在/);
  await assert.rejects(service.api('/contacts/'+chat.id+'/context-preview'),/POST/);
  await assert.rejects(service.api('/appearance','PATCH',{}),/GET/);
  await assert.rejects(service.api('/memory-sources/1/location?owner='+owner.id,'POST'),/GET/);
  assert.deepEqual(service.data,before);assert.equal(disk.saves,saves);
});

test('UI modules use queries instead of accessing the local document or assembling identity prompts',async()=>{
  for(const file of ['app.js','memory-ui.js','preferences-ui.js']){
    const source=await readFile(new URL('../frontend/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:service|local)\.data\b/,file+' bypasses the query interface');
    assert.doesNotMatch(source,/import\s*\{[^}]*\b(?:buildContext|rosterSource)\b/s,file+' assembles business context in the UI');
  }
});
