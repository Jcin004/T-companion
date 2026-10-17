// SPDX-License-Identifier: AGPL-3.0-only
const MAX_CHARS=1000000, MAX_ENTRIES=100, MAX_ENTRY=350000;
const copy=v=>JSON.parse(JSON.stringify(v));
export class DiagnosticStore {
  constructor(storage){this.storage=storage;this.state={capture_context:true,entries:[]};this.listeners=new Set();this.secrets=new Set();this.queue=Promise.resolve();this.warning='';}
  async init(){try{const saved=await this.storage.load();if(saved&&Array.isArray(saved.entries))this.state={capture_context:saved.capture_context!==false,entries:[...saved.entries.filter(e=>e&&typeof e.id==='string'&&Number.isFinite(Date.parse(e.time))).slice(-MAX_ENTRIES),...this.state.entries]};}catch{this.warning='日志存储不可用，暂时仅保留在本次运行中。';}for(const e of this.state.entries)if(e.state==='running'){e.state='interrupted';e.error='应用在请求完成前关闭，结果未确认';}this.commit();return this;}
  rememberSecret(value){if(typeof value==='string'&&value)this.secrets.add(value);}
  clean(value,key='',depth=0){
    if(depth>12)return '[层级过深]';
    if(/^(api[_-]?key|authorization|token|access[_-]?token|password|secret|cookie|headers)$/i.test(key))return '[已隐藏]';
    if(typeof value==='string'){
      let text=value.replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [已隐藏]').replace(/\bsk-[\w-]{8,}/g,'[已隐藏]')
        .replace(/([?&](?:key|api_key|token|access_token)=)[^&#\s]+/gi,'$1[已隐藏]');
      for(const secret of this.secrets)text=text.split(secret).join('[已隐藏]');
      return text;
    }
    if(Array.isArray(value))return value.map(v=>this.clean(v,'',depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,this.clean(v,k,depth+1)]));
    return value;
  }
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  commit(){
    while(this.state.entries.length>MAX_ENTRIES||JSON.stringify(this.state).length>MAX_CHARS)this.state.entries.shift();
    const snapshot=copy(this.state);
    this.queue=this.queue.catch(()=>{}).then(()=>this.storage.save(snapshot)).catch(()=>{this.warning='日志保存失败，当前记录暂留内存；请检查剩余空间。';for(const fn of this.listeners)fn();});
    for(const fn of this.listeners)fn();
  }
  record(category,label,data={}){
    let safe=this.clean(data);
    if(JSON.stringify(safe).length>MAX_ENTRY){safe={...safe,messages:undefined,context_omitted:'上下文超过单条日志上限，未保存全文'};if(JSON.stringify(safe).length>MAX_ENTRY)safe={error:'条目过大，已省略详情'};}
    const entry={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),time:new Date().toISOString(),category,label:this.clean(label),...safe};
    this.state.entries.push(entry);this.commit();return entry.id;
  }
  begin(data){return this.record('request','模型请求',{...data,...(!this.state.capture_context?{messages:undefined,context_omitted:'本次未开启上下文记录'}:{}),state:'running',started:Date.now()});}
  update(id,values){const item=this.state.entries.find(e=>e.id===id);if(!item)return;Object.assign(item,this.clean(values));if(JSON.stringify(item).length>MAX_ENTRY){delete item.messages;item.context_omitted='上下文超过单条日志上限，未保存全文';}if(item.state!=='running')item.duration_ms=Date.now()-item.started;this.commit();}
  clear(){this.state.entries=[];this.commit();}
  capture(value){this.state.capture_context=!!value;this.commit();}
  export(){return this.clean({version:1,exported_at:new Date().toISOString(),...this.state});}
}
export function diagnosticPersistence(plugin){
  if(plugin)return {async load(){const result=await plugin.loadDiagnostics();return result.data?JSON.parse(result.data):null;},async save(state){await plugin.saveDiagnostics({data:JSON.stringify(state)});}};
  let database;
  const open=async()=>database||(database=await new Promise((resolve,reject)=>{const request=indexedDB.open('t-companion-diagnostics',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}));
  return {async load(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('logs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},async save(value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'logs');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}};
}
function recallDetails(receipt){
 const box=document.createElement('section');box.className='recall-receipt';
 const add=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;box.append(n);};
 add('h3','本轮记忆召回');
 if(receipt.disabled){add('p','已关闭记忆召回');return box;}
 add('p',`查询依据：${receipt.query_mode==='recent_context'?'当前输入＋近期用户消息':'当前输入'}；材料 ${receipt.used_chars}/${receipt.budget} 字符。`);
 if(receipt.context_message_ids?.length)add('p','近期来源消息：'+receipt.context_message_ids.join('、'));
 const reasons={lexical:'关键词命中',recent_context:'近期对话线索',link:'已复核关联（一跳）',anchor_lexical:'核心标签匹配',self_question:'人物自我提问'};
 const statuses={selected:'已携带',budget:'超出材料预算',item_limit:'超出条数上限',seed_not_selected:'关联起点未携带'};
 for(const item of receipt.candidates||[])add('p',`${item.kind==='anchor'?'标签':'记忆'} ${item.id}：${reasons[item.reason]||item.reason} → ${statuses[item.status]||item.status}`);
 const exclusions={paused_memory:'已停用记忆',invalid_evidence:'来源无效',unconfirmed_anchor:'未人工保存的标签',stale_anchor:'名册依据过期',stale_link:'待复核关联',unavailable_link_endpoint:'关联端点不可用',neighbor_limit:'扩展数量上限'};
 for(const [reason,count]of Object.entries(receipt.excluded||{}))add('p',`未使用：${exclusions[reason]||reason} ${count} 项`);
 if(!receipt.candidates?.length)add('p','本轮没有匹配到可携带的记忆或标签。');
 return box;
}
export function mountDiagnostics({store,preview,exportFile,report}){
  const $=id=>document.getElementById(id), list=$('log-list');
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  const draw=()=>{
    $('capture-context').checked=store.state.capture_context;$('log-storage-warning').textContent=store.warning;
    const entries=store.state.entries.filter(e=>$('log-filter').value==='all'||($('log-filter').value==='error'?e.state==='failed'||e.category==='error':e.category===$('log-filter').value)).slice().reverse();
    $('log-count').textContent=`${entries.length} 条 · 最多保留 100 条 / 约 1 MB`;
    list.replaceChildren();
    for(const entry of entries){
      const row=document.createElement('details');row.className='card log-entry';
      row.append(text('summary',`${new Date(entry.time).toLocaleString()} · ${entry.label} · ${entry.state||entry.category}${entry.history_count!=null?' · 历史 '+entry.history_count+' 条':''}${entry.recalled_memory_ids?' · 记忆 '+entry.recalled_memory_ids.length+' 条':''}${entry.purpose?' · '+entry.purpose:''}`));
      row.addEventListener('toggle',()=>{if(!row.open||row.childElementCount>1)return;const {messages,...meta}=entry;if(entry.recall_trace)row.append(recallDetails(entry.recall_trace));row.append(text('pre',JSON.stringify(meta,null,2)));if(messages){row.append(text('h3','实际发送的上下文（脱敏）'));for(const m of messages)row.append(text('h4',m.role),text('pre',m.content));}});
      list.append(row);
    }
    if(!entries.length)list.append(text('p','暂无记录。发送一条消息后可在这里查看请求和报错。'));
  };
  store.subscribe(draw);$('log-filter').onchange=draw;
  $('capture-context').onchange=()=>store.capture($('capture-context').checked);
  $('log-clear').onclick=()=>{store.clear();$('context-preview').replaceChildren();};
  $('log-export').onclick=()=>exportFile(new Blob([JSON.stringify(store.export(),null,2)],{type:'application/json'}),'t-diagnostics.json').catch(report);
  $('context-refresh').onclick=async()=>{try{const result=await preview();$('context-preview').replaceChildren(text('p',result.note),...(result.recall?[recallDetails(result.recall)]:[]),text('pre',JSON.stringify(store.clean(result.messages),null,2)));}catch(error){$('context-preview').replaceChildren(text('p',error.message));}};
  draw();
}
