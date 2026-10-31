// SPDX-License-Identifier: AGPL-3.0-only
// Monthly material and provenance rules. Persistence and model calls belong to MemoryModule.
import {sourceMessages,dayKey} from './memory-evidence.js';
export function monthKey(value){
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('月份格式错误');
 return value;
}
export function monthlyMaterial(data,owner,month){
 monthKey(month);
 const daily=data.memory.summaries.filter(s=>s.owner_id===owner&&s.day.startsWith(month+'-')).slice().sort((a,b)=>a.day.localeCompare(b.day)||a.id.localeCompare(b.id));
 const sources=new Map(sourceMessages(data,owner).filter(m=>dayKey(m.created_at,data.settings.timezone).startsWith(month+'-')).map(m=>[m.id,m]));
 if(!daily.length)throw Error('请先生成这个月的每日总结');
 if(daily.length>31||new Set(daily.map(s=>s.day)).size!==daily.length)throw Error('每日总结日期重复或数量错误');
 for(const s of daily)if(!s.content.trim()||!s.source_ids.length||s.source_ids.some(id=>!sources.has(id)||dayKey(sources.get(id).created_at,data.settings.timezone)!==s.day))throw Error('每日总结来源已变化，请先复核');
 const material=daily.map(s=>({id:s.id,day:s.day,revision:s.revision??0,content:s.content,source_ids:s.source_ids}));
 if(JSON.stringify(material).length>120000)throw Error('本月总结材料过多，请先精简每日总结；未自动截断');
 const source_ids=[...new Set(daily.flatMap(s=>s.source_ids))].sort((a,b)=>a-b);
 return {material,source_ids,summary_refs:daily.map(s=>({id:s.id,revision:s.revision??0})),fingerprint:JSON.stringify([data.settings.timezone,material,source_ids.map(id=>{const m=sources.get(id);return [id,m.content,m.created_at];})])};
}
export function monthlyStale(memory,card){
 const daily=memory.summaries.filter(s=>s.owner_id===card.owner_id&&s.day.startsWith(card.month+'-'));
 return daily.length!==card.summary_refs.length||card.summary_refs.some(ref=>!daily.some(s=>s.id===ref.id&&(s.revision??0)===ref.revision));
}
export function validateMonthly(data,ids){
 const m=data.memory,owners=new Set(data.characters.map(c=>c.id)),cache=new Map();
 if(!Array.isArray(m.monthly_summaries)||m.monthly_summaries.length>5000)throw Error('月度回顾容量错误');
 const months=new Set();
 for(const card of m.monthly_summaries){
  if(typeof card.id!=='string'||!card.id||ids.has(card.id)||!owners.has(card.owner_id))throw Error('月度回顾标识或归属错误');
  ids.add(card.id);monthKey(card.month);
  const key=card.owner_id+':'+card.month;if(months.has(key))throw Error('月度回顾重复');months.add(key);
  if(!Array.isArray(card.versions)||card.versions.length>10)throw Error('月度回顾版本错误');
  for(const value of [card,...card.versions]){
   if(value.owner_id!==card.owner_id||value.month!==card.month||typeof value.content!=='string'||!value.content.trim()||value.content.length>10000||!Number.isSafeInteger(value.revision)||value.revision<0||!['ai','manual'].includes(value.origin)||typeof value.updated_at!=='string')throw Error('月度回顾格式错误');
   if(!Array.isArray(value.source_ids)||!value.source_ids.length||!Array.isArray(value.summary_refs)||!value.summary_refs.length||value.summary_refs.length>31||new Set(value.summary_refs.map(r=>r?.id)).size!==value.summary_refs.length)throw Error('月度回顾来源格式错误');
   if(!cache.has(card.owner_id))cache.set(card.owner_id,new Map(sourceMessages(data,card.owner_id).map(s=>[s.id,dayKey(s.created_at,data.settings.timezone).slice(0,7)])));
   const sources=cache.get(card.owner_id);
   for(const id of value.source_ids)if(sources.get(id)!==card.month)throw Error('月度回顾原话来源错误');
   for(const ref of value.summary_refs){
    if(!ref||typeof ref.id!=='string'||!ref.id||!Number.isSafeInteger(ref.revision)||ref.revision<0)throw Error('月度回顾日总结引用错误');
    const source=m.summaries.find(s=>s.id===ref.id);
    if(source&&(source.owner_id!==card.owner_id||!source.day.startsWith(card.month+'-')))throw Error('月度回顾日总结归属错误');
   }
  }
 }
}
