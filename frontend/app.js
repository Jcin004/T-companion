// SPDX-License-Identifier: AGPL-3.0-only
import {installMemoryShell,mountMemoryUI} from './memory-ui.js';
import {installWorldShell,mountWorldUI,showWorldSource} from './world-ui.js';
import {createSseJsonParser} from './sse-json.js';
import {createLocalService} from './local-service.js';
import {copyText,mountTextEditing} from './text-editing.js';
import {replyParts,normalizeChatStyle} from './chat-style.js';
import {mountPreferences,applyAppearance} from './preferences-ui.js';
import {mountChatSettings} from './chat-settings-ui.js';
import {mountDialogNavigation} from './dialog-navigation.js';
import {mountAppUpdate} from './app-update.js';
import {DiagnosticStore,diagnosticPersistence,mountDiagnostics} from './diagnostics.js';
import {installArchiveShell,mountArchiveUI} from './character-archive-ui.js';

// Android 11's bundled WebView predates this DOM convenience method.
if(!Element.prototype.replaceChildren)Object.defineProperty(Element.prototype,'replaceChildren',{configurable:true,writable:true,value:function(...nodes){while(this.firstChild)this.removeChild(this.firstChild);this.append(...nodes);}});

installMemoryShell();
installWorldShell();
installArchiveShell();
let memoryUI;
let worldUI;
let archiveUI;
const el = id => document.getElementById(id);
const native = window.Capacitor?.isNativePlatform?.() || /Capacitor|; wv\)/.test(navigator.userAgent);
const device = native ? (window.Capacitor?.Plugins?.TDevice || window.Capacitor?.registerPlugin?.('TDevice')) : null;
const localPlugin = native ? window.Capacitor?.Plugins?.TLocal : null;
const diagnostics=new DiagnosticStore(diagnosticPersistence(localPlugin));
const diagnosticsReady=diagnostics.init();
const localReady = native && !localPlugin ? Promise.reject(Error('本机模块未加载，请安装新版 APK')) : diagnosticsReady.then(()=>createLocalService(localPlugin,diagnostics));
let mode = localStorage.getItem('t.data-mode') || 'local', activeApp='home', chatOpen=false;
let nativeVoices = [];
let backend = localStorage.getItem('t.backend') || (native ? '' : location.origin);
let token = localStorage.getItem('t.token') || '';
let prefs = {}, characters = [], contacts = [], current = null, items = [];
let hasBefore = false, hasAfter = false, busy = false, loading = false, epoch = 0;
let avatarData = '', searchCursor = null, searchQuery = '', toastTimer;
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const key = (name, sid = current?.id) => `t.${mode==='local'?'local':backend}.${name}.${sid}`;
function outbox(){const saved=JSON.parse(localStorage.getItem(key('outbox'))||'[]');return Array.isArray(saved)?saved:[saved];}
function keepPending(message){const entries=outbox().filter(m=>m.request_id!==message.request_id);entries.push(message);localStorage.setItem(key('outbox'),JSON.stringify(entries));}
function removePending(rid){localStorage.setItem(key('outbox'),JSON.stringify(outbox().filter(m=>m.request_id!==rid)));}
const guard = fn => (...args) => {try {return Promise.resolve(fn(...args)).catch(e => {reportError(e);toast(e.message);});} catch(e) {reportError(e);toast(e.message);}};
function toast(text) { el('toast').textContent = text; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').hidden = true, 4500); }
mountTextEditing({messages:el('messages'),input:el('input'),toast});
function reportError(error,source='界面'){diagnostics.record('error',source,{error:error?.message||String(error)});}
window.addEventListener('error',event=>{if(event.error||event.message)reportError(event.error||event.message,'页面报错');});
window.addEventListener('unhandledrejection',event=>reportError(event.reason,'未处理异常'));
for(const event of ['online','offline','pagehide','pageshow'])window.addEventListener(event,()=>diagnostics.record('system',event,{visibility:document.visibilityState}));
document.addEventListener('visibilitychange',()=>diagnostics.record('system','前后台变化',{visibility:document.visibilityState}));
function headers() { return {'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})}; }
function last(values){return values[values.length-1];}
function abortAfter(ms){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);return {signal:controller.signal,clear:()=>clearTimeout(timer)};}
async function api(path, method = 'GET', body) {
  diagnostics.rememberSecret(body?.api_key);diagnostics.rememberSecret(token);
  if(mode==='local')return (await localReady).api(path,method,body);
  if (!backend) throw Error('请在高级设置中填写后端 HTTPS 地址');
  const deadline=abortAfter(25000);
  try{
    const response = await fetch(backend + '/api/v1' + path, {method, headers:headers(), body:body === undefined ? undefined : JSON.stringify(body), signal:deadline.signal});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '请检查输入内容（'+response.status+'）');
    return data;
  }finally{deadline.clear();}
}
function date(stamp) { return new Date(stamp.includes('T') ? stamp + (/[Z+]\d*:?\d*$/.test(stamp) ? '' : 'Z') : stamp.replace(' ', 'T')+'Z'); }
function time(stamp, full = false) {
  if (!stamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {timeZone:prefs.timezone || 'Asia/Shanghai', ...(full ? {month:'2-digit',day:'2-digit'} : {}), hour:'2-digit',minute:'2-digit',hour12:false}).format(date(stamp));
}
function todayMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:prefs.timezone || 'Asia/Shanghai',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  return parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
}
function character() { return characters.find(c => c.id === current?.character_id); }
function avatar(c, user = false) {
  const a = node('span', 'avatar', user ? '我' : (c?.name || 'T').slice(0, 1));
  if (c?.avatar && !user) { const img = node('img'); img.src = c.avatar; img.alt = c.name; a.replaceChildren(img); }
  return a;
}
const dialogs=mountDialogNavigation({canReturn:()=>activeApp==='chat'&&chatOpen});
function app(name) {
  dialogs.dismissAll();
  if(name==='chat')refreshContacts().catch(e=>{reportError(e);toast(e.message);});
  worldUI?.leave();
  archiveUI?.leave();
  if(name==='archive')archiveUI?.refresh().catch(e=>{reportError(e);toast(e.message);});
  if(name==='world')worldUI?.refresh().catch(e=>{reportError(e);toast(e.message);});
  if(name==='memory'||name==='self')memoryUI?.refresh(name);
  saveDraft();activeApp=name;document.querySelector('.phone').classList.toggle('on-desktop',name==='home');
  for (const page of document.querySelectorAll('.screen')) page.hidden = page.id !== name;
  for (const button of document.querySelectorAll('[data-app]')) button.classList.toggle('active', button.dataset.app === name);
  document.querySelector('.phone').classList.toggle('in-chat', name === 'chat' && chatOpen);
  if(name==='settings'&&device)device.voices().then(data=>{nativeVoices=data.voices;voiceOptions(el('voice'),prefs.voice);}).catch(()=>{});
}
function seen() { if (current && !document.hidden && !hasAfter){const id=Math.max(0,...items.filter(m=>m.role==='assistant').map(m=>m.id));localStorage.setItem(key('seen'),String(id));if(mode==='local'&&id)api('/contacts/'+current.id+'/read','POST',{message_id:id}).catch(reportError);} }
function renderContacts() {
  el('contacts').replaceChildren();
  for (const c of contacts) {
    const who = characters.find(p => p.id === c.character_id);
    const b = node('button','contact'+(current?.id===c.id ? ' selected' : ''));
    const info = node('div','contact-info'), line = node('div','contact-line');
    line.append(node('strong','',c.note || who?.name || c.title),node('time','',time(c.last_time)));
    info.append(line,node('p','',c.last_message || '从一句问候开始'));
    b.append(avatar(who),info);
    if (c.unread_shares || (c.last_assistant_id || 0) > Number(localStorage.getItem(key('seen',c.id)) || 0)) b.append(node('span','unread'));
    b.onclick = guard(() => openContact(c)); el('contacts').append(b);
  }
}
async function refreshContacts() { contacts = await api('/contacts'); renderContacts(); }
function renderCharacters() {
  el('characters').replaceChildren();
  for (const c of characters) {
    const card = node('article','card'), top = node('div','character-top'); top.append(avatar(c),node('h2','',c.name));
    const actions = node('div','actions'), talk = node('button','primary','发起聊天'), edit = node('button','','编辑资料');
    talk.onclick = guard(async () => { if (busy) throw Error('请等待当前回复完成'); const contact = await api('/contacts','POST',{character_id:c.id}); await refreshContacts(); await openContact(contact); });
    edit.onclick = () => editCharacter(c);
    actions.append(talk,edit); card.append(top,node('p','identity-preview',c.identity || '身份尚未填写'),actions); el('characters').append(card);
  }
}
function renderHeader() {
  el('title').textContent = (current.mode==='world'?'场景 · ':'')+(current.note || character()?.name || current.title);
  el('head-avatar').replaceChildren(avatar(character()));
  document.querySelector('.conversation').style.background = prefs.theme === 'dark' && current.background === '#eef2f3' ? 'var(--chat)' : current.background;
  el('input').disabled = false; el('send').disabled = busy;
  el('quick-actions').textContent='动作：'+(normalizeChatStyle(current.chat_style).actions?'开':'关');
}
function status(text) { el('status').textContent = text; }
function renderReply(container,text,style,partial=false){
  container.replaceChildren();
  for(const part of replyParts(text,style,partial)){
    const b=node(part.type==='voice'?'button':'div','bubble reply-'+part.type,part.type==='voice'?'▷ 语音 · '+part.text:part.text);
    if(part.type==='voice'){b.type='button';b.setAttribute('aria-label','朗读语音消息');b.onclick=()=>speak(part.text,current?.voice||prefs.voice);}
    container.append(b);
  }
}
function makeMessage(m) {
  const row = node('article','message '+m.role+(m.state==='failed'?' failed':'')); row.dataset.id = m.id;
  const body = node('div','message-body'), bubble = node('div',m.role==='assistant'?'reply-bubbles':'bubble',m.role==='assistant'?null:m.content), tools = node('div','message-tools');
  if(m.role==='assistant')renderReply(bubble,m.content,m.chat_style||current?.chat_style,m.state==='generating');
  const visibleText=m.role==='assistant'?replyParts(m.content,m.chat_style||current?.chat_style).map(p=>p.text).join('\n\n'):m.content;
  const copy = node('button','','复制'); copy.type = 'button'; copy.onclick = guard(async () => { await copyText(visibleText); toast('已复制'); });
  tools.append(node('span','state',m.role==='user' ? ({generating:'正在生成',failed:'生成失败',cancelled:'已停止',interrupted:'上次生成中断',sending:'发送中',complete:'已发送'}[m.state] || '已发送') : (m.state&&m.state!=='complete'?({generating:'正在生成',failed:'部分回复 · 未完成',cancelled:'已停止 · 未完成',interrupted:'中断 · 未完成'}[m.state]||m.state):time(m.created_at))),copy);
  if(m.origin==='world_share'){
    tools.append(node('small','','主动分享'));
    const source=node('button','','事件来源');source.onclick=guard(()=>showWorldSource(api,{event_id:m.source_event_id},m.source_owner_id));
    const world=node('button','','到世界询问');world.onclick=()=>app('world');tools.append(source,world);
  }
  if (m.role==='assistant' && (device || 'speechSynthesis' in window)) { const read = node('button','','朗读'); read.onclick = () => speak(replyParts(m.content,m.chat_style||current?.chat_style).filter(p=>p.type==='text'||p.type==='voice').map(p=>p.text).join('\n'),current.voice || prefs.voice); tools.append(read); }
  if (m.role==='user' && (['failed','sending','cancelled','interrupted'].includes(m.state))) { const retry = node('button','retry','重试'); retry.onclick = guard(()=>sendMessage(m.content,m.request_id)); tools.append(retry); }
  body.append(bubble,tools); row.append(avatar(character(),m.role==='user'),body); return row;
}
function renderMessages() {
  const frag = document.createDocumentFragment(); let previous = null;
  for (const m of items) {
    if(m.role==='assistant'&&!m.content)continue;
    if (!previous || Math.abs(date(m.created_at)-date(previous.created_at)) > 300000) frag.append(node('div','stamp',time(m.created_at,true)));
    frag.append(makeMessage(m)); previous = m;
  }
  if (!items.length) frag.append(node('div','empty','从一句问候开始。'));
  el('messages').replaceChildren(frag); el('latest').hidden = !hasAfter; seen();
}
function saveDraft() { if(current){const sid=current.id,text=el('input').value;localStorage.setItem(key('draft'),text);if(mode==='local')localReady.then(service=>service.api(`/contacts/${sid}/draft`,'PATCH',{text})).catch(e=>toast(e.message));} }
async function openContact(c) {
  if(current?.id===c.id){chatOpen=true;app('chat');return;}
  if (busy) { toast('请等待当前回复完成'); return; }
  saveDraft(); chatOpen=true;current = c; epoch++; loading = false; items = [];
  el('input').value = localStorage.getItem(key('draft')) || (mode==='local'?(await (await localReady).api(`/contacts/${c.id}/draft`)).text:'') || '';
  renderHeader(); app('chat'); renderContacts();
  await loadLatest();
}
async function loadLatest() {
  if (!current) return;
  const version = ++epoch, sid = current.id;
  const page = await api(`/contacts/${sid}/messages`);
  if (epoch !== version) return;
  items = page.items; hasBefore = page.has_before; hasAfter = page.has_after;
  const pending = outbox().filter(m=>!items.some(saved=>saved.request_id===m.request_id));
  localStorage.setItem(key('outbox'),JSON.stringify(pending));
  items.push(...pending);
  renderMessages(); el('messages').scrollTop = el('messages').scrollHeight;
  status(items.some(m=>m.state==='generating') ? '正在生成回复' : (mode==='local'?'记录保存在本机':'记录来自共同后端')); renderContacts();
}
function viewportAnchor() {
  const box = el('messages').getBoundingClientRect();
  const row = [...el('messages').querySelectorAll('.message')].find(n=>n.getBoundingClientRect().bottom > box.top);
  return row ? {id:row.dataset.id, y:row.getBoundingClientRect().top-box.top} : null;
}
function restoreAnchor(anchor) {
  if (!anchor) return;
  const row = [...el('messages').querySelectorAll('.message')].find(n=>n.dataset.id===anchor.id);
  if (row) el('messages').scrollTop += row.getBoundingClientRect().top-el('messages').getBoundingClientRect().top-anchor.y;
}
async function loadEdge(direction) {
  if (!current || loading || busy || !items.length || !(direction==='before'?hasBefore:hasAfter)) return;
  loading = true; const version = epoch, sid = current.id, anchor = viewportAnchor();
  try {
    const cursor = direction==='before'?items[0].id:last(items).id;
    const page = await api(`/contacts/${sid}/messages?${direction}=${cursor}`);
    if (version !== epoch) return;
    const merged = direction==='before'?[...page.items,...items]:[...items,...page.items];
    items = [...new Map(merged.map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);
    if (direction==='before') { hasBefore = page.has_before; if (items.length>160) {items=items.slice(0,160);hasAfter=true;} }
    else { hasAfter=page.has_after; if (items.length>160) {items=items.slice(-160);hasBefore=true;} }
    renderMessages(); restoreAnchor(anchor);
  } finally { if (version === epoch) loading = false; }
}
async function jump(id) {
  if (busy) throw Error('请等待当前回复完成');
  const version = ++epoch, sid = current.id; loading = false;
  const page = await api(`/contacts/${sid}/messages?anchor=${id}`);
  if (epoch!==version) return;
  items=page.items;hasBefore=page.has_before;hasAfter=page.has_after;renderMessages();
  dialogs.dismissAll();
  el('messages').querySelector(`[data-id="${Number(id)}"]`)?.scrollIntoView({block:'center'});
}
function requestId() { return crypto.randomUUID?.() || 'turn_'+Date.now()+'_'+Math.random().toString(36).slice(2); }
async function sendMessage(content, rid = requestId()) {
  if (busy || !current || !content.trim()) return;
  if(outbox().length>=20&&!outbox().some(m=>m.request_id===rid))throw Error('已有 20 条未发送消息，请先重试待发消息');
  if (hasAfter) await loadLatest();
  busy=true;el('send').disabled=true;el('cancel-generation').hidden=mode!=='local';status('正在发送');
  const sid = current.id;
  const pending = {id:'pending_'+rid,role:'user',content:content.trim(),request_id:rid,state:'sending',created_at:new Date().toISOString()};
  keepPending(pending);
  if (!items.some(m=>m.request_id===rid)) items.push(pending);
  el('input').value='';saveDraft();renderMessages();el('messages').scrollTop=el('messages').scrollHeight;
  let remoteLog;
  const live = makeMessage({id:'stream',role:'assistant',content:'',created_at:new Date().toISOString()});
  el('messages').append(live); const bubble=live.querySelector('.reply-bubbles'); let complete=false,liveText='',liveStyle=current.chat_style;
  const appendChunk=text=>{liveText+=text;renderReply(bubble,liveText,liveStyle,true);};
  const deadline=abortAfter(190000);
  const accepted=()=>{pending.state='generating';for(const row of el('messages').querySelectorAll('.message.user'))if(row.dataset.id===String(pending.id)){row.querySelector('.state').textContent='正在生成';row.querySelector('.retry')?.remove();}status('正在生成回复');};
  try {
    if(mode==='local'){await (await localReady).stream(sid,pending.content,rid,(kind,data)=>{if(kind==='accepted'){liveStyle=data.chat_style||liveStyle;accepted();}if(kind==='memory-status')toast(data.message);if(kind==='delta'){const box=el('messages'),stick=box.scrollHeight-box.scrollTop-box.clientHeight<100;appendChunk(data.text);if(stick)box.scrollTop=box.scrollHeight;}if(kind==='complete')complete=true;});}
    else {
    diagnostics.rememberSecret(token);remoteLog=diagnostics.begin({source:'remote',session_id:sid,request_id:rid,context_omitted:'等待后端返回实际请求快照'});
    const response = await fetch(backend+`/api/v1/contacts/${sid}/stream`,{method:'POST',headers:headers(),body:JSON.stringify({message:pending.content,request_id:rid,capture_context:diagnostics.state.capture_context}),signal:deadline.signal});
    if (!response.ok) { const data=await response.json();throw Error(typeof data.detail==='string'?data.detail:'发送失败'); }
    const reader=response.body.getReader(), decoder=new TextDecoder(), parser=createSseJsonParser(); let buffer='';
    const consume = eventText => {
      const kind = eventText.match(/^event:\s*(\w+)/m)?.[1];
      for (const data of parser.pushEvent(eventText)) {
        if (kind==='accepted') accepted();
        if (kind==='diagnostic') diagnostics.update(remoteLog,data);
        if (kind==='delta') {const stick=el('messages').scrollHeight-el('messages').scrollTop-el('messages').clientHeight<100;appendChunk(data.text);if(stick)el('messages').scrollTop=el('messages').scrollHeight;}
        if (kind==='complete') complete=true;
        if (kind==='failed') {diagnostics.update(remoteLog,{error_type:data.error_type,http_status:data.http_status});throw Error(data.detail);}
      }
    };
    while (true) {
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      buffer=buffer.replace(/\r\n/g,'\n');let end;
      while ((end=buffer.indexOf('\n\n'))>=0) {consume(buffer.slice(0,end));buffer=buffer.slice(end+2);}
      if(done){if(buffer.trim())consume(buffer);break;}
    }
    }
    if(!complete)throw Error('连接中断，请重试这条消息');
    if(remoteLog)diagnostics.update(remoteLog,{state:'complete',response_chars:liveText.length});
    removePending(rid);
  } catch(e) {if(remoteLog)diagnostics.update(remoteLog,{state:'failed',error:e.message,response_chars:liveText.length});else reportError(e,'聊天发送失败');toast(e.message);pending.state='failed';keepPending(pending);}
  finally {
    deadline.clear();
    try {await loadLatest();await refreshContacts();} catch(e) {items=items.filter(m=>m.request_id!==rid);items.push({...pending,state:'failed'});renderMessages();status('同步失败，可重试');}
    finally{busy=false;el('send').disabled=false;el('cancel-generation').hidden=true;}
  }
}
function editCharacter(c) {
  avatarData=c?.avatar||'';el('character-id').value=c?.id||'';el('character-name').value=c?.name||'';el('character-identity').value=c?.identity||'';el('character-style').value=c?.style||'';el('character-avatar').value='';
  el('character-dialog-title').textContent=c?'编辑角色':'新建角色';el('avatar-preview').replaceChildren(avatar(c));if(el('details-dialog').open)dialogs.openChild('character-dialog','details-dialog');else el('character-dialog').showModal();
}
function voiceOptions(select, value, inherit=false) {
  select.replaceChildren(new Option(inherit?'使用全局声音':'设备默认声音',''));
  for (const v of device ? nativeVoices : window.speechSynthesis?.getVoices()||[]) select.add(new Option(v.name+' · '+v.lang,v.voiceURI));
  if(value && ![...select.options].some(o=>o.value===value))select.add(new Option('已保存声音（本设备不可用）',value));
  select.value=value||'';
}
function speak(text, voice) {
  if(device){device.speak({text,voice:voice||''}).catch(e=>toast(e.message));return;}
  if(!window.speechSynthesis || !speechSynthesis.getVoices().length){toast('当前设备未提供朗读声音');return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.voice=speechSynthesis.getVoices().find(v=>v.voiceURI===voice)||null;speechSynthesis.speak(utterance);
}
function showPreferences() {
  chatSettings.refresh();
  el('backend').value=backend;el('token').value=token;el('base-url').value=prefs.base_url||'https://api.openai.com/v1';el('model').value=prefs.model||'';el('api-key').value='';el('data-mode').value=mode;el('protocol').value=prefs.protocol||'openai-chat';el('key-state').textContent=(prefs.has_api_key?'密钥已保存。':'尚未配置密钥。')+(mode==='remote'?'密钥由后端保存。':native?'Android 使用 Keystore 加密保存；不会回显完整密钥。':'浏览器密钥保存在当前站点 localStorage，同源脚本可读取，保护弱于 Android Keystore。');
  el('theme').value=prefs.theme||'light';el('font-size').value=prefs.font_size||16;el('timezone').value=prefs.timezone||'Asia/Shanghai';voiceOptions(el('voice'),prefs.voice);
  applyAppearance(prefs);
}
async function initialize() {
  const [p,c,list]=await Promise.all([api('/settings'),api('/characters'),api('/contacts')]);prefs=p;characters=c;contacts=list;showPreferences();await preferences.refresh(prefs);renderCharacters();renderContacts();status(mode==='local'?'记录保存在本机':'记录来自共同后端');
}
async function calendar() {
  const month=el('month').value;if(!month)return;const days=await api(`/contacts/${current.id}/calendar?month=${month}`);
  el('calendar').replaceChildren();el('calendar-zone').textContent='记录时区：'+prefs.timezone;
  for(const day of ['日','一','二','三','四','五','六'])el('calendar').append(node('small','',day));
  const [year,m]=month.split('-').map(Number);const count=new Date(Date.UTC(year,m,0)).getUTCDate(),offset=new Date(Date.UTC(year,m-1,1)).getUTCDay();
  for(let n=0;n<offset;n++)el('calendar').append(node('span'));
  const summaries=mode==='local'?await api('/summaries?owner='+encodeURIComponent(current.character_id)):[];
  for(let d=1;d<=count;d++){
    const day=month+'-'+String(d).padStart(2,'0'),b=node('button','',d),cell=node('div','calendar-day');b.disabled=!days[day];b.onclick=guard(()=>jump(days[day]));cell.append(b);
    if(mode==='local'&&days[day]){const card=summaries.find(s=>s.day===day),marker=node('button','daily-marker',card?'· 总结':'＋ 总结');marker.title=card?.content||'生成当天总结';marker.dataset.day=day;marker.onclick=guard(()=>memoryUI.openDaily(current.character_id,day));cell.append(marker);}
    el('calendar').append(cell);
  }
}
async function search(more=false) {
  if(!more){searchQuery=el('search-query').value.trim();searchCursor=null;el('search-results').replaceChildren();}
  if(!searchQuery)return;
  const results=await api(`/contacts/${current.id}/search?q=${encodeURIComponent(searchQuery)}${searchCursor?'&before='+searchCursor:''}`);
  if(!results.length&&!more)el('search-results').textContent='没有找到相关记录';
  for(const m of results){const b=node('button','search-result');b.append(node('small','',time(m.created_at,true)),node('span','',m.content.slice(0,240)));b.onclick=guard(()=>jump(m.id));el('search-results').append(b);}
  searchCursor=last(results)?.id;el('more-search').hidden=results.length<50;
}
for(const b of document.querySelectorAll('[data-app]'))b.onclick=()=>app(b.dataset.app);
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
el('new-chat').onclick=()=>app('roster');el('add-character').onclick=()=>editCharacter();
el('back').onclick=()=>{saveDraft();chatOpen=false;app('chat');};
for(const b of document.querySelectorAll('[data-home]'))b.onclick=()=>app('home');
el('home-button').onclick=()=>app('home');
el('cancel-generation').onclick=guard(async()=>{(await localReady).cancel();});
function clock(){el('clock').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());el('desktop-date').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());}clock();setInterval(clock,10000);
if(window.visualViewport){const resize=()=>{if(innerWidth<500)document.querySelector('.phone').style.height=visualViewport.height+'px';};visualViewport.addEventListener('resize',resize);resize();}
el('input').oninput=saveDraft;
el('input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();el('composer').requestSubmit();}};
el('composer').onsubmit=guard(e=>{e.preventDefault();return sendMessage(el('input').value);});
el('messages').onscroll=guard(async()=>{const box=el('messages');el('latest').hidden=!hasAfter&&box.scrollHeight-box.scrollTop-box.clientHeight<250;if(box.scrollTop<100)await loadEdge('before');else if(box.scrollHeight-box.scrollTop-box.clientHeight<100)await loadEdge('after');});
el('latest').onclick=guard(loadLatest);
el('character-avatar').onchange=guard(async()=>{const file=el('character-avatar').files[0];if(!file)return;if(file.size>400000)throw Error('头像不能超过 400 KB');avatarData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});el('avatar-preview').replaceChildren(avatar({name:el('character-name').value,avatar:avatarData}));});
el('clear-avatar').onclick=()=>{avatarData='';el('character-avatar').value='';el('avatar-preview').replaceChildren();};
el('character-form').onsubmit=guard(async e=>{e.preventDefault();const id=el('character-id').value;await api('/characters'+(id?'/'+id:''),id?'PUT':'POST',{name:el('character-name').value,avatar:avatarData,identity:el('character-identity').value,style:el('character-style').value});characters=await api('/characters');renderCharacters();renderContacts();if(current)renderHeader();el('character-dialog').close();toast('角色已保存');});
el('edit-current').onclick=()=>{editCharacter(character());};
el('history-open').onclick=guard(async()=>{dialogs.openChild('history-dialog','details-dialog');el('search-results').replaceChildren();el('more-search').hidden=true;el('month').value=todayMonth();await calendar();});
el('month').onchange=guard(calendar);el('search-form').onsubmit=guard(e=>{e.preventDefault();return search();});el('more-search').onclick=guard(()=>search(true));
el('connection-form').onsubmit=guard(async e=>{
  e.preventDefault();if(busy)throw Error('请等待当前回复完成');const desired=el('data-mode').value;
  if(desired==='remote'){
    const candidate=new URL(el('backend').value||location.origin);
    if(candidate.username||candidate.password||candidate.search||candidate.hash||!['https:','http:'].includes(candidate.protocol))throw Error('后端地址格式不正确');
    if(candidate.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(candidate.hostname))throw Error('远程后端必须使用 HTTPS');
    backend=candidate.href.replace(/\/$/,'');token=el('token').value.trim();localStorage.setItem('t.backend',backend);localStorage.setItem('t.token',token);
  }
  const previous=mode;saveDraft();mode=desired;current=null;chatOpen=false;epoch++;
  try{await api('/health');await initialize();localStorage.setItem('t.data-mode',mode);el('connection-result').textContent=mode==='local'?'已切换本机；记录未上传':'已连接后端；本机记录保持独立';}catch(e){mode=previous;await initialize();throw e;}
});
el('test-model').onclick=guard(async()=>{el('model-result').textContent='正在测试（会产生一次极短模型请求）…';try{await api('/settings/test','POST');el('model-result').textContent='连接成功，模型已响应';}catch(e){el('model-result').textContent=e.message;}});
el('sound-form').onsubmit=guard(async e=>{e.preventDefault();const body={timezone:el('timezone').value,voice:el('voice').value};prefs=await api('/settings','PATCH',body);showPreferences();if(current){renderHeader();renderMessages();}toast('声音与时间已保存');});
el('preview-voice').onclick=()=>speak('你好，今天想和我聊些什么？',el('voice').value);
if(window.speechSynthesis)speechSynthesis.onvoiceschanged=()=>voiceOptions(el('voice'),prefs.voice);
async function exportBlob(blob,name){
  if(device){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));await device.exportFile({name,base64:btoa(binary)});return;}
  const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
