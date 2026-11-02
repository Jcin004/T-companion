// SPDX-License-Identifier: AGPL-3.0-only
// Source assets are shared; wearer bindings own fit and body proportions.
import {originalEdition,ensureAdaptation} from './outfit-adaptation.js';
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
  if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.assets)||value.assets.length>128||!value.people||typeof value.people!=='object'||Array.isArray(value.people)||Object.keys(value).some(k=>!['version','revision','assets','people','sets','last_operation'].includes(k)))throw Error('衣柜数据格式错误');
  if(value.last_operation!==undefined&&(!key(value.last_operation?.id)||!Number.isSafeInteger(value.last_operation.base_revision)||value.last_operation.base_revision<0||Object.keys(value.last_operation).some(k=>!['id','base_revision'].includes(k))))throw Error('衣柜操作记录无效');
  const ids=new Map();
  for(const a of value.assets){
    if(!a||!key(a.id)||['__proto__','constructor','prototype'].includes(a.id)||ids.has(a.id)||!Object.prototype.hasOwnProperty.call(OUTFIT_KINDS,a.kind)||typeof a.name!=='string'||!a.name.trim()||a.name.length>40||!Number.isSafeInteger(a.revision)||a.revision<0||a.template!==WALK_TEMPLATE.id||!Array.isArray(a.ready)||a.ready.length!==4||a.ready.some(x=>typeof x!=='boolean')||Object.keys(a).some(k=>!['id','name','kind','revision','template','ready','project','draft','editions','draw_order'].includes(k)))throw Error('衣物或本体素材无效');
    validateDrawOrder(a.draw_order);validateDrawing(a.project);if(a.draft!==undefined)validateDrawing(a.draft);
    if(a.ready.some((ready,d)=>ready&&!/[^0]/.test(a.project.frames[d*3+1])))throw Error('已完成方向缺少站立像素');
    if(a.editions!==undefined){
      if(!Array.isArray(a.editions)||a.editions.length>128)throw Error('衣物原版历史无效');
      const versions=new Set();
      for(const e of a.editions){
        if(!e||!Number.isSafeInteger(e.revision)||e.revision<0||e.revision>=a.revision||versions.has(e.revision)||Object.keys(e).some(k=>!['revision','project','ready','draw_order'].includes(k)))throw Error('衣物原版历史无效');
        versions.add(e.revision);validateDrawOrder(e.draw_order);validateDrawing(e.project);validateReady(e.ready,e.project);
      }
    }
    ids.set(a.id,a);
  }
  for(const [id,p]of Object.entries(value.people)){
    if(['__proto__','constructor','prototype'].includes(id)||!owners.has(id)||!p||!Number.isInteger(p.height)||ids.get(p.body)?.kind!=='body'||!Array.isArray(p.wear)||p.wear.length>6||Object.keys(p).some(k=>!['body','height','wear','adaptations'].includes(k)))throw Error('人物穿搭引用无效');
    bodyPose(p.height);const kinds=new Set();
    if(p.adaptations!==undefined){
      if(!p.adaptations||typeof p.adaptations!=='object'||Array.isArray(p.adaptations)||Object.keys(p.adaptations).length>128)throw Error('人物适配无效');
      for(const [assetId,adjustment]of Object.entries(p.adaptations)){
        const asset=ids.get(assetId);
        if(!asset||asset.kind==='body'||!adjustment||!Number.isSafeInteger(adjustment.revision)||adjustment.revision<0||Object.keys(adjustment).some(k=>!['revision','fit','project','ready','draft'].includes(k)))throw Error('人物适配引用无效');
        originalEdition(asset,adjustment.revision);
        garmentCommands({asset:asset.id,template:asset.template,parts:[{slot:'torso',source:[24,44,16,20]}]},bodyPose(p.height),adjustment.fit);
        if(adjustment.project!==undefined){validateDrawing(adjustment.project);validateReady(adjustment.ready,adjustment.project);}
        else if(adjustment.ready!==undefined)throw Error('人物适配缺少绘画');
        if(adjustment.draft!==undefined)validateDrawing(adjustment.draft);
      }
    }
    for(const worn of p.wear){const a=ids.get(worn.asset);if(!a||a.kind==='body'||kinds.has(a.kind)||Object.keys(worn).some(k=>!['asset','fit'].includes(k)))throw Error('穿戴部位重复或素材不存在');if(p.adaptations?.[a.id]&&['scale','x','y'].some(k=>worn.fit?.[k]!==p.adaptations[a.id].fit?.[k]))throw Error('穿戴位置与人物适配不一致');kinds.add(a.kind);garmentCommands({asset:a.id,template:a.template,parts:[{slot:'torso',source:[24,44,16,20]}]},bodyPose(p.height),worn.fit);}
  }
  if(value.sets!==undefined){
    if(!Array.isArray(value.sets)||value.sets.length>64)throw Error('搭配数量无效');
    const seen=new Set();
    for(const set of value.sets){
      if(!set||!key(set.id)||seen.has(set.id)||typeof set.name!=='string'||!set.name.trim()||set.name.length>40||!Array.isArray(set.assets)||set.assets.length>6||Object.keys(set).some(k=>!['id','name','assets'].includes(k)))throw Error('搭配无效');
      seen.add(set.id);const slots=new Set();
      for(const id of set.assets){const a=ids.get(id);if(!a||a.kind==='body'||slots.has(a.kind))throw Error('搭配衣物无效');slots.add(a.kind);}
    }
  }
}
function validateDrawOrder(value){if(value!==undefined&&(!Array.isArray(value)||value.length!==4||value.some(v=>!['default','behind','front'].includes(v))))throw Error('图层遮挡设置无效');}
function validateReady(ready,project){
  if(!Array.isArray(ready)||ready.length!==4||ready.some((v,d)=>typeof v!=='boolean'||v&&!/[^0]/.test(project.frames[d*3+1])))throw Error('方向完成状态无效');
}

