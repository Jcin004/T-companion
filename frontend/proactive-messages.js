// SPDX-License-Identifier: AGPL-3.0-only
// Chat-owned unsolicited delivery. No user message or synthetic Q/A turn.
import {worldSource} from './world-core.js';
import {isOnlineSession} from './session-mode.js';
export function deliverWorldShare(data,owner,eventId,quote,comment,at){
  const event=worldSource(data,eventId,owner);
  if(typeof quote!=='string'||!quote.trim()||quote.length>500||!event.content.includes(quote)||typeof comment!=='string'||comment.length>300)throw Error('分享缺少有效来源引文');
  const deliveryId='share_'+owner+'_'+event.id;
  const old=data.messages.find(m=>m.delivery_id===deliveryId);if(old)return old.id;
  let session=data.sessions.find(s=>s.character_id===owner&&isOnlineSession(s));
  if(!session){session={id:'life_chat_'+owner,character_id:owner,title:data.characters.find(c=>c.id===owner).name,note:'',voice:'',background:'#eef2f3',created_at:at};data.sessions.push(session);}
  const id=data.messages.reduce((n,m)=>Math.max(n,m.id),0)+1;
  data.messages.push({id,session_id:session.id,role:'assistant',content:'想和你分享：'+quote+(comment?'\n我的想法：'+comment:''),created_at:at,origin:'world_share',source_event_id:event.id,source_owner_id:owner,delivery_id:deliveryId});return id;
}
export function validateProactiveMessages(data){
  const ids=new Set();
  for(const m of data.messages)if(m.origin==='world_share'&&!m.deleted_at){
    worldSource(data,m.source_event_id,m.source_owner_id);
    const s=data.sessions.find(s=>s.id===m.session_id);
    if(m.role!=='assistant'||s?.character_id!==m.source_owner_id||!isOnlineSession(s)||typeof m.delivery_id!=='string'||ids.has(m.delivery_id))throw Error('主动分享来源或投递标识错误');
    ids.add(m.delivery_id);
  }
}
