// SPDX-License-Identifier: AGPL-3.0-only
import {DEFAULT_ACTION_PROMPT,normalizeChatStyle} from './chat-style.js';
const el=id=>document.getElementById(id);
const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;return b;};
export function applyAppearance(p={}){
  const root=document.documentElement,phone=document.querySelector('.phone');
  document.body.classList.toggle('dark',p.theme==='dark');
  root.style.setProperty('--font',Math.max(12,Math.min(24,Number(p.font_size)||16))+'px');
  root.style.fontFamily={system:'"Segoe UI","Microsoft YaHei",sans-serif',serif:'"Noto Serif SC","SimSun",serif',rounded:'"MiSans Rounded","YouYuan",sans-serif'}[p.font_family]||'"Segoe UI","Microsoft YaHei",sans-serif';
  phone.dataset.icons=p.icon_style||'soft';phone.dataset.motion=p.motion===false?'off':'on';
  const ink=c=>/^#[0-9a-f]{6}$/i.test(c||'')?(parseInt(c.slice(1,3),16)*.299+parseInt(c.slice(3,5),16)*.587+parseInt(c.slice(5,7),16)*.114>150?'#253c43':'#ffffff'):'var(--ink)';
  const colour=(c,fallback)=>/^#[0-9a-f]{6}$/i.test(c||'')?c:fallback;
  root.style.setProperty('--bubble-user',colour(p.bubble_user,'var(--soft)'));root.style.setProperty('--bubble-assistant',colour(p.bubble_assistant,'var(--paper)'));root.style.setProperty('--bubble-radius',Math.max(2,Math.min(28,Number(p.bubble_radius)||16))+'px');root.style.setProperty('--bubble-user-ink',ink(p.bubble_user));root.style.setProperty('--bubble-assistant-ink',ink(p.bubble_assistant));
  const palettes={forest:'radial-gradient(ellipse at 20% 5%,#e5edcd,transparent 45%),linear-gradient(155deg,#a9c5b0,#658f88 60%,#315b61)',dusk:'radial-gradient(ellipse at 20% 5%,#ffeed3,transparent 50%),linear-gradient(155deg,#dfb8bc,#a47f9b 65%,#555777)',sea:'radial-gradient(ellipse at 20% 5%,#e1f6ef,transparent 45%),linear-gradient(155deg,#abd3db,#6b9ab8 65%,#335779)'};
  const custom=p.wallpaper==='custom'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.wallpaper_image||'');
  el('home').style.backgroundImage=custom?'url('+JSON.stringify(p.wallpaper_image)+')':palettes[p.wallpaper]||palettes.forest;
  el('home').style.backgroundSize='cover';el('home').style.backgroundPosition='center';
}
export function mountPreferences({api,localReady,isLocal,isBusy,getCurrent,setCurrent,updated,toast}){
  const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
  let profiles=[],groups=[],active='',wallpaperImage='';
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
  async function refresh(prefs){
    const local=await localReady,p=await local.api('/appearance');wallpaperImage=p.wallpaper_image||'';
    for(const [id,key,fallback] of [['theme','theme','light'],['font-size','font_size',16],['wallpaper','wallpaper','forest'],['icon-style','icon_style','soft'],['font-family','font_family','system'],['bubble-user','bubble_user','#e0eee8'],['bubble-assistant','bubble_assistant','#ffffff'],['bubble-radius','bubble_radius',16]])el(id).value=p[key]??fallback;
    el('motion').checked=p.motion!==false;applyAppearance(p);
    el('profiles-card').hidden=!isLocal();el('profile-metadata').hidden=!isLocal();el('clear-key-label').hidden=!isLocal();el('profile-name').required=isLocal();
    if(!isLocal())return;
    [profiles,groups]=await Promise.all([api('/model-profiles'),api('/model-groups')]);active=prefs.active_profile_id;
    el('profile-group').replaceChildren(new Option('未分组',''),...groups.map(g=>new Option(g.name,g.id)));
    el('active-model-label').textContent='当前使用：'+(profiles.find(p=>p.id===active)?.name||'未选择连接');
    const groupBox=el('profile-groups');groupBox.replaceChildren();
    for(const g of groups){const line=document.createElement('div');line.className='actions';const label=document.createElement('span');label.textContent='▱ '+g.name;line.append(label,button('重命名',guard(async()=>{localOnly();const name=prompt('分组名称',g.name);if(name?.trim()){await api('/model-groups/'+g.id,'PATCH',{name});await updated();}})),button('移除分组',guard(async()=>{localOnly();if(confirm('移除分组？连接会移至未分组，不删除连接。')){await api('/model-groups/'+g.id,'DELETE');await updated();}})));groupBox.append(line);}
    const list=el('profile-list');list.replaceChildren();
    for(const g of [{id:'',name:'未分组'},...groups]){const entries=profiles.filter(p=>(p.group_id||'')===g.id);if(!entries.length)continue;const section=document.createElement('details');section.open=true;const title=document.createElement('summary');title.textContent='▱ '+g.name+' · '+entries.length;section.append(title,...entries.map(p=>row(p)));list.append(section);}
    editor(profiles.find(p=>p.id===active));
    const current=getCurrent();el('quick-actions').textContent='动作：'+(normalizeChatStyle(current?.chat_style).actions?'开':'关');
  }
  el('new-profile').onclick=guard(()=>{localOnly();editor();el('model-form').scrollIntoView({block:'start'});el('profile-name').focus();});
  el('new-group').onclick=guard(async()=>{localOnly();const name=prompt('新分组名称');if(name?.trim()){await api('/model-groups','POST',{name});await updated();}});
  el('model-form').onsubmit=guard(async e=>{e.preventDefault();if(!isLocal()){await api('/settings','PATCH',{base_url:el('base-url').value,model:el('model').value,...(el('api-key').value?{api_key:el('api-key').value}:{})});}else{localOnly();const id=el('profile-id').value;await api('/model-profiles'+(id?'/'+id:''),id?'PATCH':'POST',{name:el('profile-name').value,group_id:el('profile-group').value,base_url:el('base-url').value,model:el('model').value,protocol:el('protocol').value,api_key:el('api-key').value,clear_key:el('clear-key').checked});}await updated();toast('连接已保存；可点击切换使用');});
  el('switch-model').onclick=guard(async()=>{localOnly();await updated();el('model-switch-list').replaceChildren(...profiles.map(p=>row(p,true)));el('model-switch-dialog').showModal();});
  el('wallpaper-file').onchange=guard(async()=>{const file=el('wallpaper-file').files[0];if(!file)return;if(file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片');wallpaperImage=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取壁纸失败'));r.readAsDataURL(file);});el('wallpaper').value='custom';});
  el('appearance-form').onsubmit=guard(async e=>{e.preventDefault();const local=await localReady;const p={theme:el('theme').value,font_size:Number(el('font-size').value),wallpaper:el('wallpaper').value,wallpaper_image:wallpaperImage,icon_style:el('icon-style').value,font_family:el('font-family').value,bubble_user:el('bubble-user').value,bubble_assistant:el('bubble-assistant').value,bubble_radius:Number(el('bubble-radius').value),motion:el('motion').checked};if(p.wallpaper==='custom'&&!p.wallpaper_image)throw Error('请先上传壁纸');await local.api('/settings','PATCH',p);await updated();applyAppearance(p);toast('外观已保存');});
  el('chat-style-open').onclick=guard(()=>{localOnly();const c=getCurrent();if(!c)return;const s=normalizeChatStyle(c.chat_style);el('split-replies').checked=s.split;el('allow-actions').checked=s.actions;el('action-prompt').value=s.action_prompt;el('style-mode').value=s.mode;for(const [id,key,out]of [['action-weight','action_weight','action-value'],['emoji-weight','emoji','emoji-value'],['voice-weight','voice','voice-value']]){el(id).value=s[key];el(out).value=s[key];}el('details-dialog').close();el('chat-style-dialog').showModal();});
  for(const [id,out]of [['action-weight','action-value'],['emoji-weight','emoji-value'],['voice-weight','voice-value']])el(id).oninput=()=>el(out).value=el(id).value;
  el('chat-style-form').onsubmit=guard(async e=>{e.preventDefault();localOnly();const c=getCurrent(),chat_style={split:el('split-replies').checked,actions:el('allow-actions').checked,mode:el('style-mode').value,action_weight:Number(el('action-weight').value),emoji:Number(el('emoji-weight').value),voice:Number(el('voice-weight').value),action_prompt:el('action-prompt').value};setCurrent(await api('/contacts/'+c.id,'PATCH',{chat_style}));el('chat-style-dialog').close();await updated();toast('当前聊天风格已保存');});
  el('reset-action-prompt').onclick=()=>{el('action-prompt').value=DEFAULT_ACTION_PROMPT;};
  el('quick-actions').onclick=guard(async()=>{localOnly();const c=getCurrent();if(!c)return;const chat_style=normalizeChatStyle(c.chat_style);chat_style.actions=!chat_style.actions;setCurrent(await api('/contacts/'+c.id,'PATCH',{chat_style}));el('quick-actions').textContent='动作：'+(chat_style.actions?'开':'关');toast('动作描写已'+(chat_style.actions?'开启':'关闭'));});
  return {refresh};
}
