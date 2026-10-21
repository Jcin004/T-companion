import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {findPath} from '../frontend/world-pathfinding.js';
import {collision} from '../frontend/world-map.js';
import {proposalValue} from '../frontend/memory-link-proposals.js';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const copy=x=>structuredClone(x);
async function fixture(){
  let saved=emptyData(),fail=false,calls=[];
  const storage={load:async()=>copy(saved),save:async d=>{if(fail)throw Error('disk full');saved=copy(d);},hasKey:async()=>false};
  const transport=async(s,k,m,delta)=>{calls.push(copy(m));delta('模拟回复：听到了。');};
  const s=await new LocalService(storage,transport).init();
  for(const id of ['a','b'])await s.transact(d=>d.characters.push({id,name:id==='a'?'甲':'乙',identity:'',style:'',avatar:''}));
  await s.api('/settings','PATCH',{model:'mock'});await s.api('/world/setup','POST',{character_ids:['a','b']});
  return {s,calls,storage,transport,fail:value=>{fail=value;},restart:()=>new LocalService(storage,transport).init()};
}
const cmd=(s,request_id,type,extra={})=>s.api('/world/commands','POST',{request_id,type,...extra});
async function memory(s,owner,event,participants=[owner]){
  return s.api('/memories','POST',{owner_id:owner,title:'盆栽经历',content:event.content,kind:'experience',participants,evidence:[{source_type:'world_event',event_id:event.id,quote:event.content}]});
}
test('world state, positions, events and knowledge survive restart; commands are idempotent',async()=>{
  const f=await fixture(),{s}=f;
  const e=await cmd(s,'walk','move',{actor_id:'a',target:{x:2,y:8}});
  assert.deepEqual(e.observations.map(o=>o.owner_id),['a']);
  assert.deepEqual(await cmd(s,'walk','move',{actor_id:'a',target:{x:2,y:8}}),e);
  await assert.rejects(cmd(s,'walk','advance'),/不匹配/);
  const water=await cmd(s,'water','interact',{actor_id:'a',target_id:'plant'});
  const restarted=await f.restart();assert.deepEqual((await restarted.api('/world')).state,(await s.api('/world')).state);
  assert.equal(restarted.data.world.events.length,2);
  assert.equal((await restarted.api('/world/sources/'+water.id+'?owner=a')).id,water.id);
  await assert.rejects(restarted.api('/world/sources/'+water.id+'?owner=b'),/知情/);
  await assert.rejects(cmd(s,'blocked','move',{target:{x:10,y:4}}),/墙壁或家具/);
  assert.equal(s.data.world.events.length,2);
});
test('known world event uses existing memory recall and typed sources; mention gives no knowledge',async()=>{
  const {s}=await fixture();await cmd(s,'walk','move',{actor_id:'a',target:{x:2,y:8}});
  const event=await cmd(s,'water','interact',{actor_id:'a',target_id:'plant'});
  await memory(s,'a',event,['a','b']);await assert.rejects(memory(s,'b',event),/知情/);
  const a=await s.api('/contacts','POST',{character_id:'a'}),b=await s.api('/contacts','POST',{character_id:'b'});
  const preview=await s.api('/contacts/'+a.id+'/context-preview','POST',{message:'盆栽'});
  assert.match(preview.messages[0].content,/world_event/);assert.match(preview.messages[0].content,/给盆栽浇了水/);
  assert.doesNotMatch((await s.api('/contacts/'+b.id+'/context-preview','POST',{message:'盆栽'})).messages[0].content,/给盆栽浇了水/);
  assert.equal(s.data.messages.length,0);assert.equal(s.data.memory.events.length,1);
  const backup=await s.api('/backup');assert.deepEqual(validateBackup(backup).world,backup.world);
  const forged=copy(backup);forged.memory.events[0].owner_id='b';assert.throws(()=>validateBackup(forged),/知情/);
});
test('world persistence failure rolls back state, event and knowledge; same request retries',async()=>{
  const f=await fixture(),before=copy(f.s.data.world);f.fail(true);
  await assert.rejects(cmd(f.s,'retry','advance'),/disk full/);assert.deepEqual(f.s.data.world,before);
  f.fail(false);await cmd(f.s,'retry','advance');assert.equal(f.s.data.world.events.length,1);
  await cmd(f.s,'retry','advance');assert.equal(f.s.data.world.events.length,1);
});
test('scene and online histories/context are separate; only complete accepted dialogue creates event',async()=>{
  const f=await fixture(),{s,calls}=f;
  const scene=await s.api('/world/dialogue','POST',{character_id:'a'}),online=await s.api('/contacts','POST',{character_id:'a'});
  assert.notEqual(scene.id,online.id);assert.equal((await s.api('/contacts')).length,1);
  await s.stream(scene.id,'场景秘密','scene-rid',()=>{});
  assert.match(calls[0][0].content,/当前场景对话/);assert.match(calls[0][0].content,/暖木小屋/);
  assert.equal(s.data.world.events.length,1);assert.deepEqual(s.data.world.events[0].observations.map(o=>o.owner_id),['a']);
  assert.equal(s.data.memory.events.length,0);
  await s.stream(scene.id,'场景秘密','scene-rid',()=>{});assert.equal(s.data.world.events.length,1);assert.equal(calls.length,1);
  await s.stream(online.id,'线上问题','online-rid',()=>{});
  assert.match(calls[1][0].content,/线上私聊/);assert.doesNotMatch(JSON.stringify(calls[1]),/场景秘密|nearby|暖木小屋/);
  assert.equal(s.data.world.events.length,1);
  const a=await s.api('/memory-sources/1/location?owner=a');assert.equal(a.contact.mode,'world');
  assert.equal(validateBackup(await s.api('/backup')).turns.length,2);
});
test('failed scene reply is not a world experience; retry uses original scene snapshot',async()=>{
  const {s}=await fixture();const scene=await s.api('/world/dialogue','POST',{character_id:'a'});
  s.transport=async(s,k,m,delta)=>{delta('未完成');throw Error('network failure');};
  await assert.rejects(s.stream(scene.id,'提问','retry-scene',()=>{}),/network failure/);
  assert.equal(s.data.world.events.length,0);assert.equal((await s.api('/memory-sources?owner=a')).length,0);
  const snapshot=copy(s.data.turns[0].scene);await cmd(s,'tick','advance');let context;
  s.transport=async(s,k,m,delta)=>{context=m;delta('完成');};await s.stream(scene.id,'提问','retry-scene',()=>{});
  assert.deepEqual(s.data.turns[0].scene,snapshot);assert.match(context[0].content,/"tick":0/);
  assert.equal(s.data.world.events.filter(e=>e.source.type==='completed_dialogue').length,1);
});
test('pathfinding adapts unchanged upstream algorithm; obstacles and occupied cells block travel',()=>{
  const cells=collision({user:{x:5,y:8},a:{x:4,y:6}},'user');
  assert.equal(findPath(cells,12,13,5,8,4,6).reachable,false);
  const result=findPath(cells,12,13,5,8,4,3);assert.equal(result.reachable,true);
  for(const p of result.path)assert.equal(cells[p.y*12+p.x],0);
});
test('world evidence participates in reviewed directional links and their proposals without sharing',async()=>{
  const {s}=await fixture();const e=await cmd(s,'known','advance');await memory(s,'a',e);
  const online=await s.api('/contacts','POST',{character_id:'a'});await s.stream(online.id,'旧聊天的来源','source',()=>{});
  await s.api('/memories','POST',{owner_id:'a',title:'旧聊天',content:'旧聊天的来源',kind:'statement',evidence:[{message_id:1,quote:'旧聊天的来源'}]});
  const [one,two]=s.data.memory.events;
  const proposal=proposalValue(s.data,'a',{from:{kind:'memory',id:one.id},to:{kind:'memory',id:two.id},type:'supplements',reason:'补充材料',proof:[{kind:'memory',id:one.id,source_type:'world_event',event_id:e.id,quote:e.content},{kind:'memory',id:two.id,message_id:1,quote:'旧聊天的来源'}]});
  assert.equal(proposal.proof[0].source_type,'world_event');
  await s.api('/memory-links','POST',{owner_id:'a',from:proposal.from,to:proposal.to,type:'supplements',note:'人工确认'});
  assert.equal((await s.api('/memory-links?owner=a')).length,1);assert.equal((await s.api('/memory-links?owner=b')).length,0);
  const backup=await s.api('/backup');assert.equal(validateBackup(backup).memory.events.length,2);
});
test('vendored bytes and ESM adaptation match recorded upstream, no Node runtime dependency',async()=>{
  const root=new URL('../frontend/vendor/alicization-town/',import.meta.url),p=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
  for(const [name,ref] of Object.entries(p.files))assert.equal(createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'),ref.sha256);
  const original=(await readFile(new URL('pathfinding.cjs',root),'utf8')).replace(/\r\n/g,'\n');
  const adapted=(await readFile(new URL('../frontend/world-pathfinding.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  assert.equal(adapted.split('\n').slice(1).join('\n'),original.replace('module.exports = { findPath, findNearestWalkable };','export { findPath, findNearestWalkable };'));
});
