// SPDX-License-Identifier: AGPL-3.0-only
import {memoryRoom} from './memory-rooms.js';

export const cognitionOptions=Object.freeze({
 windowsill:Object.freeze([{id:'active',label:'继续期待'},{id:'fulfilled',label:'已达成'},{id:'disappointed',label:'已落空'}]),
 attic:Object.freeze([{id:'open',label:'仍未解决'},{id:'resolved',label:'已解决'}])
});
export function cognitionStatus(event){
 const status=event?.cognition_state?.status;
 if(event?.room==='windowsill')return cognitionOptions.windowsill.some(option=>option.id===status)?status:'active';
 if(event?.room==='attic')return cognitionOptions.attic.some(option=>option.id===status)?status:'open';
 return '';
}
export function cognitionLabel(status){
 for(const options of Object.values(cognitionOptions)){const found=options.find(option=>option.id===status);if(found)return found.label;}
 return status||'未设置';
}
export function cognitionLocked(event){
 return event?.cognition_state?.locked===true||event?.cognition_state?.origin==='manual'&&event.cognition_state.locked===undefined;
}
export function cognitionTarget(event){
 const status=cognitionStatus(event);
 return event?.active===true&&!cognitionLocked(event)&&
  (event.room==='windowsill'&&status==='active'||event.room==='attic'&&status==='open');
}
export function cognitionTransitionAllowed(room,from,to){
 if(room==='windowsill')return from==='active'&&['fulfilled','disappointed'].includes(to);
 if(room==='attic')return from==='open'&&to==='resolved';
 return false;
}
export function cognitionActionStatus(room,action){
 if(room==='attic'&&action==='resolve')return 'resolved';
 if(room==='windowsill'&&action==='fulfill')return 'fulfilled';
 if(room==='windowsill'&&action==='disappoint')return 'disappointed';
 return '';
}
export function applyManualCognitionStatus(event,status,room,locked,at=new Date().toISOString()){
 if(status===undefined)return;
 const options=cognitionOptions[room];
 if(!options||!options.some(option=>option.id===status))throw Error('认知状态与记忆房间不匹配');
 const previousLock=cognitionLocked(event),nextLock=locked===undefined?previousLock:locked===true,validStored=!event.cognition_state||options.some(option=>option.id===event.cognition_state.status);
 if(!validStored||cognitionStatus(event)!==status||previousLock!==nextLock)event.cognition_state={status,origin:'manual',locked:nextLock,updated_at:at};
}
const sourceRef=ref=>ref.source_type==='world_event'
 ?{source_type:'world_event',event_id:ref.event_id}
 :{source_type:'chat_message',message_id:ref.message_id};
export function digestionSnapshot(event){
 const room=memoryRoom(event.room);
 return {memory_id:event.id,revision:event.revision??0,title:event.title,content:event.content,kind:event.kind,room,status:['attic','windowsill'].includes(room)?cognitionStatus(event):'',active:event.active,
  manual_cognition:cognitionLocked(event),cognition_target:cognitionTarget(event),source_refs:(event.evidence||[]).map(sourceRef)};
}
export function digestionMaterial(data,owner){
 // Adapted from SullyOS gatherDigestMaterial: review open attic/windowsill items against recent living-room/bedroom episodes.
 // This project reads its existing memory.events store, excludes promise cards as completion evidence, and keeps writes behind review.
 const rows=data.memory.events.filter(event=>event.owner_id===owner&&event.active),recent=(list,count)=>list.slice().sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id))).slice(-count);
 const targetRows=recent(rows.filter(cognitionTarget),8),experienceRows=recent(rows.filter(event=>['living_room','bedroom'].includes(event.room)&&event.kind!=='promise'),12);
 const inputs=[...targetRows,...experienceRows].map(digestionSnapshot),targets=inputs.filter(item=>item.cognition_target);
 const targetIds=new Set(targets.map(item=>item.memory_id));
 for(const item of inputs)item.selected_target=targetIds.has(item.memory_id);
 const experiences=inputs.filter(item=>['living_room','bedroom'].includes(item.room));
 let reason='';
 if(!inputs.length)reason='没有可消化的有效记忆。';
 else if(!targets.length)reason='本次材料里没有尚待处理的问题或期盼。';
 else if(!experiences.length)reason='没有独立的近期经历可用于判断状态；问题和期盼本身不作为完成依据。';
 return {inputs,targets,experiences,can_run:targets.length>0&&experiences.length>0,reason};
}
export function removeDigestionReportsForMemories(memory,memoryIds){
 const removed=new Set(memoryIds),before=memory.digest_reports.length;
 memory.digest_reports=memory.digest_reports.filter(report=>!report.input_snapshots.some(item=>removed.has(item.memory_id)));
 return before-memory.digest_reports.length;
}
export function removeDigestionReportsForSources(memory,messageIds,eventIds){
 const messages=new Set(messageIds),events=new Set(eventIds),before=memory.digest_reports.length;
 memory.digest_reports=memory.digest_reports.filter(report=>!report.input_snapshots.some(item=>item.source_refs.some(ref=>ref.source_type==='world_event'?events.has(ref.event_id):messages.has(ref.message_id))));
 return before-memory.digest_reports.length;
}

