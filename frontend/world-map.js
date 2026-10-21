// SPDX-License-Identifier: AGPL-3.0-only
// Original room geometry and palette. No reference screenshot or upstream art.
export const ROOM = Object.freeze({id:'warm-room',name:'暖木小屋',width:12,height:13,tile:24});
export const FURNITURE = Object.freeze([
  {id:'books',name:'书架',x:1,y:2,w:3,h:2,action:'翻阅了书架上的一本书。'},
  {id:'desk',name:'书桌',x:5,y:3,w:2,h:1,action:'在书桌前读了一会儿书。'},
  {id:'lamp',name:'台灯',x:8,y:3,w:1,h:1,action:'切换了台灯的亮光。'},
  {id:'bed',name:'床铺',x:9,y:3,w:2,h:4,action:'整理了床铺。'},
  {id:'plant',name:'盆栽',x:1,y:9,w:1,h:2,action:'给盆栽浇了水。'}
]);
export function collision(positions={},except='user'){
  const cells=Array.from({length:ROOM.width*ROOM.height},(_,i)=>{
    const x=i%ROOM.width,y=Math.floor(i/ROOM.width);
    return x===0||x===11||y<3||y===12||FURNITURE.some(f=>x>=f.x&&x<f.x+f.w&&y>=f.y&&y<f.y+f.h)?1:0;
  });
  for(const [id,p] of Object.entries(positions))if(id!==except)cells[p.y*ROOM.width+p.x]=1;
  return cells;
}
export const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
