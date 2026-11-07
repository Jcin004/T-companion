// Life management only; plans and phone reading have their own pages.
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountResidentLifeUI({api,toast,report,refreshWorld}){
  const box=node('div');box.id='resident-life';document.querySelector('.world-body').append(box);
  let running=false;
  const safe=fn=>async()=>{try{await fn();}catch(e){report(e);toast(e.message);}finally{running=false;}};
  async function refresh(){
    const life=await api('/world-life'),s=life.settings;box.textContent='';
    const summary=node('p');summary.className='life-summary';summary.id='life-status';summary.setAttribute('role','status');
    summary.textContent=(life.catching_up?'正在分段补算，游标：'+life.simulated_at:life.settings.enabled?'规则生活已启用':'规则生活已暂停')+'；今日自主请求 '+life.daily.requests+'/'+s.daily_requests+'。';box.append(summary);
    if(life.runs[life.runs.length-1]?.reason==='network')box.append(node('p','离线期间规则继续，人物的重要决定等待联网。'));
    const inputs={};
    for(const [key,label] of [['enabled','启用规则生活'],['background','允许 Android 后台间歇推进'],['auto_memory','重要交流后整理记忆'],['share','允许人物自主分享']]){
      const l=node('label',label),i=node('input');i.type='checkbox';i.checked=s[key];i.id='life-'+key;inputs[key]=i;l.prepend(i);box.append(l);
    }
    const advanced=node('details');advanced.append(node('summary','请求预算与安静时段'));box.append(advanced);
    for(const [key,label,min,max] of [['interval_minutes','后台检查间隔（分钟）',15,1440],['max_requests','每批自主模型请求上限',1,12],['daily_requests','每天自主模型请求上限',0,200],['quiet_start','安静时段开始（小时）',0,23],['quiet_end','安静时段结束（小时，相同为关闭）',0,23]]){
      const l=node('label',label),i=node('input');i.type='number';i.min=min;i.max=max;i.value=s[key];i.id='life-'+key;inputs[key]=i;l.append(i);advanced.append(l);
    }
    const add=(label,fn,id)=>{const b=node('button',label);b.type='button';b.id=id;b.onclick=safe(fn);box.append(b);};
    add('保存设置',async()=>{await api('/world-life/settings','POST',Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.type==='checkbox'?i.checked:Number(i.value)])));await refresh();toast('设置已保存');},'life-save');
    add('推进生活并处理待办',async()=>{if(running)return;running=true;summary.textContent='正在处理到期活动与重要决定…';await api('/world-life/run','POST',{request_id:'manual_'+Date.now().toString(36)});await refreshWorld();await refresh();},'life-run');
    add('暂停并取消',async()=>{await api('/world-life/cancel','POST');await refresh();},'life-cancel');
    const pending=[...life.runs].reverse().find(r=>['running','uncertain','paused','failed'].includes(r.state));
    if(pending)add('恢复上次处理（跳过不确定请求）',async()=>{await api('/world-life/resume','POST',{run_id:pending.id,skip_uncertain:true});await refresh();},'life-resume');
    box.append(node('p','普通活动由规则执行；重要变化才请求模型。安静时段不停止世界时间。关机或系统中断后，恢复时按保存游标补算。'));
    if(life.last_attempt)box.append(node('small','最近执行：'+life.last_attempt.at+' · '+life.last_attempt.status));
  }
  return {refresh};
}
