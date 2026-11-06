// A-Life schedules/GOAP execute accepted plans; world commands own all facts.
import {Clock,GOAPPlanner,WorldState,Schedule} from './life-rules-vendor.js';
import {applyWorldCommand,appendWorldEvent,copy} from './world-core.js';
import {locationOf,furnitureFor,distance} from './world-map.js';
import {sceneActionSteps} from './world-scene-actions.js';

const MINUTE=60000,DAY=86400000;
export function wakeResident(data,owner,reason,key,extra={}){
  const life=data.world.life;
  if(life.wakeups.some(w=>w.key===key))return;
  life.wakeups.push({owner_id:owner,reason,key,state:'pending',...copy(extra)});
}
export function planValue(data,owner,value){
  if(!data.world.residents.includes(owner)||!value||!Array.isArray(value.steps)||value.steps.length<1||value.steps.length>12)throw Error('计划需要 1–12 项有限活动');
  let duration=0;
  const steps=value.steps.map(step=>{
    const room=data.world.locations.find(r=>r.id===step.location_id);
    if(!room||!['read','rest','sleep','walk','water','wait'].includes(step.activity)||!Number.isInteger(step.duration_minutes)||step.duration_minutes<1||step.duration_minutes>360)throw Error('计划地点、活动或时长无效');
    const target=step.activity==='read'?'desk':step.activity==='water'?'plant':null;
    if(target&&!furnitureFor(room.id).some(f=>f.id===target))throw Error('该地点没有活动所需物品');
    duration+=step.duration_minutes;
    return {location_id:room.id,activity:step.activity,duration_minutes:step.duration_minutes,...(target?{target_id:target}:{})};
  });
  if(duration>1440)throw Error('一次计划不能超过一天');
  return {title:typeof value.title==='string'?value.title.slice(0,160):'生活计划',steps};
}
const label={read:'读书',rest:'休息',sleep:'睡眠',walk:'散步',water:'照看盆栽',wait:'停留'};
function fact(data,owner,key,text,simulatedAt,actualAt,source={}){
  const w=data.world,p=w.positions[owner];w.tick++;
  const observers=w.residents.filter(id=>id===owner||distance(p,w.positions[id])<=3).map(id=>({owner_id:id,kind:'witness',position:copy(w.positions[id])}));
  const e=appendWorldEvent(w,{request_id:key,type:'activity'},data.characters.find(c=>c.id===owner).name+text,p,[owner],observers,{type:'life_activity',...source},actualAt);
  w.events.find(row=>row.id===e.id).simulated_at=simulatedAt;return e;
}
export function acceptResidentPlan(data,owner,value,id,at){
  const plan=planValue(data,owner,value),l=data.world.life,old=l.schedules[owner];
  if(typeof id!=='string'||!/^[-\w]{1,80}$/.test(id))throw Error('计划缺少稳定请求标识');
  if(!l.plan_receipts)l.plan_receipts={};const fingerprint=JSON.stringify({owner,plan});
  if(l.plan_receipts[id]){if(l.plan_receipts[id].fingerprint!==fingerprint)throw Error('计划任务标识与原内容不匹配');return copy(l.plan_receipts[id].plan);}
  if(old&&l.activities[owner])fact(data,owner,'interrupt_'+id,'调整了原来的活动。',at,at);
  for(const [key,held] of Object.entries(l.resources))if(held===owner)delete l.resources[key];
  delete l.activities[owner];
  l.schedules[owner]={...plan,id,index:0,state:'ready',accepted_at:at,next_at:Date.parse(at)<Date.parse(l.simulated_at)?l.simulated_at:at};
  if(!l.owner_revisions)l.owner_revisions={};l.owner_revisions[owner]=(l.owner_revisions[owner]||0)+1;
  l.plans[owner]=plan.title;delete l.plan_errors[owner];
  l.plan_receipts[id]={fingerprint,plan:copy(l.schedules[owner])};
  return copy(l.schedules[owner]);
}
function worldAction(data,owner,key,command,simulatedAt,actualAt){
  const e=applyWorldCommand(data,{request_id:key,actor_id:owner,...command},{sourceType:'resident_action',at:actualAt,ai:true});
  data.world.events.find(row=>row.id===e.id).simulated_at=simulatedAt;return e;
}
function queueEncounters(data,owner,eventId){
  const w=data.world,l=w.life;
  for(const id of w.residents)if(id!==owner&&distance(w.positions[id],w.positions[owner])<=3){
    const pair=[id,owner].sort().join('_'),day=l.simulated_at.slice(0,10),key='encounter_'+pair+'_'+day;
    wakeResident(data,owner,'encounter',key+'_'+owner,{event_ids:[eventId]});
    wakeResident(data,id,'encounter',key+'_'+id,{event_ids:[eventId]});
  }
}
function startStep(data,owner,at,actualAt){
  const w=data.world,l=w.life,plan=l.schedules[owner],step=plan.steps[plan.index],prefix='plan_'+plan.id+'_'+plan.index;
  if(!step){plan.state='complete';delete l.activities[owner];wakeResident(data,owner,'plan_complete','complete_'+plan.id);return;}
  const schedule=new Schedule(plan.steps.map(s=>({zoneId:s.location_id,position:{x:5,y:8},durationMs:s.duration_minutes*MINUTE})));
  for(let i=0;i<plan.index;i++)schedule.advance();
  const waypoint=schedule.getCurrentWaypoint();
  const here=locationOf(w.positions[owner]);
  if(here!==waypoint.zoneId){
    fact(data,owner,prefix+'_depart','准备前往'+w.locations.find(r=>r.id===waypoint.zoneId).name+'。',at,actualAt);
    l.activities[owner]={phase:'travel',plan_id:plan.id,index:plan.index,ends_at:new Date(Date.parse(at)+2*MINUTE).toISOString()};plan.state='running';return;
  }
  const resource=step.target_id?step.location_id+':'+step.target_id:null;
  if(resource&&l.resources[resource]&&l.resources[resource]!==owner){
    plan.state='blocked';l.activities[owner]={phase:'blocked',plan_id:plan.id,index:plan.index,ends_at:new Date(Date.parse(at)+5*MINUTE).toISOString()};
    wakeResident(data,owner,'blocked','blocked_'+plan.id+'_'+plan.index);return;
  }
  if(resource)l.resources[resource]=owner;
  const planner=new GOAPPlanner();
  planner.registerAction({id:'approach',cost:1,preconditions:{near:false},effects:{near:true}});
  planner.registerAction({id:'activity',cost:1,preconditions:{near:true},effects:{started:true}});
  const actions=planner.plan(WorldState.from({near:!step.target_id,started:false}),WorldState.from({started:true}));
  if(!actions)throw Error('无法规划当前活动');
  if(actions.some(a=>a.id==='approach')){
    try{const {target}=sceneActionSteps(data,owner,{target_id:step.target_id});if(target.route.length>1)worldAction(data,owner,prefix+'_approach',{type:'move',target:{x:target.x,y:target.y}},at,actualAt);}
    catch(error){if(resource)delete l.resources[resource];plan.state='blocked';l.activities[owner]={phase:'blocked',plan_id:plan.id,index:plan.index,ends_at:new Date(Date.parse(at)+5*MINUTE).toISOString()};wakeResident(data,owner,'blocked','blocked_'+plan.id+'_'+plan.index);return;}
  }
  const event=fact(data,owner,prefix+'_start','开始'+label[step.activity]+'。',at,actualAt);
  l.activities[owner]={phase:'activity',plan_id:plan.id,index:plan.index,activity:step.activity,started_at:at,ends_at:new Date(Date.parse(at)+waypoint.durationMs).toISOString(),resource};
  plan.state='running';queueEncounters(data,owner,event.id);
}
function finishStep(data,owner,at,actualAt){
  const w=data.world,l=w.life,a=l.activities[owner],plan=l.schedules[owner],step=plan.steps[plan.index],prefix='plan_'+plan.id+'_'+plan.index;
  if(a.phase==='travel'){
    const event=worldAction(data,owner,prefix+'_arrive',{type:'travel',location_id:step.location_id},at,actualAt);
    delete l.activities[owner];plan.state='ready';plan.next_at=at;queueEncounters(data,owner,event.id);return;
  }
  if(a.phase==='blocked'){delete l.activities[owner];plan.state='ready';plan.next_at=at;return;}
  try{
    if(locationOf(w.positions[owner])!==step.location_id)throw Error('活动地点已改变');
    if(step.target_id)worldAction(data,owner,prefix+'_use',{type:'interact',target_id:step.target_id},at,actualAt);
  }catch(error){
    if(a.resource)delete l.resources[a.resource];delete l.activities[owner];plan.state='blocked';
    const event=fact(data,owner,prefix+'_interrupted','原来的活动受阻，等待重新安排。',at,actualAt);
    wakeResident(data,owner,'interrupted','interrupted_'+prefix,{event_ids:[event.id]});return;
  }
  const event=fact(data,owner,prefix+'_finish','完成了'+label[step.activity]+'。',at,actualAt);
  if(a.resource)delete l.resources[a.resource];delete l.activities[owner];plan.index++;plan.next_at=at;plan.state='ready';
  if(step.activity==='water')wakeResident(data,owner,'activity_complete','finished_'+prefix,{event_ids:[event.id]});
}
export function advanceResidentRules(data,targetAt,actualAt=targetAt){
  const l=data.world.life;if(!l.settings.enabled)return {advanced:false};
  const target=Date.parse(targetAt),cursor=Date.parse(l.simulated_at||targetAt);
  if(!Number.isFinite(target)||!Number.isFinite(cursor))throw Error('世界时间无效');
  if(target<cursor)return {advanced:false,clock_behind:true,simulated_at:l.simulated_at};
  const end=Math.min(target,cursor+DAY);
  let iterations=0;
  while(true){
    const due=data.world.residents.map(owner=>({owner,at:l.activities[owner]?.ends_at||(l.schedules[owner]?.state==='ready'?l.schedules[owner].next_at:null)})).filter(r=>r.at&&Date.parse(r.at)<=end).sort((a,b)=>a.at.localeCompare(b.at)||a.owner.localeCompare(b.owner))[0];
    if(!due)break;
    if(++iterations>2000)throw Error('本批活动超过上限，请分段继续补算');
    l.simulated_at=due.at;
    if(l.activities[due.owner])finishStep(data,due.owner,due.at,actualAt);else startStep(data,due.owner,due.at,actualAt);
  }
  const clock=Clock.fromState(l.clock);let delta=end-cursor;
  while(delta>0){const slice=Math.min(delta,3600000);clock.update(slice);delta-=slice;}
  l.clock=clock.serialize();l.simulated_at=new Date(end).toISOString();l.catchup_target=targetAt;l.catching_up=end<target;
  return {advanced:end>cursor,simulated_at:l.simulated_at,catching_up:l.catching_up,activities:iterations};
}
