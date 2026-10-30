// SPDX-License-Identifier: AGPL-3.0-only
// Source assets are shared; wearer bindings own fit and body proportions.
import {validateDrawing} from './clothing-project.js';
import {jsonSnapshot as copy} from './json-snapshot.js';
import {bodyPose,garmentCommands,WALK_TEMPLATE} from './outfit-motion.js';
export const OUTFIT_KINDS={body:'人物本体',hair:'头发',hat:'帽子',accessory:'配饰',top:'上衣',bottom:'下装',shoes:'鞋子'};
const key=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(s);
export function emptyOutfits(){return {version:1,revision:0,assets:[],people:{}};}
export function outfitDrawingChange(catalog,id,method,body){
  const asset=catalog.assets.find(a=>a.id===id);if(!asset)throw Error('素材已删除');
  if(!['PATCH','POST'].includes(method)||body?.expected_revision!==catalog.revision)throw Error('素材已改变，请重新打开');
  validateDrawing(body.project);const next=copy(catalog),n=next.assets.find(a=>a.id===id);
  if(method==='PATCH')n.draft=copy(body.project);
  else{
    n.project=copy(body.project);
    for(let d=0;d<4;d++)for(const pose of [0,2]){const i=d*3+pose;if(asset.project.frames[i]===asset.project.frames[d*3+1]&&n.project.frames[i]===asset.project.frames[i])n.project.frames[i]=n.project.frames[d*3+1];}
    delete n.draft;n.ready=n.ready.map((_,d)=>/[^0]/.test(n.project.frames[d*3+1]));
  }
  return next;
}
export function validateOutfits(value,owners){
  if(value===undefined)return;
  if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.assets)||value.assets.length>128||!value.people||typeof value.people!=='object'||Array.isArray(value.people)||Object.keys(value).some(k=>!['version','revision','assets','people'].includes(k)))throw Error('衣柜数据格式错误');
  const ids=new Map();
  for(const a of value.assets){
    if(!a||!key(a.id)||['__proto__','constructor','prototype'].includes(a.id)||ids.has(a.id)||!Object.prototype.hasOwnProperty.call(OUTFIT_KINDS,a.kind)||typeof a.name!=='string'||!a.name.trim()||a.name.length>40||!Number.isSafeInteger(a.revision)||a.revision<0||a.template!==WALK_TEMPLATE.id||!Array.isArray(a.ready)||a.ready.length!==4||a.ready.some(x=>typeof x!=='boolean')||Object.keys(a).some(k=>!['id','name','kind','revision','template','ready','project','draft'].includes(k)))throw Error('衣物或本体素材无效');
    validateDrawing(a.project);if(a.draft!==undefined)validateDrawing(a.draft);
    if(a.ready.some((ready,d)=>ready&&!/[^0]/.test(a.project.frames[d*3+1])))throw Error('已完成方向缺少站立像素');
    ids.set(a.id,a);
  }
  for(const [id,p]of Object.entries(value.people)){
    if(['__proto__','constructor','prototype'].includes(id)||!owners.has(id)||!p||!Number.isInteger(p.height)||ids.get(p.body)?.kind!=='body'||!Array.isArray(p.wear)||p.wear.length>6||Object.keys(p).some(k=>!['body','height','wear'].includes(k)))throw Error('人物穿搭引用无效');
    bodyPose(p.height);const kinds=new Set();
    for(const worn of p.wear){const a=ids.get(worn.asset);if(!a||a.kind==='body'||kinds.has(a.kind)||Object.keys(worn).some(k=>!['asset','fit'].includes(k)))throw Error('穿戴部位重复或素材不存在');kinds.add(a.kind);garmentCommands({asset:a.id,template:a.template,parts:[{slot:'torso',source:[24,44,16,20]}]},bodyPose(p.height),worn.fit);}
  }
}
export function outfitRequest(host,method,body){
  const current=host.data.outfit_catalog||emptyOutfits();
  if(method==='GET')return copy(current);
  if(method!=='PUT'||!body||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw Error('衣柜写入请求无效');
  return host.transact(d=>{
    const state=d.outfit_catalog||emptyOutfits(),next=copy(body.catalog);
    validateOutfits(next,new Set(['user',...d.characters.map(c=>c.id)]));
    const fingerprint=value=>JSON.stringify(value,(key,v)=>key==='revision'?0:v);
    const same=(a,b)=>fingerprint(a)===fingerprint(b);
    if(body.expected_revision>state.revision)throw Error('衣柜版本无效');
    if(same(state,next))return state;
    if(body.expected_revision!==state.revision)throw Error('衣柜已在别处修改，请重新打开；未覆盖已保存内容');
    if(state.revision>=Number.MAX_SAFE_INTEGER)throw Error('衣柜版本已达上限');
    const prior=new Map(state.assets.map(a=>[a.id,a]));
    for(const a of next.assets){const old=prior.get(a.id);a.revision=old?(same(old,a)?old.revision:old.revision+1):0;if(!Number.isSafeInteger(a.revision))throw Error('素材版本已达上限');}
    next.revision=state.revision+1;d.outfit_catalog=next;return next;
  });
}
