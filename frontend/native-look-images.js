// SPDX-License-Identifier: AGPL-3.0-only
// The same image fields indexed by Android TLookAssets. No domain writes.
export function visitLookImages(data,transform){
  const field=(o,k)=>{if(o&&typeof o[k]==='string')o[k]=transform(o[k]);};
  const atlas=a=>{
    if(!a)return;field(a,'image');field(a.frame_editor,'base_image');
    for(const cell of Object.values(a.frame_editor?.cells||{}))field(cell,'image');
  };
  const skin=s=>{
    for(const p of s.portraits||[])field(p,'image');atlas(s.sprite);
    for(const a of Object.values(s.actions||{}))atlas(a);
    for(const g of Object.values(s.gestures||{}))atlas(g.atlas);
  };
  for(const item of data.character_archive?.items||[])field(item,'image');
  for(const catalog of Object.values(data.character_looks||{})){skin(catalog);for(const s of catalog.skins||[])skin(s);}
}
export async function imageDigest(image){
  const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(image));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
