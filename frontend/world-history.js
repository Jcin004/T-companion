// SPDX-License-Identifier: AGPL-3.0-only
// User's world-wide archive. Reading it never changes any resident's knowledge.
import {removeSourceMemories} from './memory-source-deletion.js';
import {validateMemory} from './memory-core.js';
import {validateWorld,copy} from './world-core.js';
import {validateProactiveMessages} from './proactive-messages.js';
function entries(data){
  const sessions=new Map(data.sessions.filter(s=>s.mode==='world').map(s=>[s.id,s]));
  const rows=data.turns.filter(t=>sessions.has(t.session_id)&&!t.deleted_at).map(t=>{
    const owner=sessions.get(t.session_id).character_id;
    return {id:'turn_'+t.request_id,created_at:data.messages.find(m=>m.id===t.user_id)?.created_at,state:t.state,participants:['user',owner],messages:[t.user_id,t.assistant_id].map(id=>data.messages.find(m=>m.id===id)).filter(m=>m&&!m.deleted_at).map(m=>({...copy(m),speaker_id:m.role==='user'?'user':owner,chat_style:t.chat_style,presentation:t.presentation})),source_event_ids:(data.world?.events||[]).filter(e=>!e.deleted_at&&e.source.type==='completed_dialogue'&&e.source.request_id===t.request_id).map(e=>e.id)};
  });
  for(const e of data.world?.events||[])if(!e.deleted_at&&e.source.type==='resident_dialogue')rows.push({id:'event_'+e.id,created_at:e.created_at,state:'complete',participants:copy(e.participants),messages:[{id:e.id,role:'assistant',speaker_id:e.source.speaker_id,content:e.content,created_at:e.created_at,presentation:e.presentation}],source_event_ids:[e.id]});
  return rows;
}
const compare=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);
export function worldHistory(data,query){
  const owner=query.get('owner')||'',q=(query.get('q')||'').toLocaleLowerCase(),cursor=query.get('before');
  if(q.length>200||owner&&owner!=='user'&&!data.characters.some(c=>c.id===owner))throw Error('对话搜索或人物筛选无效');
  let rows=entries(data).filter(e=>(!owner||e.participants.includes(owner))&&(!q||e.messages.some(m=>m.content.toLocaleLowerCase().includes(q)))).sort(compare);
  if(cursor){const split=cursor.indexOf('|');if(split<0)throw Error('对话游标无效');const pivot={created_at:cursor.slice(0,split),id:cursor.slice(split+1)};rows=rows.filter(e=>compare(e,pivot)>0);}
  const items=rows.slice(0,40).map(e=>({...e,linked_memories:(data.memory?.events||[]).filter(m=>m.evidence.some(ref=>ref.source_type==='world_event'?e.source_event_ids.includes(ref.event_id):e.messages.some(message=>message.id===ref.message_id))).map(m=>({id:m.id,owner_id:m.owner_id,title:m.title}))})),last=items[items.length-1];return {items,has_before:rows.length>40,next_cursor:last?last.created_at+'|'+last.id:null};
}
export function deleteWorldDialogue(data,id,at=new Date().toISOString()){
  let turns=[],events=[];
  if(id.startsWith('turn_')){const t=data.turns.find(t=>t.request_id===id.slice(5)&&data.sessions.some(s=>s.id===t.session_id&&s.mode==='world'));if(!t)throw Error('场景对话不存在');turns=[t];events=data.world.events.filter(e=>e.source.type==='completed_dialogue'&&e.source.request_id===t.request_id);}
  else if(id.startsWith('event_')){const e=data.world.events.find(e=>e.id===id.slice(6)&&e.source.type==='resident_dialogue');if(!e)throw Error('居民对话不存在');events=[e];}
  else throw Error('对话标识无效');
  if(turns.every(t=>t.deleted_at)&&events.every(e=>e.deleted_at))return {already_deleted:true,memories:0,summaries:0};
  const eventIds=new Set(events.map(e=>e.id)),messageIds=new Set(turns.flatMap(t=>[t.user_id,t.assistant_id]).filter(Boolean));
  for(const m of data.messages)if(m.origin==='world_share'&&eventIds.has(m.source_event_id))messageIds.add(m.id);
  const result=removeSourceMemories(data,[...messageIds],[...eventIds]);
  // Keep IDs and retry receipts, while removing the actual deleted words.
  for(const t of turns){t.deleted_at=at;t.error='';}
  for(const m of data.messages)if(messageIds.has(m.id)){m.content='';m.deleted_at=at;}
  for(const e of events){e.content='（已删除的对话）';e.deleted_at=at;}
  const life=data.world.life;
  if(life){
    for(const j of life.jobs){if(eventIds.has(j.received_id)||(j.event_ids||[]).some(e=>eventIds.has(e))||[...eventIds].some(id=>JSON.stringify(j.prompt||'').includes(id))){
      if(!['applied','skipped','failed'].includes(j.state)){j.state='skipped';j.stopped_at=at;delete j.prompt;delete j.result;const run=life.runs.find(r=>r.id===j.run_id);if(run?.state==='running')run.state='paused';}
    }}
    for(const r of life.runs)r.queue=(r.queue||[]).filter(j=>!eventIds.has(j.received_id)&&!(j.event_ids||[]).some(e=>eventIds.has(e)));
    for(const owner of new Set(events.flatMap(e=>[...e.participants,...e.observations.map(o=>o.owner_id)]).filter(id=>id!=='user')))delete life.plans[owner];
  }
  validateWorld(data);validateMemory(data);validateProactiveMessages(data);return {...result,already_deleted:false};
}
export class WorldHistoryModule{
  constructor(host){this.host=host;}
  async api(path,method){
    const url=new URL(path,'https://local');if(method==='GET')return copy(worldHistory(this.host.data,url.searchParams));
    if(method!=='DELETE')throw Error('对话记录支持查询或删除');
    if(this.host.active||this.host.memoryModule.saving)throw Error('请等待当前对话或记忆操作完成');
    const id=decodeURIComponent(url.pathname.split('/')[2]||'');
    return this.host.transact(d=>{if(this.host.active||this.host.memoryModule.saving)throw Error('请等待当前对话或记忆操作完成');return deleteWorldDialogue(d,id);});
  }
}
