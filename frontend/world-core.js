// SPDX-License-Identifier: AGPL-3.0-only
// World facts/observations only. Identity, interpretation and model work live elsewhere.
import {ROOM,FURNITURE,collision,distance} from './world-map.js';
import {findPath} from './world-pathfinding.js';
export const copy=value=>JSON.parse(JSON.stringify(value));
export function ensureWorld(data){
  if(data.world===undefined)data.world={version:1,room_id:ROOM.id,tick:0,lamp:true,residents:[],positions:{user:{x:5,y:8}},events:[]};
  return data.world;
}
const point=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>0&&p.x<11&&p.y>=3&&p.y<12&&!collision()[p.y*12+p.x];
export function validateWorld(data){
  const w=ensureWorld(data),owners=new Set(data.characters.map(c=>c.id));
  if(w.version!==1||w.room_id!==ROOM.id||!Number.isSafeInteger(w.tick)||w.tick<0||typeof w.lamp!=='boolean'||!Array.isArray(w.residents)||![0,2].includes(w.residents.length)||new Set(w.residents).size!==w.residents.length||w.residents.some(id=>!owners.has(id)||id==='user')||!w.positions||!Array.isArray(w.events)||w.events.length>20000)throw Error('世界备份格式错误');
  const actors=['user',...w.residents];
  if(Object.keys(w.positions).length!==actors.length||actors.some(id=>!point(w.positions[id]))||new Set(Object.values(w.positions).map(p=>p.x+','+p.y)).size!==actors.length)throw Error('世界位置无效或重叠');
  const ids=new Set(),requests=new Set();
  for(const e of w.events){
    if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.request_id!=='string'||requests.has(e.request_id)||typeof e.fingerprint!=='string'||!Number.isFinite(Date.parse(e.created_at))||e.location!==ROOM.id||!point(e.position)||typeof e.content!=='string'||!e.content||e.content.length>210000||!Array.isArray(e.participants)||e.participants.some(id=>id!=='user'&&!owners.has(id))||!Array.isArray(e.observations)||new Set(e.observations.map(o=>o.owner_id)).size!==e.observations.length||e.observations.some(o=>!owners.has(o.owner_id)||!['witness','heard'].includes(o.kind)||!point(o.position))||!['user_command','completed_dialogue','resident_action','resident_dialogue'].includes(e.source?.type))throw Error('世界事件或知情范围格式错误');
    if(e.source.type==='completed_dialogue'){
      const t=data.turns.find(t=>t.request_id===e.source.request_id&&t.state==='complete');
      if(!t||t.user_id!==e.source.message_ids?.[0]||t.assistant_id!==e.source.message_ids?.[1])throw Error('世界对话来源未完成');
    }
    ids.add(e.id);requests.add(e.request_id);
  }
  for(const s of data.sessions)if(s.mode==='world'&&(s.room_id!==ROOM.id||!owners.has(s.character_id)))throw Error('场景会话引用错误');
  for(const t of data.turns)if(data.sessions.find(s=>s.id===t.session_id)?.mode==='world'){
    const owner=data.sessions.find(s=>s.id===t.session_id).character_id,scene=t.scene;
    if(!scene||scene.mode!=='world'||scene.room_id!==ROOM.id||!point(scene.position)||!Array.isArray(scene.nearby)||!scene.nearby.some(c=>c.id===owner&&point(c.position))||!Array.isArray(scene.facts)||!Number.isSafeInteger(scene.tick)||scene.tick<0)throw Error('场景对话快照无效');
  }
  return w;
}
export function worldSource(data,id,owner){
  const event=data.world?.events.find(e=>e.id===id);
  if(!event||!event.observations.some(o=>o.owner_id===owner))throw Error('人物没有此事件的知情依据');
  return copy(event);
}
export function sceneSnapshot(data,sid){
  const s=data.sessions.find(s=>s.id===sid);
  if(s?.mode!=='world')return null;
  const w=ensureWorld(data),p=w.positions[s.character_id];
  if(!w.residents.includes(s.character_id)||distance(w.positions.user,p)>3)throw Error('请走近人物后再对话');
  return {mode:'world',location:ROOM.name,room_id:ROOM.id,tick:w.tick,position:copy(w.positions.user),nearby:w.residents.filter(id=>distance(w.positions.user,w.positions[id])<=3).map(id=>({id,name:data.characters.find(c=>c.id===id).name,position:copy(w.positions[id])})),facts:['用户与当前交谈人物在同一房间、近处交流。','房间有书架、书桌、床铺、盆栽和窗帘。',w.lamp?'台灯亮着。':'台灯熄灭。'],dialogue:'仅交谈双方听到本轮对话。旁白和人物陈述不自动改变世界事实。'};
}
export function appendWorldEvent(w,command,content,position,participants,observations,source,at=new Date().toISOString()){
  if(w.events.length>=20000)throw Error('世界事件已达容量，请先导出备份');
  const event={id:'world_'+command.request_id,request_id:command.request_id,fingerprint:JSON.stringify(command),created_at:at,tick:w.tick,location:ROOM.id,position:copy(position),participants,content,source,observations};
  w.events.push(event);return copy(event);
}
export function applyWorldCommand(data,input,options={}){
  const w=ensureWorld(data),command=copy(input||{});
  if(typeof command.request_id!=='string'||!/^[-\w]{1,100}$/.test(command.request_id))throw Error('世界操作缺少稳定请求标识');
  if(command.request_id.startsWith('dialogue_'))throw Error('世界操作请求标识使用了保留前缀');
  const existing=w.events.find(e=>e.request_id===command.request_id);
  if(existing){if(existing.fingerprint!==JSON.stringify(command))throw Error('世界请求标识与原操作不匹配');return copy(existing);}
  const actor=command.actor_id||'user',p=w.positions[actor];
  if(!p)throw Error('人物不在场景中');
  const witnesses=new Map(),observe=at=>{
    for(const id of w.residents)if(id===actor||distance(w.positions[id],at)<=3)witnesses.set(id,{owner_id:id,kind:'witness',position:copy(w.positions[id])});
  };
  let content;
  const name=actor==='user'?'用户':data.characters.find(c=>c.id===actor).name;
  if(command.type==='move'){
    if(!point(command.target))throw Error('那里是墙壁或家具，请点地板');
    const result=findPath(collision(w.positions,actor),ROOM.width,ROOM.height,p.x,p.y,command.target.x,command.target.y);
    if(!result.reachable||result.path.length<2)throw Error('无法走到那里，或已经在这里');
    for(const step of result.path){w.positions[actor]=copy(step);observe(step);}
    content=name+'从 ('+p.x+','+p.y+') 走到 ('+command.target.x+','+command.target.y+')。';
  }else if(command.type==='interact'){
    const f=FURNITURE.find(f=>f.id===command.target_id);
    if(!f||Math.min(...Array.from({length:f.w*f.h},(_,i)=>distance(p,{x:f.x+i%f.w,y:f.y+Math.floor(i/f.w)})))>2)throw Error('请先走近这个地点');
    observe(p);if(f.id==='lamp')w.lamp=!w.lamp;
    content=name+f.action+(f.id==='lamp'?(w.lamp?'现在灯亮着。':'现在灯熄灭。'):'');
  }else if(command.type==='advance'){
    observe(p);content=name+'在暖木小屋停留了片刻。';
  }else throw Error('不支持的世界命令');
  w.tick++;
  return appendWorldEvent(w,command,content,w.positions[actor],actor==='user'?['user']:[actor],[...witnesses.values()],{type:options.sourceType||'user_command',command:copy(command),...(options.jobId?{job_id:options.jobId}:{})},options.at);
}
export function completeWorldDialogue(data,turn){
  const s=data.sessions.find(s=>s.id===turn.session_id);
  if(s?.mode!=='world'||data.world.events.some(e=>e.request_id==='dialogue_'+turn.request_id))return;
  const w=data.world,u=data.messages.find(m=>m.id===turn.user_id),a=data.messages.find(m=>m.id===turn.assistant_id);
  const command={request_id:'dialogue_'+turn.request_id,type:'dialogue'};
  w.tick++;
  appendWorldEvent(w,command,'用户说：'+u.content+'\n'+data.characters.find(c=>c.id===s.character_id).name+'说：'+a.content,turn.scene.position,['user',s.character_id],[{owner_id:s.character_id,kind:'heard',position:turn.scene.nearby.find(c=>c.id===s.character_id).position}],{type:'completed_dialogue',request_id:turn.request_id,message_ids:[u.id,a.id]});
}
