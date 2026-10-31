// SPDX-License-Identifier: AGPL-3.0-only
// One monthly review dialog, using the existing memory UI actions and service API.
export function mountMonthlyMemoryUI({api,isLocal,dialog,field,button,node,versions,openDaily,openSource,toast}){
 return async function openMonthly(owner,month){
  if(!isLocal())return;
  const query='?owner='+encodeURIComponent(owner),rows=await api('/monthly-summaries'+query+'&month='+month),card=rows[0];
  const daily=(await api('/summaries'+query)).filter(s=>s.day.startsWith(month+'-')).sort((a,b)=>a.day.localeCompare(b.day));
  const box=dialog('monthly-dialog',month+' · 月度回顾'),content=field('本月回顾','textarea',card?.content||'');
  content.input.id='monthly-content';content.input.rows=9;
  box.append(node('p','subtle','从已有每日总结精炼，保留原话来源；缺失日期不会补写。生成或重写会调用记忆模型，旧版本保留。月度回顾用于查看，不自动写入长期记忆。'),node('p','subtle','当前已有 '+daily.length+' 天总结'),content.label);
  if(card?.stale)box.append(node('p','memory-stale','每日总结已增删或改写，这份回顾依据旧版材料，请复核后重写。'));
  const actions=node('div','actions'),generate=button(card?'按日总结重写':'生成月度回顾',async()=>{toast('正在精炼月度回顾，会调用模型…');await api('/monthly-summaries/generate','POST',{owner_id:owner,month});await openMonthly(owner,month);toast('月度回顾已生成');});
  generate.disabled=!daily.length;actions.append(generate);
  if(card)actions.append(button('保存编辑',async()=>{await api('/monthly-summaries','PATCH',{owner_id:owner,month,content:content.input.value});await openMonthly(owner,month);toast('月度回顾已保存');}),button('修改记录',()=>versions(card)),button('删除回顾',async()=>{if(!confirm('删除月度回顾及旧版本？每日总结和聊天原文保留。'))return;await api('/monthly-summaries','DELETE',{owner_id:owner,month});await openMonthly(owner,month);}));
  box.append(actions);
  if(card){
   box.append(node('p','subtle','生成依据：'+card.summary_refs.map(ref=>{const day=daily.find(s=>s.id===ref.id);return (day?.day||'已删除的日总结')+' v'+ref.revision;}).join('、')));
   const sources=node('details'),sourceList=node('div');sources.append(node('summary','','本回顾原话来源 · '+card.source_ids.length+' 条'),sourceList);box.append(sources);
   let shown=0;const more=button('继续显示来源',()=>showSources());
   function showSources(){for(const id of card.source_ids.slice(shown,shown+80))sourceList.append(button('原话 #'+id,()=>openSource(id,owner)));shown+=80;more.hidden=shown>=card.source_ids.length;}
   sources.addEventListener('toggle',()=>{if(sources.open&&!shown){showSources();sources.append(more);}});
  }
  box.append(node('h3','','当前每日总结'));
  if(!daily.length)box.append(node('p','subtle','先按日期生成每日总结，再精炼这个月。'));
  for(const day of daily)box.append(button(day.day+' · '+day.content.slice(0,80),()=>openDaily(owner,day.day)));
 };
}
