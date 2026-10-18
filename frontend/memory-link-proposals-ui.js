// SPDX-License-Identifier: AGPL-3.0-only
import {linkTypes} from './memory-links.js';
import {proposalKey} from './memory-link-proposals.js';

export function mountMemoryLinkProposals({api,openSource,toast,report,cancel,changed}) {
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const dialog=node('dialog');dialog.id='memory-link-proposals-dialog';dialog.className='memory-dialog';
  const header=node('header'),title=node('h2','AI 关联候选'),close=node('button','×'),body=node('div'),status=node('p');
  close.type='button';close.className='icon';close.setAttribute('aria-label','关闭');close.onclick=()=>dialog.close();
  body.className='memory-dialog-body';status.className='memory-status';status.setAttribute('role','status');
  header.append(title,close);dialog.append(header,body,status);document.body.append(dialog);
  let busy=false,generating=false;
  const run=fn=>async()=>{if(busy)return;busy=true;status.textContent='处理中…';try{await fn();status.textContent='';}catch(e){report(e);status.textContent=e.message;toast(e.message);}finally{busy=false;}};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.className='compact';b.onclick=run(fn);return b;};
  const stop=node('button','停止候选生成');stop.type='button';stop.hidden=true;
  stop.onclick=async()=>{try{await cancel?.();}catch(e){report(e);toast(e.message);}};
  dialog.append(stop);dialog.addEventListener('close',()=>{if(generating)stop.click();});
  function show(){body.replaceChildren();status.textContent='';if(!dialog.open)dialog.showModal();}
  function proof(container,items,owner){
    for(const p of items){
      if(p.kind==='memory'){
        const b=button('原话 #'+p.message_id+' · '+p.quote,()=>openSource(p.message_id,owner));
        b.classList.add('memory-source');container.append(b);
      }else container.append(node('blockquote','名册原话：'+p.quote));
    }
  }
  async function list(ref,owner){
    show();body.append(node('p','候选不会参与召回。引用两端原话只说明依据，不代表已经证明因果。确认后才保存为人工复核关联。'));
    const rows=await api('/memory-link-proposals?owner='+encodeURIComponent(owner)+'&kind='+ref.kind+'&node='+encodeURIComponent(ref.id));
    if(!dialog.open)return;
    body.append(button('选择材料并生成候选',()=>select(ref,owner)));
    const pending=rows.filter(p=>p.status==='pending'),processed=rows.filter(p=>p.status!=='pending');
    body.append(node('p','待确认 '+pending.length+' 条；已处理 '+processed.length+' 条'));
    for(const p of [...pending].reverse()){
      const card=node('article');card.className='card';card.dataset.proposalId=p.id;
      card.append(node('h3',p.from.title+' → '+linkTypes[p.type]+' → '+p.to.title),node('p',p.reason));
      proof(card,p.proof,owner);
      const label=node('label','确认前可调整关系'),type=node('select');type.className='proposal-type';
      for(const [key,value] of Object.entries(linkTypes))if((key==='supports')===(p.to.kind==='anchor')){
        const option=node('option',value);option.value=key;type.append(option);
      }
      type.value=p.type;label.append(type);
      const noteLabel=node('label','确认说明'),note=node('textarea');note.maxLength=1000;note.rows=3;note.value=p.reason;note.className='proposal-note';noteLabel.append(note);
      card.append(label,noteLabel);
      if(p.stale)card.append(node('p','不可直接确认：'+p.blocked));
      const accept=button('确认关联',async()=>{
        await api('/memory-link-proposals/'+p.id+'/accept','POST',{owner_id:owner,type:type.value,note:note.value});
        await changed?.(ref,owner);
        if(dialog.open)await list(ref,owner);toast('已确认；关联按当前召回设置生效');
      });accept.disabled=p.stale;accept.classList.add('proposal-accept');
      card.append(accept,button('拒绝候选',async()=>{await api('/memory-link-proposals/'+p.id+'/reject','POST',{owner_id:owner});if(dialog.open)await list(ref,owner);}));
      body.append(card);
    }
    if(!pending.length)body.append(node('p','暂无待确认候选；可以选择材料提出关联。'));
    if(processed.length){
      const history=node('details');history.append(node('summary','已处理候选'));
      for(const p of [...processed].reverse()){
        const card=node('article');card.className='card';
        card.append(node('p',(p.status==='accepted'?'已确认':'已拒绝')+' · '+p.from.title+' → '+linkTypes[p.reviewed_type||p.type]+' → '+p.to.title),node('p','AI 原始建议：'+p.reason));
        if(p.status==='accepted')card.append(node('p','当时确认的说明：'+p.reviewed_note));
        proof(card,p.proof,owner);
        card.append(button('删除候选记录',async()=>{
          if(!confirm('只删除候选记录；已确认的关联、记忆与原话保留。继续？'))return;
          await api('/memory-link-proposals/'+p.id+'?owner='+encodeURIComponent(owner),'DELETE');if(dialog.open)await list(ref,owner);
        }));history.append(card);
      }body.append(history);
    }
  }
  async function select(ref,owner){
    show();
    const [memories,anchors]=await Promise.all([api('/memories?owner='+encodeURIComponent(owner)),api('/self?owner='+encodeURIComponent(owner))]);
    if(!dialog.open)return;
    const rows=[...memories.filter(m=>m.active).map(m=>({...m,kind:'memory'})),...anchors.filter(a=>a.origin==='manual'&&!a.stale).map(a=>({...a,kind:'anchor',title:a.label}))];
    const selected=new Map(),current=rows.find(r=>proposalKey(r)===proposalKey(ref));if(current)selected.set(proposalKey(ref),ref);
    const search=node('input'),choices=node('div'),count=node('p');search.placeholder='搜索可选材料标题';search.setAttribute('aria-label','搜索候选材料');
    const refreshCount=()=>{count.textContent='已选 '+selected.size+' 项；发送前请核对下方材料与引文。仅发送勾选内容，最多 12 项、48000 字符。';};
    const render=()=>{
      choices.replaceChildren();const matches=rows.filter(r=>(r.title+' '+(r.content||r.interpretation||'')).includes(search.value));
      for(const row of matches.slice(0,80)){
        const label=node('label'),check=node('input');check.type='checkbox';check.dataset.ref=proposalKey(row);check.checked=selected.has(proposalKey(row));
        check.onchange=()=>{if(check.checked)selected.set(proposalKey(row),{kind:row.kind,id:row.id});else selected.delete(proposalKey(row));refreshCount();};
        label.append(check,document.createTextNode((row.kind==='memory'?'记忆：':'人工标签：')+row.title));choices.append(label);
        const details=node('details');details.append(node('summary','查看材料与原话'),node('p',row.content||row.interpretation));
        proof(details,row.kind==='memory'?row.evidence.map(e=>({...e,kind:'memory'})):[{kind:'anchor',quote:row.quote}],owner);choices.append(details);
      }
      if(matches.length>80)choices.append(node('p','仅显示前 80 项，请搜索缩小范围；已勾选内容会保留。'));
    };
    search.oninput=render;refreshCount();render();
    const generate=button('生成候选（调用记忆模型）',async()=>{
      if(selected.size<2||selected.size>12)throw Error('请选择 2–12 项材料');
      generating=true;stop.hidden=false;
      try{
        const result=await api('/memory-link-proposals/generate','POST',{owner_id:owner,refs:[...selected.values()]});
        if(dialog.open){await list(ref,owner);toast(result.added?'新增 '+result.added+' 条候选，等待确认':'没有新增候选；可能无充分关联，或相同版本已处理');}
      }finally{generating=false;stop.hidden=true;}
    });generate.id='memory-proposal-generate';
    body.append(button('返回候选',()=>list(ref,owner)),node('p','使用记忆设置中的专用连接；未指定时跟随当前聊天连接。不会自动运行或更改名册。'),count,search,choices,generate);
  }
  return {button:(ref,owner)=>button('AI 关联候选',()=>list(ref,owner))};
}
