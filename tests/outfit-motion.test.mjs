import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyPose,garmentCommands,WALK_TEMPLATE} from '../frontend/outfit-motion.js';
const shirt={asset:'shirt_1',template:WALK_TEMPLATE.id,parts:[{slot:'torso',source:[24,44,16,20]},{slot:'leftArm',source:[18,44,6,24]},{slot:'rightArm',source:[40,44,6,24]}]};
test('one shirt asset follows two body heights and opposing walking arms',()=>{
 const original=JSON.stringify(shirt);
 const tall=garmentCommands(shirt,bodyPose(80,0)),short=garmentCommands(shirt,bodyPose(64,0));
 assert.equal(tall[0].asset,short[0].asset);assert.notDeepEqual(tall[0].target,short[0].target);
 assert.notDeepEqual(tall[1].target,garmentCommands(shirt,bodyPose(80,2))[1].target);
 assert.equal(JSON.stringify(shirt),original);
 for(const height of [56,64,80])for(const pose of [0,1,2]){
  const b=bodyPose(height,pose);assert.equal(Math.max(b.leftLeg.y+b.leftLeg.height,b.rightLeg.y+b.rightLeg.height),88);
 }
});
test('fit modifies only the wearer and leaves shared source intact',()=>{
 const normal=garmentCommands(shirt,bodyPose()),fit=garmentCommands(shirt,bodyPose(),{scale:1.25,x:2,y:-1});
 assert.notDeepEqual(normal[0].target,fit[0].target);assert.deepEqual(normal[0].source,fit[0].source);
 assert.deepEqual(normal,garmentCommands(shirt,bodyPose()));
 assert.throws(()=>garmentCommands({...shirt,template:'other'},bodyPose()));
 assert.throws(()=>bodyPose(100));assert.throws(()=>garmentCommands(shirt,bodyPose(),{scale:NaN}));
});