export function outfitRequest(host,method,body){
  const current=host.data.outfit_catalog||emptyOutfits();
  if(method==='GET')return copy(current);
  if(method!=='PUT'||!body||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)throw Error('衣柜写入请求无效');
  if(body.request_id!==undefined&&!key(body.request_id))throw Error('衣柜操作标识无效');
  return host.transact(d=>{
    const state=d.outfit_catalog||emptyOutfits(),next=copy(body.catalog);
    if(body.request_id&&state.last_operation?.id===body.request_id&&state.last_operation.base_revision===body.expected_revision)return state;
    validateOutfits(next,new Set(['user',...d.characters.map(c=>c.id)]));
    const fingerprint=value=>{const v=copy(value);v.revision=0;delete v.last_operation;for(const a of v.assets||[])a.revision=0;return JSON.stringify(v);};
    const same=(a,b)=>fingerprint(a)===fingerprint(b);
    if(body.expected_revision>state.revision)throw Error('衣柜版本无效');
    if(same(state,next))return state;
    if(body.expected_revision!==state.revision)throw Error('衣柜已在别处修改，请重新打开；未覆盖已保存内容');
    if(state.revision>=Number.MAX_SAFE_INTEGER)throw Error('衣柜版本已达上限');
    const prior=new Map(state.assets.map(a=>[a.id,a]));
    for(const a of next.assets){
      const old=prior.get(a.id);
      if(JSON.stringify(a.editions||[])!==JSON.stringify(old?.editions||[]))throw Error('历史原版不能修改');
      a.revision=old?(same(old,a)?old.revision:old.revision+1):0;
      if(!Number.isSafeInteger(a.revision))throw Error('素材版本已达上限');
      if(old&&a.revision!==old.revision){
        // Pin existing wearers before changing the shared source. Draft-only changes
        // also retain the referenced revision so recovery never loses its base.
        for(const p of Object.values(next.people))if((JSON.stringify(a.project)!==JSON.stringify(old.project)||JSON.stringify(a.ready)!==JSON.stringify(old.ready)||JSON.stringify(a.draw_order)!==JSON.stringify(old.draw_order))&&a.kind!=='body'&&p.wear.some(w=>w.asset===a.id))ensureAdaptation(p,old);
        if(Object.values(next.people).some(p=>p.adaptations?.[a.id]?.revision===old.revision)){
          a.editions=[...(a.editions||[]),{revision:old.revision,project:copy(old.project),ready:copy(old.ready),...(old.draw_order?{draw_order:copy(old.draw_order)}:{})}];
        }
        if(a.editions)a.editions=a.editions.filter(e=>Object.values(next.people).some(p=>p.adaptations?.[a.id]?.revision===e.revision));
      }
    }
    validateOutfits(next,new Set(['user',...d.characters.map(c=>c.id)]));
    if(body.request_id)next.last_operation={id:body.request_id,base_revision:body.expected_revision};
    next.revision=state.revision+1;d.outfit_catalog=next;return next;
  });
}