const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const boundedText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function validateSnapshot(item){
  if(!object(item)||typeof item.memory_id!=='string'||!item.memory_id||!Number.isSafeInteger(item.revision)||item.revision<0||
  !boundedText(item.title,100)||!boundedText(item.content,6000)||!['statement','promise','interpretation','experience'].includes(item.kind)||
  memoryRoom(item.room)!==item.room||typeof item.active!=='boolean'||typeof item.manual_cognition!=='boolean'||typeof item.cognition_target!=='boolean'||typeof item.selected_target!=='boolean'||!Array.isArray(item.source_refs)||!item.source_refs.length||item.source_refs.length>20)
  throw Error('认知消化材料格式错误');
 if(item.room==='windowsill'&&!['active','fulfilled','disappointed'].includes(item.status)||item.room==='attic'&&!['open','resolved'].includes(item.status)||!['windowsill','attic'].includes(item.room)&&item.status!=='')throw Error('认知消化状态与记忆分类不符');
 if(item.selected_target&&!item.cognition_target||item.cognition_target&&(item.manual_cognition||!item.active||!['windowsill','attic'].includes(item.room)||!['active','open'].includes(item.status)))throw Error('认知消化候选状态错误');
 const refs=new Set();
 for(const ref of item.source_refs){
  if(!object(ref)||!['chat_message','world_event'].includes(ref.source_type))throw Error('认知消化来源格式错误');
  const id=ref.source_type==='world_event'?ref.event_id:ref.message_id;
  if((ref.source_type==='chat_message'&&!Number.isSafeInteger(id))||(ref.source_type==='world_event'&&(typeof id!=='string'&& !Number.isSafeInteger(id))))throw Error('认知消化来源标识错误');
  const key=ref.source_type+':'+id;if(refs.has(key))throw Error('认知消化来源重复');refs.add(key);
 }
}
export function validateDigestion(data,ids){
 const memory=data.memory,owners=new Set(data.characters.map(character=>character.id)),events=new Map(memory.events.map(event=>[event.id,event]));
 if(!Array.isArray(memory.digest_reports)||memory.digest_reports.length>100)throw Error('认知消化报告数量错误');
 for(const report of memory.digest_reports){
  if(!object(report)||typeof report.id!=='string'||!report.id||ids.has(report.id)||!owners.has(report.owner_id)||
   !['pending','complete'].includes(report.status)||!boundedText(report.summary,1200)||typeof report.model_called!=='boolean'||
   typeof report.created_at!=='string'||typeof report.updated_at!=='string'||!Array.isArray(report.input_snapshots)||report.input_snapshots.length>20||
   !Array.isArray(report.proposals)||report.proposals.length>10||JSON.stringify(report).length>200000)throw Error('认知消化报告格式错误');
  ids.add(report.id);
  const snapshotIds=new Set();
  for(const item of report.input_snapshots){
   validateSnapshot(item);
   if(snapshotIds.has(item.memory_id))throw Error('认知消化材料重复');snapshotIds.add(item.memory_id);
   const current=events.get(item.memory_id);if(!current||current.owner_id!==report.owner_id)throw Error('认知消化报告引用了不存在或属于其他人物的记忆');
  }
  const proposalIds=new Set(),targetIds=new Set();
  for(const proposal of report.proposals){
   const target=object(proposal)?report.input_snapshots.find(item=>item.memory_id===proposal.target_memory_id):null;
   if(!object(proposal)||typeof proposal.id!=='string'||!proposal.id||proposalIds.has(proposal.id)||!target||!target.selected_target||targetIds.has(proposal.target_memory_id)||
    !Number.isSafeInteger(proposal.target_revision)||proposal.target_revision!==target.revision||proposal.from_status!==target.status||
    !['keep','resolve','fulfill','disappoint'].includes(proposal.action)||!boundedText(proposal.reason,800)||
    !['low','medium','high'].includes(proposal.confidence)||!Array.isArray(proposal.basis_memory_ids)||proposal.basis_memory_ids.length>4||
    !['kept','pending','accepted','rejected','stale'].includes(proposal.state))throw Error('认知消化建议格式错误');
   proposalIds.add(proposal.id);targetIds.add(proposal.target_memory_id);
   const basis=new Set();
   for(const id of proposal.basis_memory_ids){const item=report.input_snapshots.find(row=>row.memory_id===id);if(!item||id===proposal.target_memory_id||!['living_room','bedroom'].includes(item.room)||item.kind==='promise'||!item.active||basis.has(id))throw Error('认知消化建议依据无效');basis.add(id);}
   const next=cognitionActionStatus(target.room,proposal.action);
   if(proposal.action==='keep'?(proposal.to_status!==proposal.from_status||proposal.state!=='kept'):(next!==proposal.to_status||!cognitionTransitionAllowed(target.room,proposal.from_status,next)||!proposal.basis_memory_ids.length||!['pending','accepted','rejected','stale'].includes(proposal.state)))throw Error('认知消化动作与状态不匹配');
   if(proposal.state==='pending'&&proposal.decided_at!==undefined||proposal.state!=='pending'&&typeof proposal.decided_at!=='string')throw Error('认知消化决定记录格式错误');
   if(proposal.state==='accepted'&&(!Number.isSafeInteger(proposal.applied_revision)||proposal.applied_revision<1))throw Error('认知消化应用版本错误');
   if(proposal.state==='stale'&&!boundedText(proposal.stale_reason,300))throw Error('认知消化失效原因错误');
  }
  if(report.status!==(report.proposals.some(proposal=>proposal.state==='pending')?'pending':'complete'))throw Error('认知消化报告状态错误');
 }
}
