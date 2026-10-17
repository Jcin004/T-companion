import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup,buildContext} from '../frontend/local-service.js';

async function fixture(){
  const store={value:emptyData(),fail:false,gate:null,async load(){return structuredClone(this.value);},async save(data){if(this.gate){const g=this.gate;this.gate=null;g.enter();await g.wait;throw Error('disk full');}if(this.fail)throw Error('disk full');this.value=structuredClone(data);},async hasKey(){return false;}};
  let result='收到';
  const service=await new LocalService(store,async(s,k,m,delta)=>delta(result)).init();
  const a=await service.api('/characters','POST',{name:'林',identity:'重视诚实',style:'简短',avatar:''});
  const b=await service.api('/characters','POST',{name:'雨',identity:'',style:'',avatar:''});
  const chat=await service.api('/contacts','POST',{character_id:a.id});
  await service.api('/settings','PATCH',{model:'mock'});await service.stream(chat.id,'喜欢山间散步','seed',()=>{});
  const event={owner_id:a.id,title:'散步',content:'用户说喜欢散步',kind:'statement',participants:[a.id,b.id],evidence:[{message_id:1,quote:'喜欢山间散步'}]};
  await service.api('/memories','POST',event);await service.api('/memories','POST',{...event,title:'相处',content:'角色回应收到'});
  await service.api('/self','POST',{owner_id:a.id,label:'诚实',interpretation:'重视如实表达',quote:'重视诚实'});
  const [one,two]=service.data.memory.events,anchor=service.data.memory.anchors[0];
  const input={owner_id:a.id,from:{kind:'memory',id:one.id},to:{kind:'memory',id:two.id},type:'supplements',note:'对同一次谈话的补充理解'};
  const list=(owner=a.id)=>service.api('/memory-links?owner='+owner);
  return {service,store,a,b,chat,event,one,two,anchor,input,list,set:value=>result=JSON.stringify(value)};
}

test('old backups initialize empty relations and node revisions without losing messages or identity',async()=>{
  const {service,store}=await fixture();const backup=await service.api('/backup');
  delete backup.memory.links;for(const node of [...backup.memory.events,...backup.memory.anchors])delete node.revision;
  const migrated=validateBackup(backup);assert.deepEqual(migrated.memory.links,[]);
  assert.ok(migrated.memory.events.every(n=>n.revision===0));assert.deepEqual(migrated.messages,backup.messages);assert.deepEqual(migrated.characters,backup.characters);
  store.value=backup;const restarted=await new LocalService(store,async()=>{}).init();assert.deepEqual(restarted.data.memory,migrated.memory);assert.deepEqual(restarted.data.messages,backup.messages);assert.deepEqual(restarted.data.characters,backup.characters);
});

test('directional relations and tag evidence persist, list at both endpoints, edit and delete independently',async()=>{
  const {service,store,a,b,one,two,anchor,input,list}=await fixture();
  for(const type of ['supplements','contradicts','causes','results_from'])await service.api('/memory-links','POST',{...input,type});
  const support={...input,type:'supports',to:{kind:'anchor',id:anchor.id}};
  await service.api('/memory-links','POST',support);
  let links=await list();assert.equal(links.length,5);assert.equal((await list(b.id)).length,0);
  assert.ok(links.every(l=>l.from.id===one.id));assert.ok(!links.some(l=>l.from.id===two.id));
  assert.equal((await service.api('/memory-links?owner='+a.id+'&kind=anchor&node='+anchor.id)).length,1);
  links[0].from.title='修改副本';assert.equal(service.data.memory.events[0].title,one.title);
  await service.api('/memory-links/'+links[0].id,'PATCH',{...input,note:'修订说明'});
  assert.equal((await list())[0].note,'修订说明');
  const backup=await service.api('/backup');assert.equal(validateBackup(backup).memory.links.length,5);
  const restarted=await new LocalService(store,async()=>{}).init();assert.equal(restarted.data.memory.links.length,5);
  await service.api('/memory-links/'+links[0].id+'?owner='+a.id,'DELETE');assert.equal((await list()).length,4);assert.equal(service.data.memory.events.length,2);
});

