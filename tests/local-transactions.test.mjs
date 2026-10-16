import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,NativePersistence,emptyData} from '../frontend/local-service.js';

const copy=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

async function fixture(native=false){
  const disk={value:emptyData(),gate:null,async save(value){
    const gate=this.gate;this.gate=null;
    if(gate){gate.entered.resolve();await gate.release.promise;if(gate.fail)throw Error('disk full');}
    this.value=copy(value);
  }};
  const storage=native?new NativePersistence({
    async load(){return {data:JSON.stringify(disk.value)};},
    async save({data}){await disk.save(JSON.parse(data));},
    async hasKey(){return {value:false};}
  }):{async load(){return copy(disk.value);},save:value=>disk.save(value),async hasKey(){return false;}};
  const service=await new LocalService(storage,async(s,k,m,delta)=>delta('收到')).init();
  const owner=await service.api('/characters','POST',{name:'测试人物',identity:'重视诚实',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:owner.id});
  await service.api('/settings','PATCH',{model:'fixture'});
  await service.stream(chat.id,'喜欢散步','seed',()=>{});
  const memory={owner_id:owner.id,title:'散步',content:'用户说喜欢散步',kind:'statement',evidence:[{message_id:1,quote:'喜欢散步'}]};
  const block=(fail=false)=>disk.gate={entered:deferred(),release:deferred(),fail};
  return {service,disk,storage,owner,chat,memory,block};
}

for(const native of [false,true]){
  test(`${native?'Android adapter':'document adapter'}: rejected memory never leaks through a queued unrelated write`,async()=>{
    const {service,disk,storage,memory,block}=await fixture(native);
    const gate=block(true);
    const failed=assert.rejects(service.api('/memories','POST',memory),/disk full/);
    await gate.entered.promise;
    const during=await service.api('/backup');
    const later=service.api('/settings','PATCH',{font_size:19});
    gate.release.resolve();await failed;await later;
    assert.equal(during.memory.events.length,0);
    assert.equal(service.data.memory.events.length,0);
    assert.equal(disk.value.memory.events.length,0);
    assert.equal(disk.value.settings.font_size,19);
    const restarted=await new LocalService(storage,async()=>{}).init();
    assert.deepEqual(restarted.data,service.data);
  });
}

test('draft commands retain order after a failed edit and recovery does not lose successful memory',async()=>{
  const {service,disk,chat,memory,block}=await fixture();
  const gate=block(true);
  const failed=assert.rejects(service.api('/contacts/'+chat.id,'PATCH',{note:'未保存备注'}),/disk full/);
  await gate.entered.promise;
  const first=service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'草稿一'});
  const second=service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'草稿二'});
  gate.release.resolve();await failed;await Promise.all([first,second]);
  await service.api('/memories','POST',memory);
  assert.equal((await service.api('/contacts/'+chat.id+'/draft')).text,'草稿二');
  assert.equal(service.data.sessions[0].note,'');
  assert.equal(disk.value.memory.events.length,1);
  assert.deepEqual(service.data,disk.value);
});

test('stream commits merge drafts, retain complete reply and keep disk equal to memory',async()=>{
  const {service,disk,chat}=await fixture();
  const first=deferred(),release=deferred();
  service.transport=async(s,k,m,delta)=>{delta('第一段');first.resolve();await release.promise;delta('第二段');};
  const sending=service.stream(chat.id,'继续','stream',()=>{});
  await first.promise;
  await service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'回复时输入的新草稿'});
  release.resolve();await sending;
  assert.equal(service.data.messages.at(-1).content,'第一段第二段');
  assert.equal(service.data.turns.at(-1).state,'complete');
  assert.equal(disk.value.drafts[chat.id],'回复时输入的新草稿');
  assert.deepEqual(service.data,disk.value);
});

test('initial chat save failure does not call model or expose an accepted turn',async()=>{
  const {service,disk,chat,block}=await fixture();let calls=0;
  service.transport=async()=>{calls++;};
  const before=copy(disk.value),gate=block(true);
  const failed=assert.rejects(service.stream(chat.id,'不能保存','failed-start',()=>{}),/disk full/);
  await gate.entered.promise;gate.release.resolve();await failed;
  assert.equal(calls,0);assert.equal(service.active,null);
  assert.deepEqual(service.data,before);assert.deepEqual(disk.value,before);
});

test('restore joins the same queue and failure leaves both active state and disk intact',async()=>{
  const {service,disk,chat,block}=await fixture();
  const backup=await service.api('/backup');backup.settings.font_size=21;
  const before=copy(disk.value),gate=block(true);
  const failed=assert.rejects(service.api('/backup/restore','POST',backup),/disk full/);
  await gate.entered.promise;
  const draft=service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'恢复失败后保留'});
  gate.release.resolve();await failed;await draft;
  assert.equal(service.data.settings.font_size,before.settings.font_size);
  assert.equal(disk.value.drafts[chat.id],'恢复失败后保留');
  assert.deepEqual(service.data,disk.value);
});

test('a failed stream checkpoint cannot be reported as complete even if the next write succeeds',async()=>{
  const {service,disk,chat,block}=await fixture();
  let gate;
  service.transport=async(s,k,m,delta)=>{
    gate=block(true);delta('部分内容');
    await gate.entered.promise;gate.release.resolve();
  };
  const events=[];
  await assert.rejects(service.stream(chat.id,'继续','failed-checkpoint',event=>events.push(event)),/disk full/);
  assert.ok(!events.includes('complete'));
  assert.equal(service.data.turns.at(-1).state,'failed');
  assert.equal(service.data.messages.at(-1).content,'部分内容');
  assert.deepEqual(service.data,disk.value);
});

test('queued roster edit invalidates an analysis before its commit starts',async()=>{
  const {service,disk,owner,block}=await fixture();
  const generating=deferred(),releaseModel=deferred();
  service.transport=async(s,k,m,delta)=>{
    generating.resolve();await releaseModel.promise;
    delta(JSON.stringify({anchors:[{label:'诚实',interpretation:'重视如实表达',quote:'重视诚实',basis:'explicit'}]}));
  };
  const analysis=service.api('/self/analyze','POST',{owner_id:owner.id});
  const rejected=assert.rejects(analysis,/名册已变化/);
  await generating.promise;
  const gate=block();
  const edit=service.api('/characters/'+owner.id,'PATCH',{...owner,identity:'喜欢音乐'});
  await gate.entered.promise;releaseModel.resolve();
  // Let generation finish and enqueue its commit behind the pending roster edit.
  while(!service.memoryModule.saving)await new Promise(resolve=>setImmediate(resolve));
  gate.release.resolve();await edit;await rejected;
  assert.equal(service.data.memory.anchors.length,0);
  assert.equal(service.data.characters[0].identity,'喜欢音乐');
  assert.deepEqual(service.data,disk.value);
});
