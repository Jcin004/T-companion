// SPDX-License-Identifier: AGPL-3.0-only
import {ensureWorld,validateWorld,applyWorldCommand,worldSource,sceneSnapshot,copy,faceEachOther} from './world-core.js';
import {ROOM,FURNITURE,locationOf,furnitureFor} from './world-map.js';
import {looksFor} from './character-looks.js';
import {isOnlineSession} from './session-mode.js';
import {sourceWorldEvents} from './memory-evidence.js';
export class WorldModule {
  constructor(host){this.host=host;}
  async api(path,method,body={}){
    const url=new URL(path,'https://local'),parts=url.pathname.split('/').filter(Boolean);
    if(method==='GET'){
      const d=this.host.data,w=ensureWorld(d);
      if(parts[1]==='sources'&&!parts[2]){
        const owner=url.searchParams.get('owner');
        if(!d.characters.some(c=>c.id===owner))throw Error('请选择角色');
        return copy(sourceWorldEvents(d,owner).slice(-300));
      }
      if(parts[1]==='sources'&&parts[2])return worldSource(d,decodeURIComponent(parts[2]),url.searchParams.get('owner'));
      if(parts.length!==1)throw Error('不支持的世界查询');
      const locationId=url.searchParams.get('location')||locationOf(w.positions.user),room=w.locations.find(r=>r.id===locationId);
      if(!room)throw Error('地点不存在');
      return copy({state:w,room,furniture:furnitureFor(locationId),residents:w.residents.map(id=>d.characters.find(c=>c.id===id)),looks:looksFor(d,['user',...w.residents])});
    }
    if(method!=='POST')throw Error('世界操作需要 POST');
    if(this.host.active)throw Error('请等待当前对话完成再操作世界');
    const result=await this.host.transact(d=>{
      if(this.host.active)throw Error('请等待当前对话完成再操作世界');
      const w=ensureWorld(d);let result;
      if(parts[1]==='setup'){
        if(!Array.isArray(body.character_ids)||body.character_ids.length<2||body.character_ids.length>3||new Set(body.character_ids).size!==body.character_ids.length||body.character_ids.some(id=>!d.characters.some(c=>c.id===id)))throw Error('请从名册选择两到三位不同人物');
        if(w.residents.some(id=>!body.character_ids.includes(id)))throw Error('不能在入驻时移除原有居民');
        const spots=[{x:4,y:6},{x:9,y:10},{x:7,y:8}];
        for(const id of body.character_ids)if(!w.residents.includes(id)){const used=new Set(Object.values(w.positions).filter(p=>locationOf(p)===ROOM.id).map(p=>p.x+','+p.y));const p=spots.find(p=>!used.has(p.x+','+p.y));if(!p)throw Error('入驻位置被占用，请先移动人物');w.positions[id]=copy(p);w.facing[id]='down';w.residents.push(id);}
        result={ok:true};
      }else if(parts[1]==='commands'){
        if(w.residents.length<2)throw Error('请先选择两位居民');
        result=applyWorldCommand(d,body);
      }else if(parts[1]==='dialogue'){
        if(!w.residents.includes(body.character_id))throw Error('人物不在场景中');
        const roomId=locationOf(w.positions[body.character_id]);
        let s=d.sessions.find(s=>s.character_id===body.character_id&&s.mode==='world'&&s.room_id===roomId);
        if(!s){const online=d.sessions.find(s=>s.character_id===body.character_id&&isOnlineSession(s));s={id:'scene_'+body.character_id+(roomId===ROOM.id?'':'_'+roomId),character_id:body.character_id,mode:'world',room_id:roomId,title:w.locations.find(r=>r.id===roomId).name,note:'',background:'#f5e4ce',voice:online?.voice||'',history_limit:online?.history_limit??null,chat_style:copy(online?.chat_style||{}),created_at:new Date().toISOString()};d.sessions.push(s);}
        sceneSnapshot(d,s.id);faceEachOther(w,'user',body.character_id);result=copy(s);
      }else throw Error('不支持的世界操作');
      validateWorld(d);return result;
    });
    if(parts[1]==='commands'&&url.searchParams.get('view')==='world')return {event:result,world:await this.api('/world','GET')};
    return result;
  }
}
