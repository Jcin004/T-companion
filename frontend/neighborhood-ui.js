// Navigation and views only: all state/commands use domain interfaces.
const el=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const request=()=>globalThis.crypto?.randomUUID?.()||'ui_'+Date.now().toString(36);
const jump=(name,options={})=>window.dispatchEvent(new CustomEvent('t-open-screen',{detail:{name,options}}));
export function installNeighborhoodShell(){
  const style=node('link');style.rel='stylesheet';style.href=new URL('./neighborhood.css',import.meta.url).href;document.head.append(style);
  const utilities=node('link');utilities.rel='stylesheet';utilities.href=new URL('./resident-phone-utilities.css',import.meta.url).href;document.head.append(utilities);
  function page(id,title){const s=node('section');s.id=id;s.className='screen page neighborhood-page';s.hidden=true;const h=node('header'),back=node('button','‹ 返回');back.dataset.backScreen='true';h.append(back,node('h1',title));s.append(h,node('div'));s.lastChild.className='neighborhood-content';document.querySelector('.phone').insertBefore(s,el('home-button'));return s;}
  page('resident-phone','人物手机');page('resident-plan','生活安排');page('desktop-layout','桌面排列');
  el('resident-phone').firstChild.remove();
  const history=el('world-history-dialog'),records=node('section');records.id=history.id;records.className='screen page neighborhood-page';records.hidden=true;records.innerHTML=history.innerHTML;history.replaceWith(records);document.querySelector('.phone').insertBefore(records,el('home-button'));
  records.showModal=()=>jump(records.id);records.close=()=>{records.open=false;records.dispatchEvent(new Event('close'));window.dispatchEvent(new Event('t-back-screen'));};
  records.querySelector('h2').textContent='世界记录';
  const kind=node('select');kind.id='world-history-kind';kind.append(new Option('全部记录','all'),new Option('生活活动','activity'),new Option('对话与消息','dialogue'));
  const day=node('input');day.type='date';day.id='world-history-day';day.setAttribute('aria-label','记录日期');
  records.querySelector('form').prepend(kind,day);
  for(const [id,label,icon] of [['world-history-dialog','世界记录','▤'],['wardrobe','衣柜','✿']]){const b=node('button');b.dataset.app=id;const span=node('span',icon);span.className='app-icon';b.append(span,document.createTextNode(label));document.querySelector('.app-grid').append(b);}
  for(const [id,label] of [['chat','消息'],['roster','人物'],['archive','相册']])for(const button of document.querySelectorAll('.app-grid [data-app="'+id+'"]'))button.lastChild.textContent=label;
  const arrange=node('button','排列桌面');arrange.id='desktop-arrange';arrange.onclick=()=>jump('desktop-layout');el('home').append(arrange);
  const grid=document.querySelector('.app-grid'),fixed=['world','chat','roster'];let saved=[];try{const value=JSON.parse(localStorage.getItem('t.desktop.order')||'[]');if(Array.isArray(value))saved=value.filter(v=>typeof v==='string');}catch{}
  const buttons=[...grid.children],order=[...fixed,...saved,...buttons.map(b=>b.dataset.app)];for(const id of [...new Set(order)]){const b=buttons.find(b=>b.dataset.app===id);if(b)grid.append(b);}
}
export function mountNeighborhoodUI({api,localReady,isLocal,navigate,goBack,worldUI,toast,report}){
  let phoneOwner=null,planOwner=null,renderer=null,scheduler=null,scheduling=false,stopped=false;
  const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(error){report(error);toast(error.message);}};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=safe(fn);return b;};
  for(const b of document.querySelectorAll('[data-back-screen]'))b.onclick=goBack;
  async function phone(owner=phoneOwner){
    if(!owner)throw Error('请选择一位居民');phoneOwner=owner;
    const [snapshot,members]=await Promise.all([api('/world-phone/'+encodeURIComponent(owner)),api('/characters')]);
    if(!renderer)renderer=await import('./resident-phone-renderer.js');
    renderer.renderPhone(el('resident-phone').querySelector('.neighborhood-content'),{snapshot,members:[...members,{id:'user',name:'用户',avatar:''}],onClose:goBack});
  }
  async function planEditor(owner=planOwner){
    planOwner=owner;const [life,world,people]=await Promise.all([api('/world-life'),api('/world'),api('/characters')]);
    const person=people.find(p=>p.id===owner);if(!person||!world.state.residents.includes(owner))throw Error('请选择已入驻的人物');
    const box=el('resident-plan').querySelector('.neighborhood-content');box.textContent='';
    box.append(node('h2',person.name+'的生活安排'),node('p',life.plan_errors[owner]||life.schedules[owner]?.title||'待安排 · 可让人物提出计划，也可以手动调整。'));
    const title=node('input');title.value=life.schedules[owner]?.title||'生活安排';title.maxLength=160;title.setAttribute('aria-label','计划名称');box.append(title);
    const rows=node('div');box.append(rows);
    const labels={read:'读书',rest:'休息',sleep:'睡眠',walk:'散步',water:'照看盆栽',wait:'停留'};
    function add(step={location_id:world.room.id,activity:'rest',duration_minutes:30}){
      const row=node('div');row.className='plan-row';const location=node('select'),activity=node('select'),duration=node('input');
      location.setAttribute('aria-label','活动地点');activity.setAttribute('aria-label','活动内容');duration.setAttribute('aria-label','活动分钟数');
      for(const r of world.state.locations)location.append(new Option(r.name,r.id));for(const [id,name] of Object.entries(labels))activity.append(new Option(name,id));
      location.value=step.location_id;activity.value=step.activity;duration.type='number';duration.min=1;duration.max=360;duration.value=step.duration_minutes;
      row.append(location,activity,duration,button('移除',()=>row.remove()));rows.append(row);
    }
    for(const step of life.schedules[owner]?.steps||[undefined])add(step);
    box.append(button('添加活动',()=>{if(rows.children.length>=12)throw Error('最多十二项活动');add();}),button('保存手动调整',async()=>{
      const steps=[...rows.children].map(row=>({location_id:row.children[0].value,activity:row.children[1].value,duration_minutes:Number(row.children[2].value)}));
      await api('/world-life/plan','POST',{owner_id:owner,request_id:request(),plan:{title:title.value,steps}});toast('计划已保存，程序将按规则执行');await planEditor(owner);
    }),button('让人物重新安排（使用模型）',async()=>{
      await api('/world-life/retry-plan','POST',{owner_id:owner,request_id:request()});await api('/world-life/run','POST',{request_id:request()});await planEditor(owner);toast('安排结果已保存');
    }));
  }
  async function roster(){
    if(!isLocal())return;
    const [world,life]=await Promise.all([api('/world'),api('/world-life')]);
    for(const card of el('characters').children){
      const id=card.dataset.characterId;card.querySelector('.resident-status')?.remove();if(!world.state.residents.includes(id))continue;
      const status=node('div');status.className='resident-status';const p=world.state.positions[id],location=world.state.locations.find(r=>r.id===(p.location_id||'warm-room'));
      const activity=life.activities[id],schedule=life.schedules[id];status.append(node('p',location.name+' · '+(life.plan_errors[id]||({travel:'正在前往下一地点',blocked:'等待可用位置',activity:({read:'读书',rest:'休息',sleep:'睡眠',walk:'散步',water:'照看盆栽',wait:'停留'})[activity?.activity]})[activity?.phase]||(schedule?.state==='complete'?'上次计划已完成 · 待安排':schedule?.state==='blocked'?'活动受阻 · 待重新安排':schedule?.title)||'待安排')));
      status.append(button('查看手机',()=>navigate('resident-phone',{owner:id})),button('生活安排',()=>navigate('resident-plan',{owner:id})),button('人物形象',()=>worldUI.editLooks(id)));card.append(status);
    }
  }
  function desktop(){
    const box=el('desktop-layout').querySelector('.neighborhood-content');box.textContent='';box.append(node('p','世界、消息、人物固定在首排；其余应用可调整顺序。'));
    const grid=document.querySelector('.app-grid'),fixed=['world','chat','roster'],buttons=[...grid.children].filter(b=>!fixed.includes(b.dataset.app));
    buttons.forEach((b,index)=>{const row=node('div');row.className='desktop-order-row';row.append(node('span',b.textContent),button('上移',()=>{if(index===0)return;grid.insertBefore(b,buttons[index-1]);save();}),button('下移',()=>{if(index>=buttons.length-1)return;grid.insertBefore(buttons[index+1],b);save();}));box.append(row);});
    function save(){localStorage.setItem('t.desktop.order',JSON.stringify([...grid.children].map(b=>b.dataset.app)));desktop();}
  }
  async function scheduled(){
    if(stopped||scheduling||document.hidden||!isLocal())return;scheduling=true;
    try{
      await localReady;let life=await api('/world-life');if(!life.settings.enabled)return;
      await api('/world-life/tick','POST');
      for(let batch=0;batch<4;batch++){
        life=await api('/world-life');if(life.runs.some(r=>r.state==='running'||r.state==='uncertain'))break;
        if(!life.catching_up&&life.next_at&&Date.parse(life.next_at)>Date.now())break;
        await api('/world-life/run','POST',{request_id:'scheduled_'+request()});life=await api('/world-life');if(!life.catching_up)break;
      }
      if(!el('world').hidden)await worldUI.refresh({light:true});
      if(!el('roster').hidden)await roster();
    }catch(error){report(error);}finally{scheduling=false;}
  }
  scheduler=setInterval(scheduled,30000);const first=setTimeout(scheduled,1500);
  const visibility=()=>{if(!document.hidden)scheduled();};document.addEventListener('visibilitychange',visibility);
  const stop=()=>{stopped=true;clearInterval(scheduler);clearTimeout(first);document.removeEventListener('visibilitychange',visibility);};window.addEventListener('pagehide',stop,{once:true});
  return {roster,phone,planEditor,desktop,scheduled,leave(){},async open(name,options={}){
    if(name==='resident-phone')await phone(options.owner);
    if(name==='resident-plan')await planEditor(options.owner);
    if(name==='roster')await roster();
    if(name==='desktop-layout')desktop();
    if(name==='world-history-dialog')await worldUI.openHistory(options);
    if(name==='world-life-panel')await worldUI.openLife();
  }};
}