test('self-links, duplicates, foreign owners, invalid types and invalid backups are rejected atomically',async()=>{
  const {service,a,b,anchor,input,list}=await fixture();
  await service.api('/memory-links','POST',input);const before=structuredClone(service.data);
  for(const value of [input,{...input,to:input.from},{...input,owner_id:b.id},{...input,type:'made-up'},{...input,to:{kind:'anchor',id:anchor.id}},{...input,note:'x'.repeat(1001)},{...input,to:{kind:'memory',id:'missing'}}])await assert.rejects(service.api('/memory-links','POST',value));
  const link=(await list())[0];
  await assert.rejects(service.api('/memory-links/'+link.id+'?owner='+b.id,'DELETE'),/不属于/);
  await assert.rejects(service.api('/memory-links?owner='+b.id+'&kind=memory&node='+input.from.id),/不属于/);
  assert.deepEqual(service.data,before);
  for(const mutate of [d=>d.memory.links.push(structuredClone(d.memory.links[0])),d=>d.memory.links[0].to.id='missing',d=>d.memory.links[0].owner_id=b.id,d=>d.memory.links[0].from_revision=-1,d=>d.memory.links=null]){
    const backup=await service.api('/backup');mutate(backup);assert.throws(()=>validateBackup(backup));
  }
  assert.equal((await list(a.id)).length,1);
});

test('endpoint edits mark a relation for review; re-saving confirms it and pauses keep it visible',async()=>{
  const {service,one,input,list}=await fixture();await service.api('/memory-links','POST',input);
  let link=(await list())[0];assert.equal(link.stale,false);
  await service.api('/memories/'+one.id,'PATCH',{active:false});link=(await list())[0];assert.equal(link.stale,true);assert.equal(link.from.active,false);
  await service.api('/memory-links/'+link.id,'PATCH',input);assert.equal((await list())[0].stale,false);
});

test('delete endpoint removes only incident relations; storage failure restores nodes and edges together',async()=>{
  const {service,store,a,one,anchor,input,list}=await fixture();
  await service.api('/memory-links','POST',input);await service.api('/memory-links','POST',{...input,type:'supports',to:{kind:'anchor',id:anchor.id}});
  const before=structuredClone(service.data);store.fail=true;
  await assert.rejects(service.api('/memories/'+one.id,'DELETE'),/disk full/);assert.deepEqual(service.data,before);assert.deepEqual(store.value,before);
  store.fail=false;await service.api('/self/'+anchor.id,'DELETE');assert.equal((await list()).length,1);
  await service.api('/memories/'+one.id,'DELETE');assert.equal((await list()).length,0);assert.equal(service.data.messages.length,2);assert.equal(service.data.characters[0].id,a.id);
});

test('a rejected relation never leaks through a queued draft save',async()=>{
  const {service,store,chat,input,list}=await fixture();let enter,release;
  const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);store.gate={enter,wait};
  const failed=assert.rejects(service.api('/memory-links','POST',input),/disk full/);await entered;
  const draft=service.api('/contacts/'+chat.id+'/draft','PATCH',{text:'关联保存失败时的草稿'});
  assert.equal((await list()).length,0);release();await failed;await draft;
  assert.equal(store.value.memory.links.length,0);assert.equal(store.value.drafts[chat.id],'关联保存失败时的草稿');
});

test('linked AI anchors survive re-analysis; unconfirmed anchors do not alter context, identity or knowledge',async()=>{
  const {service,a,b,chat,one,anchor,input,list,set}=await fixture();
  set({anchors:[{label:'简洁',interpretation:'偏好简短表达',quote:'简短',basis:'explicit'}]});
  await service.api('/self/analyze','POST',{owner_id:a.id});const ai=service.data.memory.anchors.find(n=>n.origin==='ai');
  const before=structuredClone({characters:service.data.characters,messages:service.data.messages,context:buildContext(service.data,chat.id,'散步')});
  await service.api('/memory-links','POST',{...input,type:'supports',to:{kind:'anchor',id:ai.id}});
  const protectedAnchor=structuredClone(service.data.memory.anchors.find(n=>n.id===ai.id));
  set({anchors:[{label:'简洁',interpretation:'另一个分析',quote:'简短',basis:'explicit'}]});await service.api('/self/analyze','POST',{owner_id:a.id});
  assert.deepEqual(service.data.memory.anchors.find(n=>n.id===ai.id),protectedAnchor);
  set({anchors:[]});await service.api('/self/analyze','POST',{owner_id:a.id});
  assert.ok(service.data.memory.anchors.some(n=>n.id===ai.id));assert.ok(service.data.memory.anchors.some(n=>n.id===anchor.id));
  assert.equal((await list()).length,1);assert.equal((await list(b.id)).length,0);
  assert.deepEqual(service.data.characters,before.characters);assert.deepEqual(service.data.messages,before.messages);assert.deepEqual(buildContext(service.data,chat.id,'散步'),before.context);
  assert.equal(one.participants.includes(b.id),true);
});
