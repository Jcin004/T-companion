// SPDX-License-Identifier: AGPL-3.0-only
// Shared source projection and verbatim evidence checks; no writes or model calls.
export function dayKey(stamp,zone='Asia/Shanghai'){const raw=stamp.replace(' ','T'),date=new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)?raw:raw+'Z');const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');}
export function sourceMessages(data,owner,day){
 const sessions=new Set(data.sessions.filter(s=>s.character_id===owner).map(s=>s.id));
 const complete=new Set(data.turns.filter(t=>sessions.has(t.session_id)&&t.state==='complete').flatMap(t=>[t.user_id,t.assistant_id]));
 return data.messages.filter(m=>sessions.has(m.session_id)&&complete.has(m.id)&&(!day||dayKey(m.created_at,data.settings.timezone)===day)).sort((a,b)=>a.id-b.id);
}
export function validateEvidence(data,owner,input,allowed,sourceLookup){
 if(!Array.isArray(input)||!input.length||input.length>20)throw Error('每条记忆需要 1–20 条来源原话');
 const sources=sourceLookup||new Map(sourceMessages(data,owner).map(m=>[m.id,m]));
 return input.map(e=>{const m=sources.get(e.message_id);if(!m||(allowed&&!allowed.has(m.id))||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>4000||!m.content.includes(e.quote))throw Error('来源原话不匹配、未完成或不属于此角色');return {message_id:m.id,quote:e.quote};});
}
export function rosterSource(character){return '名称：'+character.name+'\n基础身份：'+character.identity+'\n表达风格：'+character.style+'\nCanon：'+JSON.stringify(character.profile?.canon||{},null,2)+'\nPersona：'+JSON.stringify(character.profile?.persona||{},null,2);}
