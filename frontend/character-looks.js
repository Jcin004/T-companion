// SPDX-License-Identifier: AGPL-3.0-only
// Visual assets are separate from roster identity and model context.
const copy=x=>JSON.parse(JSON.stringify(x));
const image=s=>typeof s==='string'&&s.length<=1200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
export function validateLooks(data){
  const rows=data.character_looks||{},owners=new Set(['user',...data.characters.map(c=>c.id)]);
  if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('人物形象格式错误');
  for(const [id,v] of Object.entries(rows)){
    if(!owners.has(id)||!v||Object.keys(v).some(k=>!['skin','portraits','portrait','sprite'].includes(k))||!Number.isInteger(v.skin)||v.skin<0||v.skin>2||!Array.isArray(v.portraits)||v.portraits.length>8||v.portraits.some(p=>!p||typeof p.name!=='string'||p.name.length>40||!image(p.image))||!Number.isInteger(v.portrait)||v.portrait<0||v.portrait>Math.max(0,v.portraits.length-1))throw Error('人物立绘格式或数量错误');
    if(v.sprite&&(!image(v.sprite.image)||!Number.isInteger(v.sprite.frames)||v.sprite.frames<1||v.sprite.frames>8))throw Error('行走图集格式错误');
  }
  return rows;
}
export function lookFor(data,id){
  const index=id==='user'?0:(data.world?.residents.indexOf(id)??-1)+1;
  return copy(validateLooks(data)[id]||{skin:Math.max(0,Math.min(2,index)),portraits:[],portrait:0,sprite:null});
}
export class CharacterLooksModule{
  constructor(host){this.host=host;}
  async api(path,method,body){
    const id=decodeURIComponent(path.split('/')[2]||'');
    if(id!=='user'&&!this.host.data.characters.some(c=>c.id===id))throw Error('人物不存在');
    if(method==='GET')return lookFor(this.host.data,id);
    if(method!=='PATCH')throw Error('人物形象使用 PATCH 保存');
    return this.host.transact(d=>{const candidate={...lookFor(d,id),...copy(body)};d.character_looks={...(d.character_looks||{}),[id]:candidate};validateLooks(d);return candidate;});
  }
}