el('backup').onclick=guard(async()=>{const data=await api('/backup');await exportBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'t-chat-'+todayMonth()+'.json');toast('备份已导出');});
async function restoreData(data){if(!confirm('恢复将替换当前数据源全部角色和记录。请先导出备份。继续恢复？'))return;await api('/backup/restore','POST',data);current=null;chatOpen=false;epoch++;await initialize();items=[];for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.startsWith('t.'+(mode==='local'?'local':backend)+'.'))localStorage.removeItem(k);}app('settings');el('messages').replaceChildren();el('input').disabled=true;el('send').disabled=true;el('title').textContent='请选择联系人';el('backup-result').textContent='恢复成功；密钥保留当前设备配置';}
el('restore').onchange=guard(async()=>{const file=el('restore').files[0];el('restore').value='';if(!file)return;if(file.size>20000000)throw Error('备份文件超过 20 MB');await restoreData(JSON.parse(await file.text()));});
if(device){el('restore').closest('label').style.display='none';const importButton=node('button','','选择备份恢复');importButton.id='native-restore';importButton.onclick=guard(async()=>{if(busy)throw Error('请先停止生成再恢复');const file=await device.importFile();await restoreData(JSON.parse(file.data));});el('backup').after(importButton);}
window.addEventListener('pagehide',saveDraft);
setInterval(async()=>{if((mode==='remote'&&!backend)||busy||document.hidden)return;try{await refreshContacts();const remote=contacts.find(c=>c.id===current?.id);const lastId=last(items.filter(m=>m.role==='assistant'))?.id||0;if(current&&(items.some(m=>m.state==='generating')||(remote?.last_assistant_id||0)>lastId)){const box=el('messages');if(!hasAfter&&box.scrollHeight-box.scrollTop-box.clientHeight<180)await loadLatest();else el('latest').hidden=false;}}catch(e){status('连接中断，正在等待恢复');}},5000);
window.addEventListener('focus',guard(async()=>{if((mode==='local'||backend)&&!busy){await refreshContacts();const box=el('messages');if(current&&!hasAfter&&box.scrollHeight-box.scrollTop-box.clientHeight<180)await loadLatest();}}));
el('backend').value=backend;el('token').value=token;
const legal=node('section','card');legal.append(node('h2','','关于与更新'),node('p','','T- 0.16.0 试用版 · versionCode 24 · io.jcin.tcompanion · AGPL-3.0-only。软件按现状提供，不附带任何保证。可按许可证修改与再分发应用代码；导入的个人数据保留原有权利。'));
const legalLink=node('a','','许可、署名与复用记录 →');legalLink.href=new URL('legal.html',import.meta.url).href;
const sourceButton=node('button','','对应源码');sourceButton.onclick=guard(async()=>{if(mode==='local'){toast('对应源码在试用分发包的 T-companion-0.16.0-source.zip 中，包含构建说明与许可证。');return;}const response=await fetch(backend+'/api/v1/source',{headers:headers()});if(!response.ok)throw Error('源码导出失败，请检查后端连接和访问口令');await exportBlob(await response.blob(),'t-chat-source.zip');});
legal.append(legalLink,node('p','','默认渠道：公开 GitHub 试用版；可在下方设置自建更新清单。覆盖安装保留角色、聊天和设置。'),sourceButton);document.querySelector('.settings-grid').append(legal);
mountAppUpdate(legal,native?window.Capacitor?.Plugins?.TUpdate:null,()=>busy,(label,data)=>diagnostics.record('update',label,data));
mountDiagnostics({store:diagnostics,exportFile:exportBlob,report:e=>{reportError(e,'日志导出失败');toast(e.message);},preview:async()=>{
  if(mode!=='local')throw Error('共同后端模式请查看发送后的实际请求记录，草稿预览仅支持本机模式。');
  if(!current)throw Error('请先打开一个聊天，再回到这里查看预览。');
  return api(`/contacts/${current.id}/context-preview`,'POST',{message:el('input').value});
}});
diagnosticsReady.then(()=>diagnostics.record('system','应用启动',{version:'0.16.0-trial',platform:native?'android':'browser'}));
window.tGoBack=()=>{const dialog=last([...document.querySelectorAll('dialog[open]')]);if(dialog){if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();return true;}const phone=document.querySelector('.phone');if(phone.classList.contains('in-chat')){chatOpen=false;app('chat');return true;}if(activeApp!=='home'){app('home');return true;}return false;};
async function refreshSettings(){
 prefs=await api('/settings');showPreferences();await preferences.refresh(prefs);
 await refreshContacts();if(current&&!busy){renderHeader();renderMessages();}
}
const chatSettings=mountChatSettings({api,isLocal:()=>mode==='local',isBusy:()=>busy,
 getCurrent:()=>current,setCurrent:c=>{current=c;},getPrefs:()=>prefs,setPrefs:p=>{prefs=p;},
 voiceOptions,updated:refreshSettings,toast,dialogs});
