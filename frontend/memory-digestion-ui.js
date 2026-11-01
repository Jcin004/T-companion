// SPDX-License-Identifier: AGPL-3.0-only
import {cognitionLabel} from './memory-digestion-core.js';
import {memoryRooms} from './memory-rooms.js';

export function mountMemoryDigestionUI({api,owner,isLocal,dialog,button,node,evidenceLinks,openSource,toast,onChanged}){
 let reportLimit=20;
 const sourceButtons=(container,refs,ownerId)=>{
  for(const ref of refs||[]){
   const source=ref.source_type==='world_event'?{source_type:'world_event',event_id:ref.event_id}:ref.message_id;
   const label=ref.source_type==='world_event'?'世界事件 #'+ref.event_id:'原话 #'+ref.message_id;
   const b=button(label,()=>openSource(source,ownerId));b.classList.add('memory-source');container.append(b);
  }
 };
 const statusText=item=>item.room==='attic'||item.room==='windowsill'?cognitionLabel(item.status):'';
 function materialCard(item,ownerId,targetIds){
  const room=memoryRooms.find(value=>value.id===item.room),card=node('article','card memory-card');
  const labels=[room?.label||item.room,item.kind==='promise'?'约定':item.kind==='experience'?'经历':item.kind==='interpretation'?'理解':'陈述',statusText(item)].filter(Boolean);
  card.append(node('small','',labels.join(' · ')),node('h3','',item.title),node('p','memory-text',item.content));
  if(targetIds.has(item.memory_id))card.append(node('small','subtle','本次处理对象'));
  else if(item.manual_cognition)card.append(node('small','subtle','认知状态由你确认，模型不会改写'));
  else if(item.room==='attic'||item.room==='windowsill')card.append(node('small','subtle','未作为处理对象或完成依据'));
  sourceButtons(card,item.source_refs,ownerId);return card;
 }
 async function render(){
  if(!isLocal())throw Error('认知消化当前只读取本机记忆');
  const ownerId=await owner(),[material,reports]=await Promise.all([
   api('/memory-digestion/material?owner='+encodeURIComponent(ownerId)),
   api('/memory-digestion?owner='+encodeURIComponent(ownerId))
  ]),box=dialog('memory-digestion-dialog','认知消化');
   box.append(node('p','subtle','只读取当前人物最多 8 条待处理的阁楼/窗台记忆和 12 条客厅/卧室经历。模型可以提出处理建议，只有你确认后才改变状态；未转入主记忆的剧情不会被读取。原话和世界事件仍归各自模块保存。'));
  const preview=node('details','memory-digest-preview');preview.open=true;preview.append(node('summary','','本次将读取 '+material.inputs.length+' 条材料；待处理 '+material.targets.length+' 条，独立经历 '+material.experiences.length+' 条'));
  const targetIds=new Set(material.targets.map(item=>item.memory_id));
  for(const item of material.inputs)preview.append(materialCard(item,ownerId,targetIds));
  if(material.reason)preview.append(node('p','subtle',material.reason));
  box.append(preview,button('开始消化',async()=>{
   await api('/memory-digestion/run','POST',{owner_id:ownerId});toast('认知消化报告已保存');await onChanged?.();await render();
  }));
  box.append(node('h3','','消化报告'));
  if(!reports.length)box.append(node('p','subtle','还没有消化报告。'));
  for(const report of reports.slice(0,reportLimit)){
   const card=node('article','card memory-digest-report'),summary=node('p','memory-text',report.summary);
   const accepted=report.proposals.filter(item=>item.state==='accepted').length,pending=report.proposals.filter(item=>item.state==='pending').length,kept=report.proposals.filter(item=>item.state==='kept').length;
   card.append(node('small','',new Date(report.created_at).toLocaleString()+' · '+(report.status==='pending'?'待复核':'已完成')+' · '+accepted+' 条已应用'+(kept?' · '+kept+' 条维持原状':'')+(pending?' · '+pending+' 条待复核':'')),summary);
   const details=node('details','memory-digest-details');details.append(node('summary','','查看本次材料与建议'));
   const inputIds=new Set(report.input_snapshots.filter(item=>item.selected_target).map(item=>item.memory_id));
   for(const item of report.input_snapshots)details.append(materialCard(item,ownerId,inputIds));
   for(const proposal of report.proposals){
    const entry=node('section','memory-digest-proposal card'),target=report.input_snapshots.find(item=>item.memory_id===proposal.target_memory_id),state=proposal.state;
    entry.append(node('small','',cognitionLabel(proposal.from_status)+' → '+cognitionLabel(proposal.to_status)+' · '+({low:'信心较低',medium:'信心中等',high:'信心较高'}[proposal.confidence]||'信心未标注')),
     node('p','memory-text',target?.title||'目标记忆'),node('p','memory-text',proposal.reason));
    const basis=node('p','subtle','依据经历：');entry.append(basis);
    for(const id of proposal.basis_memory_ids){const item=report.input_snapshots.find(value=>value.memory_id===id);if(item){basis.append(document.createTextNode(' '+item.title+'；'));sourceButtons(entry,item.source_refs,report.owner_id);}}
    if(state==='accepted')entry.append(node('p','subtle','已确认并写入记忆状态。'));
    else if(state==='rejected')entry.append(node('p','subtle','已驳回；原状态保留。'));
    else if(state==='kept')entry.append(node('p','subtle','本次判断维持原状态；未修改记忆。'));
    else if(state==='stale'||proposal.stale)entry.append(node('p','subtle',proposal.stale_reason||'材料或目标状态已改变；请重新消化后再决定。'));
    else{
     const actions=node('div','actions');actions.append(button('确认变化',async()=>{await api('/memory-digestion/'+encodeURIComponent(report.id)+'/decision','POST',{owner_id:ownerId,proposal_id:proposal.id,decision:'accept'});await onChanged?.();await render();}),
      button('驳回',async()=>{await api('/memory-digestion/'+encodeURIComponent(report.id)+'/decision','POST',{owner_id:ownerId,proposal_id:proposal.id,decision:'reject'});await render();}));entry.append(actions);
    }
    details.append(entry);
   }
   if(!report.proposals.length)details.append(node('p','subtle','当前没有待处理的问题或期盼；未调用模型，记忆没有变化。'));
   card.append(details,button('删除报告',async()=>{if(!confirm('删除这份认知消化报告？记忆卡片和已确认的状态不受影响。'))return;await api('/memory-digestion/'+encodeURIComponent(report.id)+'?owner='+encodeURIComponent(ownerId),'DELETE');await render();toast('报告已删除');}));
   box.append(card);
  }
  if(reports.length>reportLimit)box.append(button('加载更早报告',async()=>{reportLimit=Math.min(reportLimit+20,reports.length);await render();}));
 }
 return {open:render};
}
