// SPDX-License-Identifier: AGPL-3.0-only
// The archive owns pictures; skin portraits remain a compatibility projection.
export const archiveImage=value=>typeof value==='string'&&value.length<=1200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const uid=()=> 'picture_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
const skins=catalog=>catalog?[['default',catalog],...(catalog.skins||[]).map(s=>[s.id,s])]:[];
export function archiveReferences(data,id){
  const refs=[];
  for(const [owner,catalog] of Object.entries(data.character_looks||{}))for(const [skinId,skin] of skins(catalog)){
    for(const p of skin.portraits)if(p.asset_id===id)refs.push({owner_id:owner,skin_id:skinId,skin_name:skin.name||'默认皮肤',emotion:p.emotion||'',name:p.name});
  }
  return refs;
}
export function validateArchive(data){
  const archive=data.character_archive;
  if(archive===undefined){
    for(const catalog of Object.values(data.character_looks||{}))for(const [,skin] of skins(catalog))if(skin.portraits.some(p=>p.asset_id!==undefined))throw Error('人物图片缺少档案来源');
    return;
  }
  if(!archive||archive.version!==1||!Array.isArray(archive.items)||archive.items.length>200)throw Error('图片档案格式或数量无效');
  const owners=new Set(['user',...data.characters.map(c=>c.id)]),items=new Map();
  for(const item of archive.items){
    if(!item||!validId(item.id)||items.has(item.id)||!owners.has(item.owner_id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>40||!archiveImage(item.image)||!Number.isFinite(Date.parse(item.created_at))||!['upload','legacy_portrait'].includes(item.source?.type)||typeof item.source.filename!=='string'||item.source.filename.length>160||Object.keys(item.source).some(k=>!['type','filename'].includes(k))||Object.keys(item).some(k=>!['id','owner_id','name','image','created_at','source'].includes(k)))throw Error('图片档案的归属、来源或图片无效');
    items.set(item.id,item);
  }
  for(const [owner,catalog] of Object.entries(data.character_looks||{}))for(const [,skin] of skins(catalog))for(const portrait of skin.portraits){
    if(portrait.asset_id===undefined)continue;
    const asset=items.get(portrait.asset_id);
    if(!asset||asset.owner_id!==owner||asset.image!==portrait.image)throw Error('表情图片的档案引用无效');
  }
}
export function syncArchivePortraits(data){
  const archive=data.character_archive;
  if(!archive)return;
  for(const [owner,catalog] of Object.entries(data.character_looks||{}))for(const [,skin] of skins(catalog))for(const portrait of skin.portraits){
    if(portrait.asset_id!==undefined)continue;
    let asset=archive.items.find(p=>p.owner_id===owner&&p.image===portrait.image);
    if(!asset){asset={id:uid(),owner_id:owner,name:portrait.name||'已有立绘',image:portrait.image,created_at:new Date().toISOString(),source:{type:'legacy_portrait',filename:''}};archive.items.push(asset);}
    portrait.asset_id=asset.id;
  }
  validateArchive(data);
}
export class CharacterArchiveModule{
  constructor(host){this.host=host;}
  async api(path,method,body){
    const parts=path.split('/').filter(Boolean).map(decodeURIComponent),owner=parts[1],id=parts[2];
    if(owner!=='user'&&!this.host.data.characters.some(c=>c.id===owner))throw Error('人物不存在');
    if(method==='GET'){
      // Migration is durable and queued with foreground/background writes.
      const missing=!this.host.data.character_archive||Object.values(this.host.data.character_looks||{}).some(c=>skins(c).some(([,s])=>s.portraits.some(p=>p.asset_id===undefined)));
      if(missing)await this.host.transact(d=>{if(!d.character_archive)d.character_archive={version:1,items:[]};syncArchivePortraits(d);});
      validateArchive(this.host.data);
      return copy(this.host.data.character_archive.items.filter(p=>p.owner_id===owner).map(p=>({...p,references:archiveReferences(this.host.data,p.id)})));
    }
    return this.host.transact(d=>{
      if(!d.character_archive)d.character_archive={version:1,items:[]};syncArchivePortraits(d);
      const items=d.character_archive.items;
      if(method==='POST'&&!id){
        if(!validId(body?.id))throw Error('图片请求标识无效');
        const existing=items.find(p=>p.id===body.id);
        if(existing){if(existing.owner_id!==owner||existing.image!==body.image||existing.source.type!=='upload'||existing.source.filename!==body.filename)throw Error('图片请求标识已被使用');return existing;}
        const item={id:body.id,owner_id:owner,name:body.name,image:body.image,created_at:new Date().toISOString(),source:{type:'upload',filename:body.filename}};
        items.push(item);validateArchive(d);return item;
      }
      const item=items.find(p=>p.id===id&&p.owner_id===owner);
      if(!item)throw Error('图片不存在或不属于此人物');
      if(method==='PATCH'&&parts.length===3){item.name=body?.name;validateArchive(d);return item;}
      if(method==='DELETE'&&parts.length===3){if(archiveReferences(d,id).length)throw Error('图片仍用于表情，请先在表情区域解除使用');items.splice(items.indexOf(item),1);validateArchive(d);return {ok:true};}
      throw Error('不支持的档案操作');
    });
  }
}
