// SPDX-License-Identifier: AGPL-3.0-only
import {mountApiFloatingSwitcher} from './api-floating-switcher.js';
const el=id=>document.getElementById(id);
const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;return b;};
export function mountModelProfiles({api,isLocal,isBusy,updated,toast}){
  const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
  let profiles=[],groups=[],active='';
  const localOnly=()=>{if(!isLocal())throw Error('此项使用本机连接与聊天风格，请先在高级设置切回本机模式');if(isBusy())throw Error('请等待当前回复完成');};
  function editor(p){
    el('profile-id').value=p?.id||'';el('profile-name').value=p?.name||'';el('profile-group').value=p?.group_id||'';el('base-url').value=p?.base_url||'https://api.openai.com/v1';el('model').value=p?.model||'';el('api-key').value='';el('clear-key').checked=false;el('key-state').textContent=p?.has_api_key?'此连接密钥已保存；留空保留。':'此连接尚未配置密钥。';
  }
  function row(p,switcher=false){
    const row=document.createElement('article');row.className='connection-row';const name=document.createElement('strong');name.textContent=(p.id===active?'● ':'')+p.name;const info=document.createElement('small');info.textContent=(p.model||'未选模型')+' · '+(p.has_api_key?'已存密钥':'无密钥');row.append(name,info);
    row.append(button(p.id===active?'正在使用':'切换',guard(async()=>{localOnly();await api('/model-profiles/'+p.id+'/activate','POST');await updated();el('model-switch-dialog').close();toast('已切换到 '+p.name);})));row.lastChild.disabled=p.id===active;
    if(!switcher){row.append(button('编辑',()=>{editor(p);el('model-form').scrollIntoView({behavior:'smooth',block:'start'});}),button('删除',guard(async()=>{localOnly();if(!confirm('删除连接「'+p.name+'」及其密钥？聊天记录会保留。'))return;await api('/model-profiles/'+p.id,'DELETE');await updated();})));}
    return row;
  }
  const floating=mountApiFloatingSwitcher({open:guard(openModelSwitcher),toast});
  async function openModelSwitcher(){
    localOnly();await updated();
    const list=el('model-switch-list');list.replaceChildren();
    for(const group of [{id:'',name:'未分组'},...groups]){
      const entries=profiles.filter(p=>(p.group_id||'')===group.id);if(!entries.length)continue;
      const title=document.createElement('h3');title.textContent=group.name;list.append(title,...entries.map(p=>row(p,true)));
    }
    const help=document.createElement('p');help.className='subtle';help.textContent='切换当前聊天连接。记忆若已指定专用连接，会继续使用该连接；选择跟随时，才随聊天连接切换。';list.append(help);
    el('model-switch-dialog').showModal();
  }
  async function refresh(prefs){
    el('profiles-card').hidden=!isLocal();el('profile-metadata').hidden=!isLocal();el('clear-key-label').hidden=!isLocal();el('profile-name').required=isLocal();
    if(!isLocal()){floating.refresh({visible:false});return;}
    [profiles,groups]=await Promise.all([api('/model-profiles'),api('/model-groups')]);active=prefs.active_profile_id;
    floating.refresh({visible:true,label:profiles.find(p=>p.id===active)?.name});
    el('profile-group').replaceChildren(new Option('未分组',''),...groups.map(g=>new Option(g.name,g.id)));
    el('active-model-label').textContent='当前使用：'+(profiles.find(p=>p.id===active)?.name||'未选择连接');
    const groupBox=el('profile-groups');groupBox.replaceChildren();
    for(const g of groups){const line=document.createElement('div');line.className='actions';const label=document.createElement('span');label.textContent='▱ '+g.name;line.append(label,button('重命名',guard(async()=>{localOnly();const name=prompt('分组名称',g.name);if(name?.trim()){await api('/model-groups/'+g.id,'PATCH',{name});await updated();}})),button('移除分组',guard(async()=>{localOnly();if(confirm('移除分组？连接会移至未分组，不删除连接。')){await api('/model-groups/'+g.id,'DELETE');await updated();}})));groupBox.append(line);}
    const list=el('profile-list');list.replaceChildren();
    for(const g of [{id:'',name:'未分组'},...groups]){const entries=profiles.filter(p=>(p.group_id||'')===g.id);if(!entries.length)continue;const section=document.createElement('details');section.open=true;const title=document.createElement('summary');title.textContent='▱ '+g.name+' · '+entries.length;section.append(title,...entries.map(p=>row(p)));list.append(section);}
    editor(profiles.find(p=>p.id===active));
  }
  el('new-profile').onclick=guard(()=>{localOnly();editor();el('model-form').scrollIntoView({block:'start'});el('profile-name').focus();});
  el('new-group').onclick=guard(async()=>{localOnly();const name=prompt('新分组名称');if(name?.trim()){await api('/model-groups','POST',{name});await updated();}});
  el('model-form').onsubmit=guard(async e=>{e.preventDefault();if(!isLocal()){await api('/settings','PATCH',{base_url:el('base-url').value,model:el('model').value,...(el('api-key').value?{api_key:el('api-key').value}:{})});}else{localOnly();const id=el('profile-id').value;await api('/model-profiles'+(id?'/'+id:''),id?'PATCH':'POST',{name:el('profile-name').value,group_id:el('profile-group').value,base_url:el('base-url').value,model:el('model').value,protocol:el('protocol').value,api_key:el('api-key').value,clear_key:el('clear-key').checked});}await updated();toast('连接已保存；可点击切换使用');});
  el('switch-model').onclick=guard(openModelSwitcher);
  return {refresh};
}
