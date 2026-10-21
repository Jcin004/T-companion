// SPDX-License-Identifier: AGPL-3.0-only
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountResidentLifeUI({api,toast,report,refreshWorld}){
  const box=node('details');box.id='resident-life';box.append(node('summary','居民生活 · 主动分享与后台'));
  const body=node('div');box.append(body);document.querySelector('.world-body').append(box);
  let running=false;
  const safe=fn=>async()=>{try{await fn();}catch(e){report(e);toast(e.message);}finally{running=false;}};
  async function refresh(){
    const life=await api('/world-life'),s=life.settings;body.replaceChildren();
    const inputs={};
    for(const [key,label] of [['enabled','启用居民自主活动（会使用模型额度）'],['background','Android 间歇后台推进'],['auto_memory','自动整理已知经历'],['share','允许人物主动分享']]){
      const l=node('label',label),i=node('input');i.type='checkbox';i.checked=s[key];i.id='life-'+key;inputs[key]=i;l.prepend(i);body.append(l);
    }
    for(const [key,label,min,max] of [['interval_minutes','推进间隔（分钟，系统可能延后）',15,1440],['max_actions','每批行动数',1,8],['max_dialogue_turns','每批居民对话轮数',0,4],['max_requests','每批模型请求上限',1,12],['daily_requests','每日模型请求上限',0,200],['quiet_start','安静时段开始（小时）',0,23],['quiet_end','安静时段结束（小时，相同为关闭）',0,23],['share_minutes','每位人物分享间隔（分钟）',15,1440],['memory_threshold','积累多少条已知事件再整理',1,20],['memory_budget','每次整理的来源字符预算',500,8000]]){
      const l=node('label',label),i=node('input');i.type='number';i.min=min;i.max=max;i.value=s[key];i.id='life-'+key;inputs[key]=i;l.append(i);body.append(l);
    }
    const add=(label,fn,id)=>{const b=node('button',label);b.type='button';b.id=id;b.onclick=safe(fn);body.append(b);return b;};
    add('保存居民生活设置',async()=>{const settings=Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.type==='checkbox'?i.checked:Number(i.value)]));await api('/world-life/settings','POST',settings);toast('设置已保存');await refresh();},'life-save');
    add('让居民生活一批',async()=>{if(running)return;running=true;status.textContent='居民正在行动…';await api('/world-life/run','POST',{request_id:'batch_'+Date.now().toString(36)});await refreshWorld();await refresh();toast('居民批次已保存，可到聊天查看分享');},'life-run');
    add('暂停并取消当前批次',async()=>{await api('/world-life/cancel','POST');await refresh();},'life-cancel');
    const status=node('p');status.id='life-status';status.setAttribute('role','status');body.append(status);
    status.textContent='今日已预留 '+life.daily.requests+' 次请求；最后批次：'+(life.runs.slice(-1)[0]?.state||'尚未执行');
    const pending=[...life.runs].reverse().find(r=>['running','uncertain','paused','failed'].includes(r.state));
    if(pending)add('恢复批次（不确定请求将跳过）',async()=>{await api('/world-life/resume','POST',{run_id:pending.id,skip_uncertain:true});await refreshWorld();await refresh();},'life-resume');
    body.append(node('p','启用后按实际执行时间记录。后台受网络、低电量、安静时段与系统调度限制；强制停止或关机期间不运行。没有分享的经历仍可在世界中查看。'));
    if(life.last_attempt)body.append(node('p','上次实际执行：'+life.last_attempt.at+' · '+life.last_attempt.origin+' · '+life.last_attempt.status));
    for(const [id,plan] of Object.entries(life.plans))body.append(node('p','当前计划 · '+id+'：'+plan));
    for(const r of life.runs.slice(-5).reverse())body.append(node('small',r.origin+' · '+r.state+' · '+r.started_at+' · 最后成功 '+(r.last_success_at||'无')));
  }
  return {refresh};
}
