// SPDX-License-Identifier: AGPL-3.0-only
import {validateLinks} from './memory-links.js';
import {validateProposals} from './memory-link-proposals.js';
import {createRecallPlan} from './memory-recall.js';
import {dayKey,sourceMessages,validateEvidence} from './memory-evidence.js';
export {dayKey,sourceMessages,validateEvidence,rosterSource} from './memory-evidence.js';
// Original, platform-independent evidence and recall rules. Raw chat remains authoritative evidence.
export const memoryDefaults={recall:true,recall_limit:4,budget:4000,auto_extract:false,extract_interval:20,profile_id:'',context_messages:2,use_links:true,use_anchors:true};
export const copy=value=>JSON.parse(JSON.stringify(value));
export const newId=()=> 'mem_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function ensureMemory(data){
 if(!data.memory)data.memory={version:1,events:[],summaries:[],anchors:[],settings:{...memoryDefaults},watermarks:{}};
 const m=data.memory;
 if(m.links===undefined)m.links=[];
 if(m.link_proposals===undefined)m.link_proposals=[];
 const nodes=[...(Array.isArray(m.events)?m.events:[]),...(Array.isArray(m.anchors)?m.anchors:[])];
 for(const node of nodes)if(node&&typeof node==='object'&&node.revision===undefined)node.revision=0;
 return m;
}
export function eventValue(data,owner,input,allowed,sourceLookup){
 const title=String(input.title||'').trim(),content=String(input.content||'').trim();
 if(!title||title.length>100||!content||content.length>6000)throw Error('请填写标题（最多100字）与正文（最多6000字）');
 if(!['statement','promise','interpretation','experience'].includes(input.kind))throw Error('请选择陈述、约定、理解或经历');
 const evidence=validateEvidence(data,owner,input.evidence,allowed,sourceLookup);
 const participants=[...new Set([owner,...(Array.isArray(input.participants)?input.participants:[])])];
 if(participants.some(id=>!data.characters.some(c=>c.id===id)))throw Error('关联人物不存在');
 return {owner_id:owner,title,content,kind:input.kind,evidence,participants,active:input.active!==false};
}
export function recallPlan(data,owner,query,options={}){
 const memory=ensureMemory(data);
 return createRecallPlan(data,owner,query,{...options,settings:{...memoryDefaults,...memory.settings}});
}
// Compatibility: callers requesting only event cards still receive an array.
export function recall(data,owner,query,options){return recallPlan(data,owner,query,options).records;}
export {formatMemoryContext as memoryContext} from './memory-recall.js';
export function validateMemory(data){
 const m=ensureMemory(data);if(m.version!==1||!Array.isArray(m.events)||!Array.isArray(m.summaries)||!Array.isArray(m.anchors)||m.events.length>5000||m.summaries.length>5000||m.anchors.length>2000)throw Error('记忆备份格式或容量错误');
 if(!m.watermarks||typeof m.watermarks!=='object'||Array.isArray(m.watermarks)||Object.values(m.watermarks).some(v=>!Number.isSafeInteger(v)||v<0))throw Error('整理进度格式错误');
 const owners=new Set(data.characters.map(c=>c.id)),ids=new Set(),sourceCache=new Map(),dayCache=new Map();
 const lookup=owner=>{if(!sourceCache.has(owner))sourceCache.set(owner,new Map(sourceMessages(data,owner).map(m=>[m.id,m])));return sourceCache.get(owner);};
 const daySources=owner=>{if(!dayCache.has(owner)){const days=new Map();for(const m of lookup(owner).values()){const day=dayKey(m.created_at,data.settings.timezone);if(!days.has(day))days.set(day,new Set());days.get(day).add(m.id);}dayCache.set(owner,days);}return dayCache.get(owner);};
 const versions=rows=>{for(const item of rows)if(!Array.isArray(item.versions)||item.versions.length>10||item.versions.some(v=>!v||typeof v!=='object'||Array.isArray(v)||v.versions||JSON.stringify(v).length>200000))throw Error('修改记录格式或容量错误');};versions([...m.events,...m.summaries,...m.anchors]);
 for(const e of m.events){if(!owners.has(e.owner_id)||typeof e.id!=='string'||ids.has(e.id))throw Error('记忆引用或标识错误');ids.add(e.id);eventValue(data,e.owner_id,e,undefined,lookup(e.owner_id));if(typeof e.active!=='boolean'||typeof e.updated_at!=='string'||!['ai','manual'].includes(e.origin))throw Error('记忆状态错误');if(!Array.isArray(e.versions)||e.versions.length>10)throw Error('记忆版本格式错误');}
 for(const s of m.summaries){if(typeof s.id!=='string'||ids.has(s.id))throw Error('总结标识错误');ids.add(s.id);if(!owners.has(s.owner_id)||!/^\d{4}-\d{2}-\d{2}$/.test(s.day)||typeof s.content!=='string'||s.content.length>10000||!Array.isArray(s.source_ids)||!Array.isArray(s.versions)||s.versions.length>10)throw Error('日总结格式错误');const allowed=daySources(s.owner_id).get(s.day)||new Set();if(s.source_ids.some(id=>!allowed.has(id)))throw Error('日总结来源错误');}
 for(const a of m.anchors){if(typeof a.id!=='string'||ids.has(a.id))throw Error('认同标识错误');ids.add(a.id);if(!owners.has(a.owner_id)||typeof a.id!=='string'||typeof a.label!=='string'||!a.label||a.label.length>40||typeof a.interpretation!=='string'||a.interpretation.length>2000||typeof a.quote!=='string'||!a.quote||a.quote.length>2000||typeof a.roster_snapshot!=='string'||!a.roster_snapshot.includes(a.quote)||!Array.isArray(a.versions)||a.versions.length>10)throw Error('自我认同来源格式错误');}
 for(const node of [...m.events,...m.anchors])if(!Number.isSafeInteger(node.revision)||node.revision<0)throw Error('记忆或核心标签版本错误');
 validateLinks(data);
 validateProposals(data);
 const s={...memoryDefaults,...m.settings};for(const [key,min,max] of [['recall_limit',1,12],['budget',500,12000],['extract_interval',4,200],['context_messages',0,4]])if(!Number.isInteger(s[key])||s[key]<min||s[key]>max)throw Error('记忆设置范围错误');for(const key of ['recall','auto_extract','use_links','use_anchors'])if(typeof s[key]!=='boolean')throw Error('记忆开关格式错误');if(typeof s.profile_id!=='string')throw Error('记忆连接格式错误');m.settings=s;
 return m;
}
