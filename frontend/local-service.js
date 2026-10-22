// SPDX-License-Identifier: AGPL-3.0-only
// UI calls this service port. Persistence and model transport are independent adapters.
import {createSseJsonParser} from './sse-json.js';
import {ensureProfiles,validateConnection} from './model-profiles.js';
import {normalizeChatStyle,turnChatStyle} from './chat-style.js';
import {historyLimit,validateHistoryLimit} from './context-policy.js';
import {validateMemory,recallPlan} from './memory-core.js';
import {MemoryModule} from './memory-service.js';
import {buildContext,queryLocalData} from './local-queries.js';
import {ExternalMemory,browserMemoryRequest,nativeMemoryRequest} from './external-memory.js';
import {EmbeddedMemory} from './embedded-memory.js';
import {WorldModule} from './world-service.js';
import {validateProactiveMessages} from './proactive-messages.js';
import {ResidentLifeService} from './resident-life-service.js';
import {validateLife} from './resident-life-core.js';
import {validateWorld,sceneSnapshot,completeWorldDialogue} from './world-core.js';
import {CharacterLooksModule,validateLooks} from './character-looks.js';
// Preserve the existing import path for callers while the implementation moves.
export {buildContext} from './local-queries.js';
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => 't_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();
const defaults = {base_url:'https://api.openai.com/v1',model:'',protocol:'openai-chat',theme:'light',font_size:16,voice:'',timezone:'Asia/Shanghai',history_limit:30};
export function emptyData(){return {version:2,characters:[],sessions:[],messages:[],turns:[],settings:{...defaults},drafts:{}};}
export function validateBackup(raw){
  if(!raw||![1,2].includes(raw.version))throw Error('不支持的备份版本');
  const d=clone(raw); for(const name of ['characters','sessions','messages','turns'])if(!Array.isArray(d[name]))throw Error('备份缺少 '+name);
  if(d.characters.length>10000||d.sessions.length>10000||d.messages.length>100000||d.turns.length>50000)throw Error('备份记录过多');
  const unique=(rows,key)=>{const ids=new Set(rows.map(r=>r[key]));if(ids.size!==rows.length)throw Error('备份有重复标识');return ids;};
  const cs=unique(d.characters,'id'),ss=unique(d.sessions,'id');unique(d.messages,'id');unique(d.turns,'request_id');
  for(const c of d.characters){if(typeof c.id!=='string'||!c.name||c.name.length>100||typeof c.identity!=='string'||typeof c.style!=='string'||(c.avatar&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.avatar))||c.avatar?.length>550000)throw Error('备份角色格式错误');if(c.profile&&(c.profile.schema_version!==1||!c.profile.canon||!c.profile.persona))throw Error('角色身份版本不支持');}
  for(const s of d.sessions)if(typeof s.id!=='string'||!cs.has(s.character_id)||!Number.isFinite(Date.parse(s.created_at.replace(' ','T'))))throw Error('备份会话引用错误');
  const messages=new Map(d.messages.map(m=>[m.id,m]));
  for(const m of d.messages)if(!Number.isSafeInteger(m.id)||m.id<1||!ss.has(m.session_id)||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>100000||!Number.isFinite(Date.parse(m.created_at.replace(' ','T'))))throw Error('备份消息格式错误');
  const used=new Set();for(const t of d.turns){const u=messages.get(t.user_id),a=messages.get(t.assistant_id);if(!ss.has(t.session_id)||!u||u.session_id!==t.session_id||u.role!=='user'||used.has(t.user_id)||!['complete','failed','cancelled','interrupted'].includes(t.state)||(t.state==='complete'&&(!a||a.role!=='assistant'||a.session_id!==t.session_id||a.id<=u.id)))throw Error('备份请求引用错误');used.add(t.user_id);}
  new Intl.DateTimeFormat('en',{timeZone:d.settings?.timezone||'Asia/Shanghai'});
  d.version=2;d.settings={...defaults,...d.settings};delete d.settings.api_key;delete d.settings.has_api_key;d.drafts=d.drafts||{};
  ensureProfiles(d);
  if(d.api_profiles.length>200||d.api_groups.length>100)throw Error('模型连接或分组过多');
  unique(d.api_groups,'id');const profiles=unique(d.api_profiles,'id');
  for(const g of d.api_groups)if(typeof g.id!=='string'||!g.name||g.name.length>80)throw Error('分组格式错误');
  d.api_profiles=d.api_profiles.map(p=>{if(typeof p.id!=='string'||!/^[\w-]{1,100}$/.test(p.id))throw Error('连接标识错误');return {id:p.id,...validateConnection(p)};});
  validateHistoryLimit(d.settings.history_limit);for(const s of d.sessions){s.chat_style=normalizeChatStyle(s.chat_style);if(s.history_limit!=null)validateHistoryLimit(s.history_limit);}
  validateWorld(d);validateLooks(d);validateProactiveMessages(d);if(d.world.life)validateLife(d);validateMemory(d);
  d.memory.external.enabled=false; // Restoring a backup never opts into remote disclosure.
  return d;
}
export class BrowserPersistence {
  async open(){this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('t-companion-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('documents');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('无法打开本机数据库'));});}
  async load(){await this.open();return new Promise((resolve,reject)=>{const r=this.db.transaction('documents').objectStore('documents').get('state');r.onsuccess=()=>resolve(r.result||emptyData());r.onerror=()=>reject(Error('读取数据库失败'));});}
  async save(data){return new Promise((resolve,reject)=>{const tx=this.db.transaction('documents','readwrite');tx.objectStore('documents').put(clone(data),'state');tx.oncomplete=resolve;tx.onerror=()=>reject(Error('保存失败，请检查设备剩余空间'));});}
  keyName(id){return 't.local-model-key'+(id&&id!=='legacy'?'.'+id:'');}
  async setKey(value,id){if(!value)localStorage.removeItem(this.keyName(id));else localStorage.setItem(this.keyName(id),value);}
  async hasKey(id){return !!localStorage.getItem(this.keyName(id));}
  async getKey(id){return localStorage.getItem(this.keyName(id))||'';}
}
export class NativePersistence {
  constructor(plugin){this.plugin=plugin;this.owner='ui_'+uid();}
  async begin(){await this.plugin.beginWrite?.({owner:this.owner});}
  async end(){await this.plugin.endWrite?.({owner:this.owner});}
  async load(){const r=await this.plugin.load();this.revision=r.revision;return r.data?JSON.parse(r.data):emptyData();}
  async save(data){const r=await this.plugin.save({data:JSON.stringify(data),revision:this.revision,owner:this.owner});this.revision=r?.revision;}
  async setKey(value,id='legacy'){await this.plugin.setKey({value:value||'',profile_id:id});}
  async hasKey(id='legacy'){return (await this.plugin.hasKey({profile_id:id})).value;}
}
export async function browserModel(settings,key,messages,onDelta,signal){
  const response=await fetch(settings.base_url.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({model:settings.model,messages,stream:true}),signal});
  if(!response.ok)throw Error(response.status===401||response.status===403?'模型服务拒绝授权，请检查密钥和模型权限':'模型服务返回错误（'+response.status+'）');
  if(!response.body)throw Error('此环境不支持流式读取');
  const parser=createSseJsonParser(),reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',finished=false;
  function consume(event){if(/^data:\s*\[DONE\]/m.test(event)){finished=true;return;}for(const d of parser.pushEvent(event)){if(d.error)throw Error('模型服务返回错误');const choice=d.choices?.[0];if(choice?.delta?.content)onDelta(choice.delta.content);if(choice?.finish_reason){if(!['stop','length','content_filter'].includes(choice.finish_reason))throw Error('不支持此模型响应');finished=true;}}}
  try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});buffer=buffer.replace(/\r\n/g,'\n');let i;while((i=buffer.indexOf('\n\n'))>=0){consume(buffer.slice(0,i));buffer=buffer.slice(i+2);}if(buffer.length>200000)throw Error('模型数据块过大');if(done){if(buffer.trim())consume(buffer);break;}}}finally{reader.releaseLock();}
  if(!finished)throw Error('模型连接提前中断，回复未完成');
}
export async function nativeModel(plugin,settings,messages,onDelta,signal){
  const id=uid();let failure;
  const listener=await plugin.addListener('modelChunk',e=>{if(e.id===id&&!failure)try{onDelta(e.text);}catch(error){failure=error;plugin.cancel({id});}});
  const cancel=()=>plugin.cancel({id});signal.addEventListener('abort',cancel);
  try{if(signal.aborted)throw Error('已停止生成');await plugin.model({id,profile_id:settings.profile_id||'legacy',base_url:settings.base_url,model:settings.model,messages});if(failure)throw failure;}finally{signal.removeEventListener('abort',cancel);await listener.remove();}
}
export class LocalService {
  constructor(persistence,transport,diagnostics=null,externalRequest=null,embeddedMemory=null){this.storage=persistence;this.transport=transport;this.diagnostics=diagnostics;this.queue=Promise.resolve();this.active=null;this.memoryModule=new MemoryModule(this);this.auxTask=null;this.externalMemory=new ExternalMemory(this,externalRequest||browserMemoryRequest(persistence,diagnostics));this.embeddedMemory=embeddedMemory;}
  async init(){this.data=await this.storage.load();ensureProfiles(this.data);validateWorld(this.data);validateProactiveMessages(this.data);validateMemory(this.data);for(const t of this.data.turns)if(t.state==='generating')t.state='interrupted';await this.transact(d=>{for(const t of d.turns)if(t.state==='generating')t.state='interrupted';});return this;}
  // A command sees the last durable state; uncommitted candidates stay private.
  transact(change){
    const task=this.queue.catch(()=>{}).then(async()=>{
      await this.storage.begin?.();
      try{
      if(this.storage.plugin?.beginWrite){const durable=await this.storage.load();ensureProfiles(durable);validateWorld(durable);validateMemory(durable);this.data=durable;}
      const next=clone(this.data);
      const result=await change(next);
      try{
        if(this.embeddedMemory)await this.embeddedMemory.sync(next);
        await this.storage.save(next);
      }catch(error){this.embeddedMemory?.invalidate();throw error;}
      this.data=next;
      return result===undefined?undefined:clone(result);
      }finally{await this.storage.end?.();}
    });
    this.queue=task;
    return task;
  }

