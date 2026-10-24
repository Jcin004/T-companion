import test from 'node:test';
import assert from 'node:assert/strict';
import {spriteRect,locateCalibration,defaultCalibration,validateCalibration,frameView} from '../frontend/sprite-calibration.js';
import {validateAtlas} from '../frontend/character-looks.js';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
const image='data:image/png;base64,AAAA';
const calibrated=()=>({image,frames:3,calibration:{version:1,foot_x:.5,foot_y:.9,body_height:.7,world_height:.20}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('real feet and body height survive transparent margins without per-frame fitting',()=>{
  const ground={x:140,y:240};
  for(const [width,height,a] of [[48,64,{foot_x:.5,foot_y:.9,body_height:.7}],[96,128,{foot_x:.3,foot_y:.85,body_height:.35}]]){
    const rect=spriteRect(width,height,60,ground,a);
    near(rect.x+rect.width*a.foot_x,ground.x);near(rect.y+rect.height*a.foot_y,ground.y);near(rect.height*a.body_height,60);
    // The same anchor/height is used for every frame; no alpha-bounds fitting.
    assert.deepEqual(spriteRect(width,height,60,ground,a),rect);
  }
  assert.deepEqual(spriteRect(32,64,60,ground),{x:125,y:180,width:30,height:60});
  assert.deepEqual(frameView(192,192,48,64),{x:24,y:0,width:144,height:192,scale:3});
});

test('foot and head picking stays bounded; corrupt calibration cannot enter an atlas',()=>{
  let a=locateCalibration(undefined,'foot',.45,.9);a=locateCalibration(a,'head',.4,.2);
  near(a.body_height,.7);assert.equal(a.foot_x,.45);validateAtlas({...calibrated(),calibration:a});
  for(const bad of [null,{}, {...a,foot_x:NaN},{...a,foot_y:0},{...a,body_height:1},{...a,world_height:.9},{...a,unknown:1},{...a,version:2}])assert.throws(()=>validateCalibration(bad),/校准/);
  assert.deepEqual(locateCalibration(defaultCalibration(),'foot',-5,8).foot_x,0);
});

test('calibration uses the existing transaction, backup and restart with failure rollback',async()=>{
  let saved=emptyData(),fail=false;const clone=v=>JSON.parse(JSON.stringify(v));
  const persistence={load:async()=>clone(saved),save:async d=>{if(fail)throw Error('synthetic save failure');saved=clone(d);}};
  const service=await new LocalService(persistence).init();
  await service.transact(d=>d.characters.push({id:'a',name:'合成人物',identity:'',style:'',avatar:''}));
  await service.api('/character-looks/a','PATCH',{sprite:calibrated()});
  const expected=clone(service.data.character_looks);
  assert.deepEqual((await new LocalService(persistence).init()).data.character_looks,expected);
  assert.deepEqual(validateBackup(await service.api('/backup')).character_looks,expected);
  fail=true;await assert.rejects(service.api('/character-looks/a','PATCH',{sprite:{...calibrated(),calibration:defaultCalibration()}}),/save failure/);
  assert.deepEqual(service.data.character_looks,expected);
  fail=false;await assert.rejects(service.api('/character-looks/a','PATCH',{sprite:{...calibrated(),calibration:{...defaultCalibration(),foot_y:-1}}}),/校准/);
  assert.deepEqual(service.data.character_looks,expected);
});
