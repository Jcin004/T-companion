// Source of character-to-character messages. Original SullyOS threads own text.
import {applyBeatToThreads,dmThreadsOf,groupThreadOf,formatThreadForPrompt} from './life-rules-vendor.js';
import {jsonSnapshot as copy} from './json-snapshot.js';

export function ensureCommunication(data){
  const w=data.world;
  if(!w.communication)w.communication={version:1,threads:[],receipts:{},read:{}};
  return w.communication;
}
function upstreamWorld(data){
  const c=ensureCommunication(data),w=data.world;
  return {name:'小邻里',memberIds:w.residents,npcs:[],threads:c.threads};
}
export function validateCommunication(data){
  const c=ensureCommunication(data);
  if(c.version!==1||!Array.isArray(c.threads)||c.threads.length>1000||!c.receipts||Array.isArray(c.receipts)||typeof c.receipts!=='object'||!c.read||Array.isArray(c.read)||typeof c.read!=='object')throw Error('人物通信存档无效');
  const ids=new Set();
  for(const t of c.threads){
    if(typeof t.id!=='string'||ids.has(t.id)||!['dm','group'].includes(t.kind)||!Array.isArray(t.memberIds)||new Set(t.memberIds).size!==t.memberIds.length||(t.kind==='dm'&&t.memberIds.length!==2)||t.memberIds.some(id=>!data.world.residents.includes(id))||!Array.isArray(t.messages)||t.messages.length>20000)throw Error('人物通信线程无效');
    ids.add(t.id);const messages=new Set();
    for(const m of t.messages){if(typeof m.id!=='string'||messages.has(m.id)||!t.memberIds.includes(m.fromId)||typeof m.fromName!=='string'||typeof m.text!=='string'||(!m.text&&!m.deleted_at)||m.text.length>2000||!Number.isFinite(m.timestamp))throw Error('人物消息无效');messages.add(m.id);}
  }
  for(const [owner,read] of Object.entries(c.read)){
    if(!data.world.residents.includes(owner)||!read||typeof read!=='object'||Array.isArray(read))throw Error('人物已读状态无效');
    for(const [id,at] of Object.entries(read))if(!Number.isFinite(Date.parse(at))||!c.threads.some(t=>t.memberIds.includes(owner)&&t.messages.some(m=>m.id===id)))throw Error('人物已读来源无效');
  }
  for(const receipt of Object.values(c.receipts))if(typeof receipt.fingerprint!=='string'||!c.threads.some(t=>t.id===receipt.thread_id&&t.messages.some(m=>m.id===receipt.message_id)))throw Error('人物消息回执无效');
  return c;
}
export function threadMessage(data,ref){
  if(ref.channel==='online'){
    const m=data.messages.find(m=>m.id===ref.message_id&&!m.deleted_at),s=m&&data.sessions.find(s=>s.id===m.session_id);
    if(!m||!s||s.character_id!==ref.owner_id)throw Error('人物消息来源不存在');
    return {thread:{memberIds:[ref.owner_id,'user']},message:{id:m.id,fromId:m.role==='assistant'?ref.owner_id:'user',fromName:m.role==='assistant'?data.characters.find(p=>p.id===ref.owner_id)?.name:'用户',text:m.content,timestamp:Date.parse(m.created_at),read_at:m.read_at}};
  }
  const t=ensureCommunication(data).threads.find(t=>t.id===ref.thread_id),m=t?.messages.find(m=>m.id===ref.message_id);
  if(!m||m.deleted_at)throw Error('人物消息来源不存在');return {thread:t,message:m};
}
export function messageKnown(data,ref,owner){
  const {thread,message}=threadMessage(data,ref),read=ensureCommunication(data).read[owner]||{};
  return thread.memberIds.includes(owner)&&(message.fromId===owner||!!message.read_at||!!read[message.id]);
}
export function sendCharacterMessage(data,{request_id,actor_id,to_id,text,at,simulated_at,group=false}){
  const w=data.world,c=ensureCommunication(data);
  if(typeof request_id!=='string'||!/^[-\w]{1,100}$/.test(request_id)||!w.residents.includes(actor_id)||(!group&&(!w.residents.includes(to_id)||to_id===actor_id))||typeof text!=='string'||!text.trim()||text.length>2000)throw Error('人物消息候选无效');
  const fingerprint=JSON.stringify({actor_id,to_id:to_id||null,text,group});
  if(c.receipts[request_id]){if(c.receipts[request_id].fingerprint!==fingerprint)throw Error('消息任务标识与原内容不匹配');return copy(c.receipts[request_id]);}
  const members=w.residents.map(id=>({...data.characters.find(p=>p.id===id),name:id})),actor=data.characters.find(p=>p.id===actor_id),target=members.find(p=>p.id===to_id);
  const original=upstreamWorld(data),before=new Set(original.threads.flatMap(t=>t.messages.map(m=>m.id)));
  // The upstream cap is a UI window. Archive displaced messages back into the
  // same canonical thread, so old event/Memory references never lose their source.
  const history=new Map(original.threads.map(t=>[t.id,copy(t.messages)]));
  applyBeatToThreads(original,{charId:actor_id,charName:actor.name,phone:group?{group:[text]}:{dms:[{to:target.name,lines:[text]}]}},members,w.tick+1,simulated_at||at);
  for(const t of original.threads){const old=history.get(t.id)||[],seen=new Set(t.messages.map(m=>m.id));t.messages=[...old.filter(m=>!seen.has(m.id)),...t.messages];}
  const thread=original.threads.find(t=>t.messages.some(m=>!before.has(m.id))),message=thread?.messages.find(m=>!before.has(m.id));
  if(!message){const old=original.threads.find(t=>group?t.kind==='group':t.memberIds.includes(actor_id)&&t.memberIds.includes(to_id));const duplicate=[...(old?.messages||[])].reverse().find(m=>m.fromId===actor_id&&m.text.replace(/\s/g,'')===text.replace(/\s/g,''));if(!duplicate)throw Error('人物消息未被接受');c.receipts[request_id]={fingerprint,thread_id:old.id,message_id:duplicate.id,duplicate:true};return copy(c.receipts[request_id]);}
  message.timestamp=Date.parse(at);message.simulated_at=simulated_at||at;message.delivered_at=at;
  c.threads=original.threads;
  const receipt={fingerprint,thread_id:thread.id,message_id:message.id};c.receipts[request_id]=receipt;return copy(receipt);
}
export function readCharacterPhone(data,owner,at){
  const c=ensureCommunication(data);if(!data.world.residents.includes(owner))throw Error('人物尚未入驻');
  if(!c.read[owner])c.read[owner]={};
  for(const t of c.threads.filter(t=>t.memberIds.includes(owner)))for(const m of t.messages)if(m.fromId!==owner&&!m.deleted_at&&!c.read[owner][m.id])c.read[owner][m.id]=at;
}
export function phoneSnapshot(data,owner,{knownOnly=false}={}){
  if(!data.world.residents.includes(owner))throw Error('人物尚未入驻');
  const w=upstreamWorld(data),c=ensureCommunication(data);
  const threads=[...dmThreadsOf(w,owner),...[groupThreadOf(w)].filter(Boolean)].map(t=>({...copy(t),messages:t.messages.filter(m=>!m.deleted_at&&(!knownOnly||m.fromId===owner||c.read[owner]?.[m.id])).map(m=>({...copy(m),read_at:c.read[owner]?.[m.id]||null}))}));
  const onlineSessions=new Set(data.sessions.filter(s=>s.character_id===owner&&(s.mode===undefined||s.mode==='online')).map(s=>s.id));
  const complete=new Set(data.turns.filter(t=>t.state==='complete'&&!t.deleted_at&&onlineSessions.has(t.session_id)).flatMap(t=>[t.user_id,t.assistant_id]));
  const online=data.messages.filter(m=>onlineSessions.has(m.session_id)&&!m.deleted_at&&(complete.has(m.id)||m.origin==='world_share')&&(!knownOnly||m.role==='assistant'||m.origin!=='world_inbox'||m.read_at)).map(m=>({id:'online_'+m.id,source:{channel:'online',owner_id:owner,message_id:m.id},fromId:m.role==='assistant'?owner:'user',fromName:m.role==='assistant'?data.characters.find(p=>p.id===owner)?.name:'用户',text:m.content,timestamp:Date.parse(m.created_at),storyTime:m.created_at,read_at:m.read_at||null}));
  if(online.length)threads.push({id:'online_'+owner,kind:'dm',memberIds:[owner,'user'],messages:online});
  return {owner_id:owner,owner_name:data.characters.find(p=>p.id===owner)?.name,read_only:true,threads,context:threads.map(t=>formatThreadForPrompt(t,owner,12,data.world.tick)).join('\n')};
}
