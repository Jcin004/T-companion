// SPDX-License-Identifier: AGPL-3.0-only
// Visual assets are separate from roster identity and model context.
const copy=x=>JSON.parse(JSON.stringify(x));
const image=s=>typeof s==='string'&&s.length<=1200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
export const DIRECTIONS=['down','left','right','up'];
export const EXPRESSIONS={neutral:'平静',happy:'开心',sad:'难过',angry:'生气',shy:'害羞',surprised:'惊讶',tired:'疲倦',worried:'担心'};
export const ACTIONS={plant:'浇水',books:'翻书',desk:'阅读',bed:'整理床铺',lamp:'开关灯',window:'拉动窗帘'};
export const expressionChoices=skin=>({...EXPRESSIONS,...skin.expressions});
const key=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,48}$/.test(s);
export function atlasMeta(sprite){
  const frames=sprite?.frames||4,rowCount=sprite?.row_count||4,idle=sprite?.idle_frame??0;
  const others=[0,1,2].filter(i=>i!==idle);
  return {frames,rowCount,idle,rows:sprite?.rows||Object.fromEntries(DIRECTIONS.map((d,i)=>[d,rowCount===1?0:i])),order:sprite?.walk_order||(frames===3?[idle,others[0],idle,others[1]]:Array.from({length:frames},(_,i)=>i))};
}
export function validateAtlas(s){
  if(!s)return;
  if(!image(s.image)||!Number.isInteger(s.frames)||s.frames<1||s.frames>8)throw Error('行走图集格式错误');
  const m=atlasMeta(s);
  if(!Number.isInteger(m.rowCount)||m.rowCount<1||m.rowCount>16||!Number.isInteger(m.idle)||m.idle<0||m.idle>=m.frames||DIRECTIONS.some(d=>!Number.isInteger(m.rows[d])||m.rows[d]<0||m.rows[d]>=m.rowCount)||!Array.isArray(m.order)||!m.order.length||m.order.length>16||m.order.some(f=>!Number.isInteger(f)||f<0||f>=m.frames))throw Error('图集的方向、站立帧或播放顺序无效');
}
function validateSkin(v,nested=false){
  const allowed=['skin','portraits','portrait','sprite','actions','expressions','gestures','ai_allowed',...(nested?['id','name']:['skins','active_skin_id','auto_skin'])];
  if(!v||Object.keys(v).some(k=>!allowed.includes(k))||!Number.isInteger(v.skin)||v.skin<0||v.skin>2||!Array.isArray(v.portraits)||v.portraits.length>24||v.portraits.some(p=>!p||typeof p.name!=='string'||p.name.length>40||!image(p.image)||(p.emotion!==undefined&&!key(p.emotion)))||!Number.isInteger(v.portrait)||v.portrait<0||v.portrait>Math.max(0,v.portraits.length-1))throw Error('人物立绘格式或数量错误');
  const entries=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>16||Object.keys(value).some(k=>!key(k)||['__proto__','constructor','prototype'].includes(k)))throw Error(label+'分类无效');return Object.entries(value);};
  if(v.expressions!==undefined)for(const [id,name]of entries(v.expressions,'自定义表情'))if(Object.prototype.hasOwnProperty.call(EXPRESSIONS,id)||typeof name!=='string'||!name.trim()||name.length>40)throw Error('自定义表情名称无效');
  if(v.gestures!==undefined)for(const g of entries(v.gestures,'小人表情动作').map(([,g])=>g)){if(!g||typeof g.name!=='string'||!g.name.trim()||g.name.length>40||Object.keys(g).some(k=>!['name','atlas'].includes(k)))throw Error('小人动作名称无效');validateAtlas(g.atlas);}
  if(nested&&(!key(v.id)||v.id==='default'||typeof v.name!=='string'||!v.name.trim()||v.name.length>40))throw Error('皮肤名称或标识无效');
  const emotions=v.portraits.map(p=>p.emotion).filter(Boolean);if(new Set(emotions).size!==emotions.length)throw Error('一套皮肤的同一表情只能对应一张图');
  if(v.ai_allowed!==undefined&&typeof v.ai_allowed!=='boolean')throw Error('皮肤 AI 权限无效');
  validateAtlas(v.sprite);
  if(v.actions!==undefined&&(!v.actions||Array.isArray(v.actions)||Object.keys(v.actions).some(k=>!Object.prototype.hasOwnProperty.call(ACTIONS,k))))throw Error('交互动作分类无效');
  for(const s of Object.values(v.actions||{}))validateAtlas(s);
}
export function validateLooks(data){
  const rows=data.character_looks||{},owners=new Set(['user',...data.characters.map(c=>c.id)]);
  if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('人物形象格式错误');
  for(const [id,v] of Object.entries(rows)){
    if(!owners.has(id))throw Error('人物形象归属无效');validateSkin(v);
    if(v.skins!==undefined&&(!Array.isArray(v.skins)||v.skins.length>8))throw Error('每个人物最多八套额外皮肤');
    const ids=new Set(['default']);for(const skin of v.skins||[]){validateSkin(skin,true);if(ids.has(skin.id))throw Error('皮肤标识重复');ids.add(skin.id);}
    if(v.active_skin_id!==undefined&&!ids.has(v.active_skin_id)||v.auto_skin!==undefined&&typeof v.auto_skin!=='boolean')throw Error('当前皮肤或自主换装设置无效');
  }
  return rows;
}
export function lookCatalog(data,id){
  const index=id==='user'?0:(data.world?.residents.indexOf(id)??-1)+1;
  return copy({skins:[],active_skin_id:'default',auto_skin:false,ai_allowed:true,...(validateLooks(data)[id]||{skin:Math.max(0,Math.min(2,index)),portraits:[],portrait:0,sprite:null})});
}
export function skinChoices(catalog){return [{id:'default',name:'默认皮肤',skin:catalog.skin,portraits:catalog.portraits,portrait:catalog.portrait,sprite:catalog.sprite,actions:catalog.actions||{},...(catalog.expressions?{expressions:catalog.expressions}:{}),...(catalog.gestures?{gestures:catalog.gestures}:{}),ai_allowed:catalog.ai_allowed!==false},...(catalog.skins||[])];}
export function lookFor(data,id,skinId){
  const catalog=lookCatalog(data,id),skin=skinChoices(catalog).find(s=>s.id===(skinId||catalog.active_skin_id))||skinChoices(catalog)[0];
  return copy({...skin,skin_id:skin.id,auto_skin:catalog.auto_skin});
}
export function selectSkin(data,id,skinId,ai=false){
  if(id!=='user'&&!data.characters.some(c=>c.id===id))throw Error('人物不存在');
  const catalog=lookCatalog(data,id),skin=skinChoices(catalog).find(s=>s.id===skinId);
  if(!skin||ai&&(id==='user'||!catalog.auto_skin||skin.ai_allowed===false))throw Error('这个人物没有获准使用该皮肤');
  if(ai&&catalog.active_skin_id===skinId)throw Error('已经使用这套皮肤，无需再次换装');
  catalog.active_skin_id=skin.id;data.character_looks={...(data.character_looks||{}),[id]:catalog};return skin.name;
}
export function presentationOptions(data,id){
  const c=lookCatalog(data,id),look=lookFor(data,id);return {current_skin:c.active_skin_id,skins:c.auto_skin?skinChoices(c).filter(s=>s.ai_allowed!==false).map(s=>({id:s.id,name:s.name,expressions:[...new Set(['neutral',...s.portraits.map(p=>p.emotion||'neutral')])]})):[],expressions:[...new Set(['neutral',...look.portraits.map(p=>p.emotion||'neutral')])],expression_names:expressionChoices(look),gestures:Object.entries(look.gestures||{}).filter(([,g])=>g.atlas).map(([id,g])=>({id,name:g.name}))};
}
export class CharacterLooksModule{
  constructor(host){this.host=host;}
  async api(path,method,body){
    const id=decodeURIComponent(path.split('/')[2]||'');
    if(id!=='user'&&!this.host.data.characters.some(c=>c.id===id))throw Error('人物不存在');
    if(method==='GET')return lookCatalog(this.host.data,id);
    if(method!=='PATCH')throw Error('人物形象使用 PATCH 保存');
    return this.host.transact(d=>{const candidate={...lookCatalog(d,id),...copy(body)};d.character_looks={...(d.character_looks||{}),[id]:candidate};validateLooks(d);return candidate;});
  }
}
