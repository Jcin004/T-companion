import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {sceneText,sceneActionCandidate} from '../frontend/world-scene-actions.js';
import {validateWorld,copy} from '../frontend/world-core.js';
async function fixture(){
  let saved=emptyData(),fail=false,answer='收到。',calls=0;
  const storage={load:async()=>copy(saved),save:async d=>{if(fail)throw Error('synthetic disk failure');saved=copy(d);},hasKey:async()=>false};
  const transport=async(s,k,m,delta)=>{calls++;delta(answer);};
  const s=await new LocalService(storage,transport).init();
  await s.transact(d=>d.characters.push({id:'a',name:'林',identity:'合成身份',style:'',avatar:''},{id:'b',name:'雨',identity:'另一份合成身份',style:'',avatar:''}));
  await s.api('/settings','PATCH',{model:'mock'});await s.api('/world/setup','POST',{character_ids:['a','b']});
  const scene=await s.api('/world/dialogue','POST',{character_id:'a'});
  return {s,scene,answer:v=>{answer=v;},fail:v=>{fail=v;},calls:()=>calls,restart:()=>new LocalService(storage,transport).init()};
}
test('room occupants include distant resident, without granting private memory or hearing',async()=>{
  const {s,scene}=await fixture();const v=await s.api('/contacts/'+scene.id+'/context-preview','POST',{message:'有其他人吗'});
  const sc=(await import('../frontend/world-core.js')).sceneSnapshot(s.data,scene.id);
  assert.equal(sc.room_occupants.length,2);assert.deepEqual(sc.nearby.map(p=>p.id),['a']);assert.deepEqual(sc.heard_by.map(p=>p.id),['a']);
  assert.match(v.messages[0].content,/雨/);assert.doesNotMatch(v.messages[0].content,/另一份合成身份/);
  const online=await s.api('/contacts','POST',{character_id:'a'}),net=await s.api('/contacts/'+online.id+'/context-preview','POST',{message:'有其他人吗'});
  assert.doesNotMatch(net.messages[0].content,/room_occupants|世界行动/);
});
test('nearby listeners have dialogue evidence, distant residents do not',async()=>{
  const f=await fixture(),{s,scene}=f;
  await s.api('/world/commands','POST',{request_id:'near',type:'move',actor_id:'b',target:{x:5,y:6}});
  await s.stream(scene.id,'在场交谈','audible',()=>{});
  const e=s.data.world.events.find(e=>e.source.request_id==='audible');assert.deepEqual(e.observations.map(o=>o.owner_id),['a','b']);
  assert.equal((await s.api('/world/sources/'+e.id+'?owner=b')).id,e.id);
});
test('completed reply moves only its speaker, operates curtain, keeps typed provenance, retries once',async()=>{
  const f=await fixture(),{s,scene}=f;f.answer('我去拉一下窗帘。\n[世界行动:{"type":"interact","target_id":"window"}]');
  const before=copy(s.data.world.positions);await s.stream(scene.id,'试试窗帘','curtain',()=>{});
  assert.equal(s.data.world.curtain,true);assert.deepEqual(s.data.world.positions.user,before.user);assert.deepEqual(s.data.world.positions.b,before.b);assert.notDeepEqual(s.data.world.positions.a,before.a);
  const events=s.data.world.events.filter(e=>e.source.type==='scene_action');assert.equal(events.length,2);assert.ok(events.every(e=>e.source.dialogue_request_id==='curtain'&&e.source.command.actor_id==='a'));
  assert.equal(s.data.turns[0].world_action.state,'complete');validateWorld(s.data);
  assert.doesNotMatch(sceneText(s.data.messages[1].content),/世界行动/);
  const n=s.data.world.events.length;await s.stream(scene.id,'试试窗帘','curtain',()=>{});assert.equal(s.data.world.events.length,n);assert.equal(f.calls(),1);
  const restarted=await f.restart();assert.deepEqual(restarted.data.world,s.data.world);
  assert.deepEqual(validateBackup(await s.api('/backup')).world,s.data.world);
});
test('invalid, impersonating and incomplete action candidates cannot change world state',async()=>{
  for(const output of ['[世界行动:{"type":"interact","target_id":"missing"}]','[世界行动:{"type":"interact","target_id":"window","actor_id":"b"}]','[世界行动:{"type":"interact"']){
    const f=await fixture(),before=copy(f.s.data.world.positions);f.answer(output);await f.s.stream(f.scene.id,'执行','bad',()=>{});
    assert.deepEqual(f.s.data.world.positions,before);assert.equal(f.s.data.world.curtain,false);assert.equal(f.s.data.world.events.length,1);assert.equal(f.s.data.turns[0].world_action.state,'rejected');
  }
  assert.throws(()=>sceneActionCandidate('[世界行动:{"type":"move","target":{"x":1,"y":1}}]'),/只允许/);
});
test('interrupted stream and completion-save failure do not commit dialogue actions',async()=>{
  const f=await fixture();f.s.transport=async(s,k,m,delta)=>{delta('[世界行动:{"type":"interact","target_id":"window"}]');throw Error('synthetic network failure');};
  const before=copy(f.s.data.world);await assert.rejects(f.s.stream(f.scene.id,'执行','interrupt',()=>{}));assert.deepEqual(f.s.data.world,before);
  f.s.transport=async(s,k,m,delta)=>{delta('[世界行动:{"type":"interact","target_id":"window"}]');await f.s.queue;f.fail(true);};
  await assert.rejects(f.s.stream(f.scene.id,'执行','interrupt',()=>{}));assert.deepEqual(f.s.data.world,before);
  f.fail(false);
});
test('appearance persists, validates asset bounds, isolates identity and rolls back rejected save',async()=>{
  const f=await fixture(),{s}=f,identity=copy(s.data.characters);
  const look=await s.api('/character-looks/a');assert.equal(look.skin,1);
  await s.api('/character-looks/a','PATCH',{skin:2});assert.equal((await (await f.restart()).api('/character-looks/a')).skin,2);assert.deepEqual(s.data.characters,identity);
  const bad={skin:8};await assert.rejects(s.api('/character-looks/a','PATCH',bad),/立绘/);
  await assert.rejects(s.api('/character-looks/a','PATCH',{identity:'不能改身份'}),/立绘/);
  f.fail(true);await assert.rejects(s.api('/character-looks/a','PATCH',{skin:0}));f.fail(false);assert.equal((await s.api('/character-looks/a')).skin,2);
  const backup=await s.api('/backup');assert.equal(validateBackup(backup).character_looks.a.skin,2);backup.character_looks.a.sprite={image:'https://private.example/sprite.png',frames:4};assert.throws(()=>validateBackup(backup),/图集/);
});
test('facing is durable and unsupported facing values are rejected',async()=>{
  const f=await fixture(),{s}=f;await s.api('/world/commands','POST',{request_id:'left',type:'move',target:{x:4,y:8}});assert.equal(s.data.world.facing.user,'left');
  assert.equal((await f.restart()).data.world.facing.user,'left');const bad=await s.api('/backup');bad.world.facing.user='flying';assert.throws(()=>validateBackup(bad),/朝向/);
});
