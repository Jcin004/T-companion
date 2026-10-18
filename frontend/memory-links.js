// SPDX-License-Identifier: AGPL-3.0-only
// Relationship rules only. Persistence, model calls and UI belong to their hosts.
export const linkTypes={supplements:'补充',contradicts:'存在矛盾',causes:'是…的起因',results_from:'是…的结果',supports:'作为标签依据'};

export function linkNode(data,owner,ref){
  if(!ref||!['memory','anchor'].includes(ref.kind)||typeof ref.id!=='string')throw Error('请选择有效的记忆或核心标签');
  const rows=ref.kind==='memory'?data.memory.events:data.memory.anchors;
  const node=rows.find(n=>n.id===ref.id&&n.owner_id===owner);
  if(!node)throw Error('关联端点不存在或不属于此人物');
  return node;
}

export function linkValue(data,owner,input){
  if(!data.characters.some(c=>c.id===owner))throw Error('请选择关联所属人物');
  const from=linkNode(data,owner,input.from),to=linkNode(data,owner,input.to);
  if(input.from.kind===input.to.kind&&from.id===to.id)throw Error('不能关联到自身');
  if(!Object.prototype.hasOwnProperty.call(linkTypes,input.type))throw Error('不支持的关联类型');
  if(input.from.kind!=='memory'||(input.type==='supports'?input.to.kind!=='anchor':input.to.kind!=='memory'))throw Error('记忆之间可描述关系；标签依据必须由记忆指向核心标签');
  if(typeof input.note!=='string'||input.note.length>1000)throw Error('请填写关联说明，最多1000字');
  return {owner_id:owner,type:input.type,from:{kind:input.from.kind,id:from.id},to:{kind:input.to.kind,id:to.id},note:input.note.trim(),from_revision:from.revision,to_revision:to.revision};
}

export function validateLinks(data){
  const links=data.memory.links;
  if(!Array.isArray(links)||links.length>5000)throw Error('关联格式或数量错误');
  const ids=new Set(),pairs=new Set();
  for(const link of links){
    linkValue(data,link.owner_id,link);
    if(typeof link.id!=='string'||!link.id||ids.has(link.id)||link.origin!=='manual'||typeof link.created_at!=='string'||typeof link.updated_at!=='string')throw Error('关联标识或来源错误');
    for(const key of ['from_revision','to_revision'])if(!Number.isSafeInteger(link[key])||link[key]<0)throw Error('关联版本错误');
    const key=JSON.stringify([link.owner_id,link.from.kind,link.from.id,link.type,link.to.kind,link.to.id]);
    if(pairs.has(key))throw Error('这条关联已经存在');
    pairs.add(key);ids.add(link.id);
  }
}

export function describeLink(data,link){
  const describe=ref=>{
    const node=linkNode(data,link.owner_id,ref);
    return {...ref,title:ref.kind==='memory'?node.title:node.label,active:ref.kind==='anchor'||node.active};
  };
  const from=linkNode(data,link.owner_id,link.from),to=linkNode(data,link.owner_id,link.to);
  return {...link,from:describe(link.from),to:describe(link.to),stale:from.revision!==link.from_revision||to.revision!==link.to_revision};
}

export function removeNodeLinks(data,kind,id){
  data.memory.links=data.memory.links.filter(l=>!((l.from.kind===kind&&l.from.id===id)||(l.to.kind===kind&&l.to.id===id)));
  data.memory.link_proposals=(data.memory.link_proposals||[]).filter(p=>!((p.from.kind===kind&&p.from.id===id)||(p.to.kind===kind&&p.to.id===id)));
}
