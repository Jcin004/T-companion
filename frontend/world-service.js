// SPDX-License-Identifier: AGPL-3.0-only
import {ensureWorld,validateWorld,applyWorldCommand,worldSource,sceneSnapshot,copy} from './world-core.js';
import {ROOM,FURNITURE} from './world-map.js';
export class WorldModule {
  constructor(host){this.host=host;}
  async api(path,method,body={}){
    const url=new URL(path,'https://local'),parts=url.pathname.split('/').filter(Boolean);
    if(method==='GET'){
      const d=this.host.data,w=ensureWorld(d);
      if(parts[1]==='sources'&&!parts[2]){
        const owner=url.searchParams.get('owner');
        if(!d.characters.some(c=>c.id===owner))throw Error('请选择角色');
        return copy(w.events.filter(e=>e.observations.some(o=>o.owner_id===owner)).slice(-300).map(e=>({...e,source_type:'world_event',event_id:e.id,role:'world'})));
      }
      if(parts[1]==='sources'&&parts[2])return worldSource(d,decodeURIComponent(parts[2]),url.searchParams.get('owner'));
      if(parts.length!==1)throw Error('不支持的世界查询');
      return copy({state:w,room:ROOM,furniture:FURNITURE,residents:w.residents.map(id=>d.characters.find(c=>c.id===id))});
    }
    if(method!=='POST')throw Error('世界操作需要 POST');
    if(this.host.active)throw Error('请等待当前对话完成再操作世界');
    return this.host.transact(d=>{
      if(this.host.active)throw Error('请等待当前对话完成再操作世界');
      const w=ensureWorld(d);let result;
      if(parts[1]==='setup'){
        if(w.residents.length)throw Error('本场景已经绑定人物');
        if(!Array.isArray(body.character_ids)||body.character_ids.length!==2||new Set(body.character_ids).size!==2||body.character_ids.some(id=>!d.characters.some(c=>c.id===id)))throw Error('请从名册选择两个不同的人物');
        w.residents=copy(body.character_ids);w.positions[w.residents[0]]={x:4,y:6};w.positions[w.residents[1]]={x:9,y:10};result={ok:true};
      }else if(parts[1]==='commands'){
        if(w.residents.length!==2)throw Error('请先选择两位居民');
        result=applyWorldCommand(d,body);
      }else if(parts[1]==='dialogue'){
        if(!w.residents.includes(body.character_id))throw Error('人物不在场景中');
        let s=d.sessions.find(s=>s.character_id===body.character_id&&s.mode==='world'&&s.room_id===ROOM.id);
        if(!s){const online=d.sessions.find(s=>s.character_id===body.character_id&&s.mode!=='world');s={id:'scene_'+body.character_id,character_id:body.character_id,mode:'world',room_id:ROOM.id,title:'暖木小屋',note:'',background:'#f5e4ce',voice:online?.voice||'',history_limit:online?.history_limit??null,chat_style:copy(online?.chat_style||{}),created_at:new Date().toISOString()};d.sessions.push(s);}
        sceneSnapshot(d,s.id);result=copy(s);
      }else throw Error('不支持的世界操作');
      validateWorld(d);return result;
    });
  }
}