const preferences=mountPreferences({api,localReady,isLocal:()=>mode==='local',isBusy:()=>busy,updated:refreshSettings,toast});
archiveUI=mountArchiveUI({api,localReady,isLocal:()=>mode==='local',toast,report:e=>reportError(e,'档案操作失败'),editLooks:id=>worldUI.editLooks(id)});
worldUI=mountWorldUI({api,localReady,isLocal:()=>mode==='local',toast,report:e=>reportError(e,'世界操作失败'),navigate:app,pickArchive:id=>archiveUI.pick(id),speak:(text,voice)=>speak(text,voice||prefs.voice),stopSpeech:()=>{if(device)device.stopSpeech().catch(()=>{});else window.speechSynthesis?.cancel();}});
memoryUI=mountMemoryUI({api,localReady,isLocal:()=>mode==='local',getCurrent:()=>current,toast,report:e=>reportError(e,'记忆操作失败'),openSource:async (id,owner)=>{
  if(id?.source_type==='world_event')return showWorldSource(api,id,owner);
 const {contact}=await api(`/memory-sources/${id}/location?owner=${encodeURIComponent(owner)}`);
 dialogs.dismissAll();
 await openContact(contact);await jump(id);
}});
if(device)device.voices().then(data=>{nativeVoices=data.voices;voiceOptions(el('voice'),prefs.voice);}).catch(()=>{});
initialize().then(()=>{app('home');}).catch(e=>{reportError(e,'应用启动失败');app('settings');el('connection-result').textContent=e.message;});
