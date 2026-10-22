// SPDX-License-Identifier: AGPL-3.0-only
// Only completed scene replies may propose a bounded world action.
import {FURNITURE,collision,distance,ROOM} from './world-map.js';
import {findPath} from './world-pathfinding.js';
const marker=/\[世界行动:([^\n]+)\]/g;
export const sceneText=text=>String(text).replace(marker,'').replace(/\[世界行动:[\s\S]*$/,'').trim();
export function sceneActionCandidate(text){
  const matches=[...String(text).matchAll(marker)];
  if(!matches.length){if(String(text).includes('[世界行动:'))throw Error('世界动作候选不完整');return null;}
  if(matches.length!==1)throw Error('每轮只支持一个世界动作');
  let value;try{value=JSON.parse(matches[0][1]);}catch{throw Error('世界动作格式错误');}
  if(!value||value.type!=='interact'||typeof value.target_id!=='string'||Object.keys(value).some(k=>!['type','target_id'].includes(k)))throw Error('只允许指定地点交互，不允许替其他人行动');
  return value;
}
export function sceneActionSteps(data,owner,action){
  const w=data.world,p=w.positions[owner],f=FURNITURE.find(f=>f.id===action.target_id);
  if(!p||!f)throw Error('动作地点或人物不存在');
  const cells=collision(w.positions,owner),spots=[];
  for(let y=3;y<12;y++)for(let x=1;x<11;x++)if(!cells[y*ROOM.width+x]&&Math.min(...Array.from({length:f.w*f.h},(_,i)=>distance({x,y},{x:f.x+i%f.w,y:f.y+Math.floor(i/f.w)})))<=2){
    const route=findPath(cells,ROOM.width,ROOM.height,p.x,p.y,x,y);
    if(route.reachable)spots.push({x,y,route:route.path});
  }
  spots.sort((a,b)=>a.route.length-b.route.length);
  if(!spots.length)throw Error('目前无法走到交互地点');
  return {target:spots[0],place:f};
}
