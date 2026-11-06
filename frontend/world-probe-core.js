// Isolated integration experiment: upstream rules, no I/O, DOM or model calls.
import {applyBeatToThreads,dmThreadsOf,formatThreadForPrompt} from './vendor/sullyos-world/utils/worldHome/threads.ts';
import {Clock} from './vendor/alife-core/packages/alife-core/src/core/Clock.ts';
import {GOAPPlanner} from './vendor/alife-core/packages/alife-core/src/ai/GOAPPlanner.ts';
import {WorldState} from './vendor/alife-core/packages/alife-core/src/ai/WorldState.ts';

const clone=value=>JSON.parse(JSON.stringify(value));
const members=[{id:'probe-a',name:'林'},{id:'probe-b',name:'雨'}];
export function fixture(){
  return {experiment:'sully-headless-v1',version:1,worldVersion:0,characters:clone(members),world:{id:'probe-world',name:'通信实验小屋',memberIds:members.map(m=>m.id),npcs:[],threads:[]},receipts:{},clock:new Clock({startHour:23,timeFactor:1}).serialize(),elapsedMs:0,hours:[]};
}
function validate(data){
  if(data?.experiment!=='sully-headless-v1'||data.version!==1||!Number.isSafeInteger(data.worldVersion))throw Error('不是隔离实验存档');
}
export function snapshot(data){
  validate(data);
  const threads=dmThreadsOf(data.world,'probe-b');
  return clone({experiment:data.experiment,worldVersion:data.worldVersion,characters:data.characters,threads,received:threads.map(t=>formatThreadForPrompt(t,'probe-b',120,data.worldVersion)).join('\n'),receipts:data.receipts,clock:data.clock,elapsedMs:data.elapsedMs,hours:data.hours});
}
export function advance(data,{requestId,text='今晚一起看书吗？',sender='probe-a'}={}){
  validate(data);
  if(typeof requestId!=='string'||!/^probe-[a-z0-9-]{1,64}$/.test(requestId)||typeof text!=='string'||!text.trim()||text.length>500||!members.some(m=>m.id===sender))throw Error('实验任务格式错误');
  const fingerprint=JSON.stringify({text,sender});
  const previous=data.receipts[requestId];
  if(previous){if(previous.fingerprint!==fingerprint)throw Error('任务标识对应的内容已改变');return {data:clone(data),receipt:clone(previous),replayed:true};}
  const next=clone(data),actor=members.find(m=>m.id===sender),to=members.find(m=>m.id!==sender);
  const round=next.worldVersion+1;
  // The upstream implementation creates, deduplicates and appends the actual DM.
  applyBeatToThreads(next.world,{charId:actor.id,charName:actor.name,phone:{dms:[{to:to.name,lines:[text]}],group:[]}},members,round,'实验第 '+round+' 轮');
  next.worldVersion=round;
  const receipt={requestId,fingerprint,worldVersion:round};next.receipts[requestId]=receipt;
  return {data:next,receipt:clone(receipt),replayed:false};
}
export function catchUp(data,targetElapsedMs){
  validate(data);
  if(!Number.isSafeInteger(targetElapsedMs)||targetElapsedMs<data.elapsedMs||targetElapsedMs>7*86400000)throw Error('实验补算区间无效');
  const next=clone(data),clock=Clock.fromState(next.clock,{onHourChanged:(hour,day)=>next.hours.push({hour,day})});
  let remaining=targetElapsedMs-next.elapsedMs;
  // Upstream Clock misses callbacks when a single update spans 24h. Keep the
  // original source unchanged: feed bounded hourly slices through an adapter.
  while(remaining>0){const step=Math.min(remaining,3600000);clock.update(step);remaining-=step;}
  next.clock=clock.serialize();next.elapsedMs=targetElapsedMs;return next;
}
export function ruleCompatibility(){
  const ordinary=catchUp(fixture(),1800000);
  const midnight=catchUp(fixture(),7200000);
  const multi=catchUp(fixture(),49*3600000);
  const resumed=catchUp(JSON.parse(JSON.stringify(catchUp(fixture(),17*3600000))),49*3600000);
  const repeated=catchUp(multi,49*3600000);
  const directHours=[],raw=new Clock({startHour:23,timeFactor:1,onHourChanged:(hour,day)=>directHours.push({hour,day})});raw.update(48*3600000);
  const descriptors=[{id:'walk-to-desk',cost:1,preconditions:{atDesk:false},effects:{atDesk:true}},{id:'read-book',cost:1,preconditions:{atDesk:true,read:false},effects:{read:true}}];
  const current={atDesk:false,read:false},goal={read:true},planner=new GOAPPlanner();
  for(const action of descriptors)planner.registerAction(action);
  const plan=planner.plan(WorldState.from(current),WorldState.from(goal));
  const savedPlan=JSON.parse(JSON.stringify({current,goal,descriptors,ids:plan.map(a=>a.id)})),restoredPlanner=new GOAPPlanner();
  for(const action of savedPlan.descriptors)restoredPlanner.registerAction(action);
  const restoredPlan=restoredPlanner.plan(WorldState.from(savedPlan.current),WorldState.from(savedPlan.goal));
  const impossible=planner.plan(WorldState.from({atDesk:false,read:false}),WorldState.from({builtHouse:true}));
  const expectedHours=Array.from({length:49},(_,i)=>({hour:(24+i)%24,day:Math.floor((24+i)/24)+1}));
  const checks={ordinary:ordinary.clock.totalGameSeconds===23.5*3600,midnight:midnight.hours.length===2&&midnight.hours[0].hour===0&&midnight.hours[0].day===2,multiDay:JSON.stringify(multi.hours)===JSON.stringify(expectedHours),restore:JSON.stringify(multi)===JSON.stringify(resumed),idempotent:JSON.stringify(multi)===JSON.stringify(repeated),goap:JSON.stringify(plan?.map(a=>a.id))===JSON.stringify(['walk-to-desk','read-book']),goapRestore:JSON.stringify(restoredPlan?.map(a=>a.id))===JSON.stringify(savedPlan.ids),unreachable:impossible===null};
  if(Object.values(checks).some(value=>!value))throw Error('规则兼容验证失败：'+JSON.stringify(checks));
  return {checks,modelRequests:0,raw48HourCallbacks:directHours.length,expected48HourCallbacks:48,adapted49HourCallbacks:multi.hours.length,plan:plan.map(a=>a.id),clock:multi.clock};
}
export function command(data,operation,args={}){
  if(operation==='fixture')return {data:fixture()};
  if(operation==='advance')return advance(data,args);
  if(operation==='snapshot')return snapshot(data);
  if(operation==='rules')return ruleCompatibility();
  throw Error('未知实验操作');
}
