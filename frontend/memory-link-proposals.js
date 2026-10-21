// SPDX-License-Identifier: AGPL-3.0-only
// Pending interpretations are separate from reviewed links and never read by recall.
import {linkNode,linkValue,describeLink} from './memory-links.js';
import {validateEvidence,rosterSource} from './memory-evidence.js';
export const proposalKey=ref=>ref.kind+':'+ref.id;
export const relationKey=value=>JSON.stringify([value.owner_id,proposalKey(value.from),value.type,proposalKey(value.to)]);

export function proposalMaterial(data,owner,ref) {
  const node=linkNode(data,owner,ref);
  if(ref.kind==='memory') {
    if(!node.active)throw Error('已暂停的记忆不能用于生成或确认候选');
    validateEvidence(data,owner,node.evidence);
    return {kind:'memory',id:node.id,revision:node.revision,title:node.title,content:node.content,evidence:node.evidence};
  }
  if(node.origin!=='manual'||node.roster_snapshot!==rosterSource(data.characters.find(c=>c.id===owner)))throw Error('标签需人工保存且名册依据仍有效');
  return {kind:'anchor',id:node.id,revision:node.revision,title:node.label,content:node.interpretation,quote:node.quote};
}

export function proposalMaterials(data,owner,refs) {
  if(!Array.isArray(refs)||refs.length<2||refs.length>12)throw Error('请选择 2–12 项记忆或人工标签');
  if(new Set(refs.map(proposalKey)).size!==refs.length)throw Error('候选材料不能重复');
  const rows=refs.map(ref=>proposalMaterial(data,owner,ref));
  if(!rows.some(row=>row.kind==='memory'))throw Error('至少选择一条来源记忆');
  if(JSON.stringify(rows).length>48000)throw Error('本次材料过多，请减少勾选后再试；未截断来源');
  return rows;
}

function proofValue(data,owner,value,proof,{fresh=true}={}) {
  if(!Array.isArray(proof)||proof.length<2||proof.length>12)throw Error('候选需要两端各自的原话依据');
  const endpoints=[value.from,value.to],covered=new Set();
  const result=proof.map(p=>{
    if(!p||typeof p.quote!=='string'||!p.quote.trim()||p.quote.length>2000)throw Error('候选依据格式错误');
    const ref=endpoints.find(ref=>ref.kind===p.kind&&ref.id===p.id);
    if(!ref)throw Error('候选依据必须属于关联两端');
    const node=linkNode(data,owner,ref),key=proposalKey(ref);covered.add(key);
    if(ref.kind==='memory') {
      validateEvidence(data,owner,[p]);
      if(fresh&&!node.evidence.some(e=>(e.source_type==='world_event'?p.source_type==='world_event'&&e.event_id===p.event_id:e.message_id===p.message_id)&&e.quote.includes(p.quote)))throw Error('候选引文不在已提供的记忆依据内');
      return {kind:ref.kind,id:ref.id,...(p.source_type==='world_event'?{source_type:'world_event',event_id:p.event_id}:{message_id:p.message_id}),quote:p.quote};
    }
    if(fresh&&!node.quote.includes(p.quote))throw Error('候选标签引文不匹配');
    return {kind:ref.kind,id:ref.id,quote:p.quote};
  });
  if(covered.size!==2)throw Error('候选缺少另一端的原话依据');
  return result;
}

export function proposalValue(data,owner,input,allowed) {
  if(typeof input?.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw Error('候选需说明关系理由，最多 1000 字');
  const value=linkValue(data,owner,{...input,note:input.reason});
  for(const ref of [value.from,value.to]){
    if(allowed&&!allowed.has(proposalKey(ref)))throw Error('模型引用了未选择的材料');
    proposalMaterial(data,owner,ref);
  }
  return {...value,reason:input.reason.trim(),proof:proofValue(data,owner,value,input.proof)};
}

export function describeProposal(data,p) {
  const link=describeLink(data,p);let blocked='';
  try {
    if(link.stale)throw Error('端点内容已修改，请重新生成候选');
    for(const ref of [p.from,p.to])proposalMaterial(data,p.owner_id,ref);
    proofValue(data,p.owner_id,p,p.proof);
  }catch(e){blocked=e.message;}
  return {...p,from:link.from,to:link.to,stale:!!blocked,blocked};
}

export function validateProposals(data) {
  const rows=data.memory.link_proposals;
  if(!Array.isArray(rows)||rows.length>500)throw Error('关联候选格式或数量错误（最多 500 条）');
  const ids=new Set();
  for(const p of rows){
    linkValue(data,p.owner_id,p);
    if(typeof p.id!=='string'||!p.id||ids.has(p.id)||p.origin!=='ai'||!['pending','rejected','accepted'].includes(p.status))throw Error('关联候选标识或状态错误');
    ids.add(p.id);
    if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000||typeof p.created_at!=='string'||typeof p.updated_at!=='string')throw Error('关联候选说明错误');
    for(const key of ['from_revision','to_revision'])if(!Number.isSafeInteger(p[key])||p[key]<0)throw Error('关联候选版本错误');
    if(p.status==='accepted'){
      if(typeof p.link_id!=='string'||!p.link_id)throw Error('已确认候选缺少关联记录');
      linkValue(data,p.owner_id,{...p,type:p.reviewed_type,note:p.reviewed_note});
      const link=data.memory.links.find(l=>l.id===p.link_id);
      if(link&&link.owner_id!==p.owner_id)throw Error('候选确认记录不属于此人物');
    }
    const stale=linkNode(data,p.owner_id,p.from).revision!==p.from_revision||linkNode(data,p.owner_id,p.to).revision!==p.to_revision;
    proofValue(data,p.owner_id,p,p.proof,{fresh:!stale});
  }
}
