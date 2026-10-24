import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonSnapshot} from '../frontend/json-snapshot.js';
import {LocalService,emptyData} from '../frontend/local-service.js';

test('JSON snapshots isolate every mutable container without encoding image strings',()=>{
  const image='data:image/png;base64,'+'A'.repeat(480000),input={image,items:[{x:1},null,undefined,NaN],ignored:undefined};
  const expected=JSON.parse(JSON.stringify(input)),stringify=JSON.stringify;
  let encoded=0;JSON.stringify=(...args)=>{encoded++;return stringify(...args);};
  let result;try{result=jsonSnapshot(input);}finally{JSON.stringify=stringify;}
  assert.equal(encoded,0);assert.deepEqual(result,expected);result.items[0].x=2;assert.equal(input.items[0].x,1);
  const proto=jsonSnapshot(JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal(Object.getPrototypeOf(proto),Object.prototype);assert.equal(Object.hasOwn(proto,'__proto__'),true);assert.equal({}.polluted,undefined);
  const cycle={};cycle.self=cycle;assert.throws(()=>jsonSnapshot(cycle),/circular/);assert.throws(()=>jsonSnapshot(1n),/BigInt/);
});

test('world active looks stay isolated and invalid inactive skins are still rejected',async()=>{
  const data=emptyData();data.characters=[{id:'a',name:'林',identity:'',style:''},{id:'b',name:'雨',identity:'',style:''}];
  const s=await new LocalService({load:async()=>data,save:async()=>{}}).init();
  await s.api('/world/setup','POST',{character_ids:['a','b']});
  const image='data:image/png;base64,AAAA';await s.api('/character-looks/a','PATCH',{sprite:{image,frames:3,idle_frame:1},skins:[{id:'other',name:'备用',skin:0,portraits:[],portrait:0,sprite:null}]});
  const world=await s.api('/world');world.looks.a.sprite.frames=7;world.state.positions.a.x=7;
  assert.equal((await s.api('/world')).looks.a.sprite.frames,3);assert.equal((await s.api('/world')).state.positions.a.x,4);
  const command={type:'move',actor_id:'user',request_id:'projected',target:{x:6,y:8}};
  const projection=await s.api('/world/commands?view=world','POST',command);
  assert.equal(projection.world.state.positions.user.x,6);assert.deepEqual(await s.api('/world/commands?view=world','POST',command),projection);
  projection.world.state.positions.user.x=0;assert.equal((await s.api('/world')).state.positions.user.x,6);
  s.data.character_looks.a.skins[0].sprite={image:'invalid',frames:3};await assert.rejects(s.api('/world'),/图集/);
});
