import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joystickDirection,createJoystickMotion} from '../frontend/world-joystick.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){
  let pending;
  return {schedule:fn=>{assert.equal(pending,undefined);pending=fn;return 1;},clear:()=>{pending=undefined;},fire:()=>{const fn=pending;pending=undefined;fn?.();},has:()=>!!pending};
}
test('joystick dead zone and dominant cardinal direction avoid diagonal corner cutting',()=>{
  assert.equal(joystickDirection(2,3,40),null);
  assert.deepEqual(joystickDirection(30,8,40),{x:1,y:0});
  assert.deepEqual(joystickDirection(-30,-8,40),{x:-1,y:0});
  assert.deepEqual(joystickDirection(8,-30,40),{x:0,y:-1});
  assert.deepEqual(joystickDirection(-8,30,40),{x:0,y:1});
});
test('held movement serializes saves, changes direction and drops queued work on release',async()=>{
  const timer=clock(),steps=[],rest=[];let resolve;
  const m=createJoystickMotion({...timer,step:d=>{steps.push(d);return new Promise(r=>{resolve=r;});},onRest:()=>rest.push('rest'),onError:assert.fail});
  m.point({x:1,y:0});m.point({x:0,y:1});assert.equal(steps.length,1);assert.equal(timer.has(),false);
  resolve();await flush();timer.fire();assert.deepEqual(steps,[{x:1,y:0},{x:0,y:1}]);
  m.stop();m.stop();assert.equal(rest.length,0);resolve();await flush();timer.fire();
  assert.equal(steps.length,2);assert.equal(rest.length,1);assert.equal(timer.has(),false);
});
test('dead zone pauses a held stick and release cancels a scheduled step',async()=>{
  const timer=clock();let calls=0;
  const m=createJoystickMotion({...timer,step:async()=>{calls++;},onError:assert.fail});
  m.point({x:1,y:0});await flush();m.point(null);timer.fire();assert.equal(calls,1);
  m.point({x:-1,y:0});await flush();m.stop();timer.fire();assert.equal(calls,2);
});
test('a failed save stops the hold; another movement requires fresh input',async()=>{
  const timer=clock(),errors=[];let calls=0,rests=0;
  const m=createJoystickMotion({...timer,step:async()=>{calls++;throw Error('synthetic disk full');},onError:e=>errors.push(e.message),onRest:()=>rests++});
  m.point({x:1,y:0});await flush();timer.fire();assert.equal(calls,1);assert.equal(rests,1);assert.deepEqual(errors,['synthetic disk full']);assert.equal(timer.has(),false);
});
