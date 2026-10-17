// SPDX-License-Identifier: AGPL-3.0-only
import {linkTypes} from './memory-links.js';

export function mountMemoryLinks({api,openSource,toast,report}){
  const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
  const dialog=node('dialog','memory-dialog');dialog.id='memory-links-dialog';
  const header=node('header'),heading=node('h2'),close=node('button','icon','×');
  close.type='button';close.setAttribute('aria-label','关闭');close.onclick=()=>dialog.close();header.append(heading,close);
  const content=node('div','memory-dialog-body'),status=node('p','memory-status');status.setAttribute('role','status');
  dialog.append(header,content,status);document.body.append(dialog);
  let busy=false;
  const run=fn=>async()=>{
    if(busy)return;busy=true;status.textContent='处理中…';
    try{await fn();status.textContent='';}catch(error){report(error);status.textContent=error.message;toast(error.message);}finally{busy=false;}
  };
  const button=(text,action)=>{const b=node('button','compact',text);b.type='button';b.onclick=run(action);return b;};
  const field=(label,control)=>{const box=node('label','',label);box.append(control);return box;};
  const refKey=ref=>ref.kind+':'+ref.id;
  const parseRef=value=>{const colon=value.indexOf(':');return {kind:value.slice(0,colon),id:value.slice(colon+1)};};
  async function records(owner){
    const [memories,anchors]=await Promise.all([api('/memories?owner='+encodeURIComponent(owner)),api('/self?owner='+encodeURIComponent(owner))]);
    return [...memories.map(m=>({...m,kind:'memory',memory_kind:m.kind})),...anchors.map(a=>({...a,kind:'anchor',title:a.label}))];
  }
  function show(title){heading.textContent=title;content.replaceChildren();status.textContent='';if(!dialog.open)dialog.showModal();}
  function details(record,owner,back){
    show(record.kind==='memory'?'关联记忆':'关联核心标签');
    content.append(button('返回关联',back),node('h3','',record.title),node('p','memory-text',record.content||record.interpretation));
    if(record.kind==='memory')for(const source of record.evidence){const b=button('原话 #'+source.message_id+' · '+source.quote,()=>openSource(source.message_id,owner));b.classList.add('memory-source');content.append(b);}
    else content.append(node('blockquote','memory-text',record.quote));
  }
  async function open(ref,owner){
    const [rows,all]=await Promise.all([api('/memory-links?owner='+encodeURIComponent(owner)+'&kind='+ref.kind+'&node='+encodeURIComponent(ref.id)),records(owner)]);
    const current=all.find(n=>refKey(n)===refKey(ref));if(!current)throw Error('记忆或标签已删除，请刷新');
    show(current.title+' · 关联');
    content.append(node('p','subtle','箭头表示你确认的解读方向，不会自动生成反向关系，也不会让关联人物获得这份记忆。'),button('＋ 新建关联',()=>edit(ref,owner,all)));
    if(!rows.length)content.append(node('p','subtle','还没有关联。可连接另一条记忆，或将记忆作为核心标签的依据。'));
    for(const link of rows){
      const card=node('article','card memory-link');card.dataset.linkId=link.id;
      card.append(node('p','memory-link-direction',link.from.title+' → '+linkTypes[link.type]+' → '+link.to.title),node('p','memory-text',link.note));
      if(link.stale)card.append(node('p','subtle','端点内容已修改，请复核这条关联；编辑保存可确认当前版本。'));
      if(!link.from.active||!link.to.active)card.append(node('p','subtle','包含已暂停召回的记忆，关联仍保留。'));
      const actions=node('div','actions');
      for(const endpoint of [link.from,link.to])actions.append(button('查看：'+endpoint.title,async()=>{
        const latest=await records(owner),record=latest.find(n=>refKey(n)===refKey(endpoint));
        if(!record)throw Error('端点已删除，请刷新');details(record,owner,()=>open(ref,owner));
      }));
      actions.append(button('编辑关联',async()=>edit(ref,owner,await records(owner),link)),button('删除关联',async()=>{
        if(!confirm('只删除这条关联？记忆、标签与原话都会保留。'))return;
        await api('/memory-links/'+link.id+'?owner='+encodeURIComponent(owner),'DELETE');await open(ref,owner);toast('关联已删除');
      }));
      card.append(actions);content.append(card);
    }
  }
  function edit(ref,owner,all,existing){
    show(existing?'编辑关联':'新建关联');
    const from=node('select'),to=node('select'),type=node('select'),note=node('textarea');
    from.id='memory-link-from';to.id='memory-link-to';type.id='memory-link-type';note.id='memory-link-note';note.rows=4;note.maxLength=1000;note.value=existing?.note||'';
    const fill=(select,rows,selected)=>{select.replaceChildren(...rows.map(row=>{const o=node('option','',row.title+(row.active===false?'（已暂停）':''));o.value=refKey(row);return o;}));if(rows.some(row=>refKey(row)===selected))select.value=selected;};
    for(const [value,label] of Object.entries(linkTypes)){const o=node('option','',label);o.value=value;type.append(o);}
    fill(from,all.filter(n=>n.kind==='memory'),ref.kind==='memory'?refKey(ref):undefined);
    type.value=existing?.type||(ref.kind==='anchor'?'supports':'supplements');
    if(existing)from.value=refKey(existing.from);
    const targets=selected=>fill(to,all.filter(n=>n.kind===(type.value==='supports'?'anchor':'memory')&&refKey(n)!==from.value),selected);
    targets(existing?refKey(existing.to):ref.kind==='anchor'?refKey(ref):undefined);
    type.onchange=()=>targets(to.value);from.onchange=()=>targets(to.value);
    content.append(button('返回关联',()=>open(ref,owner)),node('p','subtle','按“起点 → 关系 → 终点”阅读。因果和标签依据都是人工解读，不改写名册或原话。'),field('起点记忆',from),field('关系',type),field('终点',to),field('关联说明（可选）',note));
    const save=button('保存关联',async()=>{
      if(!from.value||!to.value)throw Error('请先创建两条记忆，或创建一条记忆和一个核心标签');
      await api('/memory-links'+(existing?'/'+existing.id:''),existing?'PATCH':'POST',{owner_id:owner,from:parseRef(from.value),to:parseRef(to.value),type:type.value,note:note.value});
      await open(ref,owner);toast('关联已保存');
    });
    save.id='memory-link-save';content.append(save);
  }
  return {button:(ref,owner)=>button(ref.kind==='anchor'?'关联记忆':'查看关联',()=>open(ref,owner))};
}