  connection(){const p=this.data.api_profiles.find(p=>p.id===this.data.active_profile_id);return {...this.data.settings,...(p||{base_url:'',model:''}),profile_id:p?.id||''};}
  async publicSettings(){return {...this.connection(),active_profile_id:this.data.active_profile_id,has_api_key:await this.storage.hasKey(this.data.active_profile_id)};}
  message(m){const t=this.data.turns.find(t=>t.user_id===m.id||t.assistant_id===m.id);return {...m,state:t?.state||'complete',chat_style:m.role==='assistant'?t?.chat_style:undefined,world_action:m.role==='assistant'?t?.world_action:undefined,request_id:m.role==='user'?t?.request_id:undefined};}
  async api(path,method='GET',body){
    if(this.storage.plugin?.beginWrite&&!this.active){await this.queue.catch(()=>{});const current=await this.storage.load();ensureProfiles(current);validateWorld(current);validateMemory(current);this.data=current;}
    const url=new URL(path,'https://local'),pathname=url.pathname,route=pathname.split('/').filter(Boolean)[0];
    if(route==='world-life'){
      if(this.storage.plugin?.lifeRun&&['run','resume','cancel','settings'].includes(pathname.split('/')[2])){
        if(pathname.endsWith('/run')||pathname.endsWith('/resume'))return this.storage.plugin.lifeRun({id:body?.request_id||body?.run_id||'batch_'+Date.now().toString(36),resume:pathname.endsWith('/resume'),skip:body?.skip_uncertain===true});
        if(pathname.endsWith('/cancel'))await this.storage.plugin.lifeCancel();
      }
      if(!this.lifeService)this.lifeService=new ResidentLifeService(this);
      const result=await this.lifeService.api(path,method,body);
      if(this.storage.plugin?.lifeSchedule&&pathname.endsWith('/settings'))await this.storage.plugin.lifeSchedule();
      return result;
    }
    if(route==='character-looks')return new CharacterLooksModule(this).api(pathname,method,body);
    if(route==='world')return new WorldModule(this).api(path,method,body);
    if(pathname==='/memory-engine'&&method==='GET')return this.embeddedMemory?.status()||{provider:'browser-local',installed:false};
    if(pathname==='/external-memory'||pathname==='/external-memory/test'){
      if(this.embeddedMemory)throw Error('Android 已使用内置 OB，无需外部网关配置');
      return this.externalMemory.api(method,body,pathname);
    }
    if(pathname.match(/^\/contacts\/[^/]+\/context-preview$/)&&method==='POST'&&(this.embeddedMemory||this.externalMemory.config().enabled)){
      if(typeof body?.message!=='string'||body.message.length>20000)throw Error('预览消息格式或长度不正确');
      const sid=decodeURIComponent(pathname.split('/')[2]),recalled=await this.prepareRecall(sid,body.message,undefined,new AbortController().signal);
      return {recall:clone(recalled.trace),external:recalled.external,note:this.embeddedMemory?'预览与发送使用同一内置 OB 召回管线；发送时重新核对最新记录。':'预览会查询外部记忆；发送时重新查询最新状态。',messages:buildContext(this.data,sid,body.message,undefined,recalled)};
    }
    const queried=queryLocalData(this.data,url,method,body);
    if(queried!==undefined)return queried;
    if(['memories','summaries','self','memory-settings','memory-sources','memory-links','memory-link-proposals'].includes(route))return this.memoryModule.api(path,method,body);
    if(method==='GET'||pathname==='/settings/test')return this._dispatch(path,method,body);
    return this.transact(async data=>{
      // Reuse domain validation against a private document; never run model work here.
      const command=Object.create(this);
      command.data=data;
      return command._dispatch(path,method,body);
    });
  }
  async _dispatch(path,method='GET',body){
    this.diagnostics?.rememberSecret(body?.api_key);
    const url=new URL(path,'https://local'),q=url.searchParams,parts=url.pathname.split('/').filter(Boolean),d=this.data;
    if(parts[0]==='health')return {ok:true};
    if(parts[0]==='model-groups'){
      if(method==='GET')return clone(d.api_groups);
      if(this.active)throw Error('请等待当前回复完成再修改连接');
      if(method==='DELETE'){d.api_groups=d.api_groups.filter(g=>g.id!==parts[1]);for(const p of d.api_profiles)if(p.group_id===parts[1])p.group_id='';}
      else {if(!body.name?.trim()||body.name.length>80)throw Error('请填写分组名称（最多80字）');const g=d.api_groups.find(g=>g.id===parts[1]);if(g)g.name=body.name.trim();else {if(d.api_groups.length>=100)throw Error('分组已达上限');d.api_groups.push({id:uid(),name:body.name.trim()});}}
      return clone(d.api_groups);
    }
    if(parts[0]==='model-profiles'){
      if(method==='GET')return Promise.all(d.api_profiles.map(async p=>({...p,active:p.id===d.active_profile_id,has_api_key:await this.storage.hasKey(p.id)})));
      if(this.active)throw Error('请等待当前回复完成再切换或修改连接');
      const p=d.api_profiles.find(p=>p.id===parts[1]);
      if(parts[2]==='activate'){if(!p)throw Error('连接不存在');d.active_profile_id=p.id;}
      else if(method==='DELETE'){if(!p)throw Error('连接不存在');await this.storage.setKey(null,p.id);d.api_profiles=d.api_profiles.filter(x=>x.id!==p.id);if(d.active_profile_id===p.id)d.active_profile_id=d.api_profiles[0]?.id||'';}
      else {const value=validateConnection(body);if(value.group_id&&!d.api_groups.some(g=>g.id===value.group_id))throw Error('分组不存在');if(parts[1]&&!p)throw Error('连接不存在');if(!p&&d.api_profiles.length>=200)throw Error('连接已达上限');const id=p?.id||uid();if(p&&new URL(p.base_url).origin!==new URL(value.base_url).origin&&!body.api_key&&!body.clear_key&&await this.storage.hasKey(id))throw Error('服务域名已变更，请重新填写密钥或选择清除旧密钥');if(body.clear_key)await this.storage.setKey(null,id);else if(body.api_key)await this.storage.setKey(body.api_key,id);if(p)Object.assign(p,value);else d.api_profiles.push({id,...value});if(!d.active_profile_id)d.active_profile_id=id;}
      return this.publicSettings();
    }
    if(parts[0]==='settings'){
      if(body?.history_limit!==undefined)validateHistoryLimit(body.history_limit);
      if(parts[1]==='test'){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);try{await this.callModel([{role:'user',content:'Reply OK'}],()=>{},ctrl.signal);return {ok:true};}finally{clearTimeout(timer);}}
      if(method==='PATCH'){const values={...body};delete values.api_key;delete values.has_api_key;if(values.protocol&&values.protocol!=='openai-chat')throw Error('当前仅支持 Chat Completions 协议');if(values.base_url){const u=new URL(values.base_url);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('模型服务地址必须为 HTTPS（本机测试除外）');}if(values.timezone)new Intl.DateTimeFormat('en',{timeZone:values.timezone});if(body.api_key)await this.storage.setKey(body.api_key,d.active_profile_id);const profile=d.api_profiles.find(p=>p.id===d.active_profile_id);if(profile)for(const k of ['base_url','model','protocol'])if(values[k]!==undefined)profile[k]=values[k];d.settings={...d.settings,...values};}return this.publicSettings();
    }
    if(parts[0]==='characters'){
      if(method==='GET')return clone(d.characters);
      if(!body.name?.trim()||body.name.length>100||body.identity?.length>20000||body.style?.length>10000||body.avatar?.length>550000||(body.avatar&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.avatar)))throw Error('角色资料格式或长度不正确');
      const old=d.characters.find(c=>c.id===parts[1]),c={...old,...body,id:old?.id||uid()};
      if(c.profile){c.profile.canon.name=c.name;c.profile.canon.description=c.identity||'UNSPECIFIED';c.profile.persona.communication_style=c.style?[c.style]:[];}
      if(old)Object.assign(old,c);else d.characters.push(c);return clone(c);
    }
    if(parts[0]==='contacts'){
      if(parts.length===1){
        if(method==='POST'){if(!d.characters.some(c=>c.id===body.character_id))throw Error('角色不存在');let c=d.sessions.find(s=>s.character_id===body.character_id&&s.mode!=='world');if(!c){c={id:uid(),character_id:body.character_id,title:d.characters.find(c=>c.id===body.character_id).name,note:'',background:'#eef2f3',voice:'',created_at:now()};d.sessions.push(c);}return clone(c);}
        return d.sessions.filter(s=>s.mode!=='world').map(s=>{const ms=d.messages.filter(m=>m.session_id===s.id),last=ms[ms.length-1];return {...s,unread_shares:ms.filter(m=>m.origin==='world_share'&&m.id>(s.read_message_id||0)).length,last_message:last?.content||'',last_time:last?.created_at,last_assistant_id:ms.filter(m=>m.role==='assistant'&&this.message(m).state==='complete').pop()?.id||0};}).reverse();
      }
      const s=d.sessions.find(s=>s.id===parts[1]);if(!s)throw Error('会话不存在');
      if(parts[2]==='read'&&method==='POST'){if(!Number.isSafeInteger(body.message_id)||body.message_id<0)throw Error('已读消息标识无效');s.read_message_id=Math.max(s.read_message_id||0,body.message_id);return {ok:true};}
      if(method==='PATCH'&&parts.length===2){if(body.history_limit!==undefined&&body.history_limit!==null)validateHistoryLimit(body.history_limit);for(const k of ['note','background','voice'])if(body[k]!==undefined)s[k]=String(body[k]);if('history_limit' in body)s.history_limit=body.history_limit;if(body.chat_style)s.chat_style=normalizeChatStyle(body.chat_style);return clone(s);}
      if(parts[2]==='draft'){
        if(method==='PATCH'){if(typeof body?.text!=='string'||body.text.length>100000)throw Error('草稿格式或长度不正确');d.drafts[s.id]=body.text;}
        return {text:d.drafts[s.id]||''};
      }
      const ms=d.messages.filter(m=>m.session_id===s.id).sort((a,b)=>a.id-b.id);
      if(parts[2]==='messages'){
        let result;if(q.has('before'))result=ms.filter(m=>m.id<Number(q.get('before'))).slice(-40);else if(q.has('after'))result=ms.filter(m=>m.id>Number(q.get('after'))).slice(0,40);else if(q.has('anchor')){const i=ms.findIndex(m=>m.id===Number(q.get('anchor')));if(i<0)throw Error('消息不存在');result=ms.slice(Math.max(0,i-20),i+21);}else result=ms.slice(-40);
        return {items:result.map(m=>this.message(m)),has_before:!!result.length&&ms[0].id<result[0].id,has_after:!!result.length&&ms[ms.length-1].id>result[result.length-1].id};
      }
      if(parts[2]==='search')return ms.filter(m=>m.content.toLocaleLowerCase().includes((q.get('q')||'').toLocaleLowerCase())&&(!q.has('before')||m.id<Number(q.get('before')))).reverse().slice(0,50).map(m=>this.message(m));
      if(parts[2]==='calendar'){const result={},format=new Intl.DateTimeFormat('en-CA',{timeZone:d.settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'});for(const m of ms){const timestamp=/Z$|[+-]\d\d:\d\d$/.test(m.created_at)?m.created_at:m.created_at.replace(' ','T')+'Z';const p=format.formatToParts(new Date(timestamp)),get=n=>p.find(p=>p.type===n).value,day=get('year')+'-'+get('month')+'-'+get('day');if(day.startsWith(q.get('month'))&&!result[day])result[day]=m.id;}return result;}
    }
    if(parts[0]==='backup'){
      if(this.active)throw Error('请先停止生成再备份或恢复');
      if(parts[1]==='restore'){if(this.active)throw Error('请等待当前模型操作结束再恢复');const next=validateBackup(body);for(const p of next.api_profiles){const old=d.api_profiles.find(x=>x.id===p.id);if(!old||new URL(old.base_url).origin!==new URL(p.base_url).origin)await this.storage.setKey(null,p.id);}for(const key of Object.keys(d))delete d[key];Object.assign(d,next);return {ok:true};}
      return clone(d);
    }
    throw Error('不支持的本地操作');
  }
  async callModel(messages,delta,signal,meta={}){
    let s=this.connection();if(meta.profile_id){const profile=this.data.api_profiles.find(p=>p.id===meta.profile_id);if(!profile)throw Error('记忆使用的模型连接已删除，请重新选择');s={...this.data.settings,...profile,profile_id:profile.id};}const limit=meta.session_id?historyLimit(this.data,meta.session_id):undefined,key=await this.storage.getKey?.(s.profile_id);this.diagnostics?.rememberSecret(key);
    const id=this.diagnostics?.begin({source:'local',...meta,model:s.model,profile_id:s.profile_id,endpoint:s.base_url,messages,message_count:messages.length,history_count:meta.session_id?Math.max(0,messages.length-2):0,history_limit:limit,request_chars:JSON.stringify(messages).length});let chars=0;
    try{if(!s.model)throw Error('请先在设置 App 配置模型并测试连接');const result=await this.transport(s,key,messages,chunk=>{chars+=chunk.length;delta(chunk);},signal);if(signal.aborted)throw Error('已停止生成');if(meta.session_id&&!chars)throw Error('模型返回了空内容');this.diagnostics?.update(id,{state:'complete',response_chars:chars});return result;}
    catch(e){const message=signal.aborted?'已停止生成':e instanceof TypeError?'无法连接模型服务；请检查网络、地址和浏览器跨域许可。Android 原生请求不受浏览器跨域限制。':e.message||'请求失败';this.diagnostics?.update(id,{state:signal.aborted?'cancelled':'failed',error:message,response_chars:chars});throw Error(message);}
  }
  cancel(){this.active?.abort();}
  async prepareRecall(sid,text,beforeMessageId,signal){
    const owner=this.data.sessions.find(s=>s.id===sid)?.character_id;
    if(!owner)throw Error('会话不存在');
    if(this.embeddedMemory){
      const data=this.data,options={sessionId:sid,beforeMessageId};
      if(!data.memory.settings.recall)return recallPlan(data,owner,text,{...options,embedded:{ranked:[]}});
      const embedded=await this.embeddedMemory.recall(data,owner,text,options);
      if(signal?.aborted)throw Error('已停止生成');
      if(JSON.stringify(data.memory)!==JSON.stringify(this.data.memory))throw Error('记忆已变化，请重新发送');
      return recallPlan(data,owner,text,{...options,embedded});
    }
    const recalled=recallPlan(this.data,owner,text,{sessionId:sid,beforeMessageId});
    if(!this.data.memory.settings.recall)return recalled;
    const external=await this.externalMemory.recall(owner,text,recalled,signal);
    if(external){recalled.external=external;recalled.trace.external={...external,records:undefined};}
    return recalled;
  }
  async auxiliary(messages,meta){
    if(this.active)throw Error('请等待当前模型操作结束');const ctrl=new AbortController();this.active=ctrl;let text='';const timer=setTimeout(()=>ctrl.abort(),90000);
    const task=this.callModel(messages,chunk=>{text+=chunk;if(text.length>100000)ctrl.abort();},ctrl.signal,meta).then(()=>{if(!text.trim())throw Error('模型返回空内容');return text;});this.auxTask=task;
    try{return await task;}finally{clearTimeout(timer);if(this.auxTask===task)this.auxTask=null;if(this.active===ctrl)this.active=null;}
  }
  async stream(sid,text,rid,onEvent){
    if(this.auxTask){this.cancel();await this.auxTask.catch(()=>{});}
    if(this.active)throw Error('已有回复正在生成');
    if(this.memoryModule.saving)throw Error('记忆正在保存，请稍后发送');
    const ctrl=new AbortController();this.active=ctrl;
    let partial='',dirty=0,started=false,writeFailure;
    try{
      const accepted=await this.transact(d=>{
        if(!d.sessions.some(s=>s.id===sid))throw Error('会话不存在');
        let turn=d.turns.find(t=>t.request_id===rid);
        if(turn&&(turn.session_id!==sid||d.messages.find(m=>m.id===turn.user_id)?.content!==text))throw Error('请求标识与原消息不匹配');
        if(turn?.state==='complete')return {complete:true};
        const scene=turn?.scene||sceneSnapshot(d,sid);
        const nextId=()=>d.messages.reduce((n,m)=>Math.max(n,m.id),0)+1;
        if(!turn){
          const u={id:nextId(),session_id:sid,role:'user',content:text,created_at:now()};
          d.messages.push(u);
          turn={request_id:rid,session_id:sid,user_id:u.id,assistant_id:null};d.turns.push(turn);
          if(scene)turn.scene=scene;
        }
        turn.state='generating';turn.error='';
        if(!turn.chat_style)turn.chat_style=turnChatStyle(d.sessions.find(s=>s.id===sid).chat_style,rid);
        let reply=d.messages.find(m=>m.id===turn.assistant_id);
        if(!reply){reply={id:nextId(),session_id:sid,role:'assistant',content:'',created_at:now()};d.messages.push(reply);turn.assistant_id=reply.id;}
        else reply.content='';
        return {chat_style:turn.chat_style,user_id:turn.user_id,scene:turn.scene};
      });
      if(accepted.complete){onEvent('complete',{});return;}
      started=true;onEvent('accepted',accepted);
      const checkpoint=(content,state,error='')=>this.transact(d=>{
        const turn=d.turns.find(t=>t.request_id===rid);
        const reply=d.messages.find(m=>m.id===turn.assistant_id);
        reply.content=content;if(state)turn.state=state;turn.error=error;
        if(state==='complete')completeWorldDialogue(d,turn);
      });
      const recalled=await this.prepareRecall(sid,text,accepted.user_id,ctrl.signal),d=this.data;
      if(ctrl.signal.aborted)throw Error('已停止生成');
      if(recalled.external?.state==='fallback')onEvent('memory-status',{message:recalled.external.message});
      const timer=setTimeout(()=>ctrl.abort(),180000);
      try{
        await this.callModel(buildContext(d,sid,text,accepted.chat_style,recalled,accepted.scene),chunk=>{
          if(ctrl.signal.aborted)return;
          partial+=chunk;if(partial.length>100000){ctrl.abort();return;}
          onEvent('delta',{text:chunk});
          if(Date.now()-dirty>400){
            dirty=Date.now();
            checkpoint(partial).catch(error=>{writeFailure=error;ctrl.abort();});
          }
        },ctrl.signal,{session_id:sid,request_id:rid,recall_method:recalled.trace.method,recalled_memory_ids:recalled.records.map(m=>m.id),recalled_anchor_ids:recalled.anchors.map(a=>a.id),recalled_link_ids:recalled.links.map(l=>l.id),recall_trace:recalled.trace,recall_matches:recalled.records.map(({id,score,matched_terms})=>({id,score,matched_terms}))});
      }finally{clearTimeout(timer);}
      // Drain checkpoints before committing completion, including a failed last save.
      await this.queue.catch(error=>{writeFailure=error;});
      if(writeFailure)throw writeFailure;
      if(ctrl.signal.aborted)throw Error('已停止生成');
      if(!partial.trim())throw Error('模型返回了空内容');
      await checkpoint(partial,'complete');onEvent('complete',{});
    }catch(error){
      if(started)await this.transact(d=>{
        const turn=d.turns.find(t=>t.request_id===rid);
        d.messages.find(m=>m.id===turn.assistant_id).content=partial;
        turn.state=writeFailure?'failed':ctrl.signal.aborted?'cancelled':'failed';
        turn.error=writeFailure?'保存失败，请检查设备空间':ctrl.signal.aborted?'已停止，部分回复未完成':'请求失败，可重试';
      });
      throw Error(writeFailure?.message||(ctrl.signal.aborted?'已停止生成；可重试原消息':error.message||'网络连接失败'));
    }finally{
      this.active=null;
      if(this.data.turns.find(t=>t.request_id===rid)?.state==='complete')this.memoryModule.schedule(sid);
    }
  }
}
export async function createLocalService(plugin,diagnostics,memoryPlugin=globalThis.Capacitor?.Plugins?.TMemory){const persistence=plugin?new NativePersistence(plugin):new BrowserPersistence();const transport=plugin?((s,k,m,delta,signal)=>nativeModel(plugin,s,m,delta,signal)):browserModel;return new LocalService(persistence,transport,diagnostics,plugin?nativeMemoryRequest(plugin):null,plugin?new EmbeddedMemory(memoryPlugin):null).init();}
