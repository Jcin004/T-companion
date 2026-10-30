// SPDX-License-Identifier: AGPL-3.0-only
// Original pixel geometry. One versioned body, common feet and clock for all layers.
import {SPRITE_STANDARD} from './sprite-reference.js';
export const CLOTHING_TEMPLATE=Object.freeze({id:'t-body-64x96-v1',...SPRITE_STANDARD,frames:3,rows:4,idle:1,order:[1,0,1,2]});
export const BODY_COLORS=Object.freeze(['','#343343','#f4cfb5','#dca98f','#fff4dc','#c9c4b5','#606b79','#424c5b']);
export const CLOTHING_COLORS=Object.freeze(['','#343343','#54705c','#78977b','#b2c5a5','#f5e8cc','#d1bb92','#bc866e','#915e54','#dda6a0','#ad727f','#73949e','#4e6d8b','#b7a0c7','#766681','#dfb460']);
const {width:W,height:H}=CLOTHING_TEMPLATE;
function painter(pixels){
  const rect=(x,y,w,h,c)=>{for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)for(let i=Math.max(0,x);i<Math.min(W,x+w);i++)pixels[j*W+i]=c;};
  const poly=(points,c)=>{for(let y=0;y<H;y++){const xs=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let i=0;i<xs.length;i+=2)rect(Math.ceil(xs[i]),y,Math.ceil(xs[i+1])-Math.ceil(xs[i]),1,c);}};
  return {rect,poly};
}
const cache=new Map();
export function bodyPixels(row,pose){
  const key=row*3+pose;if(cache.has(key))return cache.get(key).slice();
  const p=new Uint8Array(W*H),{rect,poly}=painter(p),side=row===1||row===2,s=pose===1?0:pose===0?-1:1;
  // The soles of the supporting foot stay at y=88 in every pose.
  if(side){
    poly([[28,62],[37,62],[37+s*5,81],[40+s*6,84],[40+s*6,88],[27+s*6,88],[27+s*5,82]],1);
    poly([[29,63],[35,63],[35+s*5,82],[29+s*5,84]],2);
    poly([[29,62],[36,62],[36-s*5,81],[39-s*6,84],[39-s*6,88],[27-s*6,88],[27-s*5,82]],1);
    poly([[30,63],[35,63],[35-s*5,82],[29-s*5,84]],2);
    rect(28,86,9,1,5);
  }else{
    for(const [x,step]of [[24,s],[33,-s]]){const lift=step===-1?2:0;rect(x-1,66,10,22-lift,1);rect(x,67,8,17-lift,2);rect(x,84-lift,8,2,4);}
  }
  const lx=side?26:23,rx=side?39:41;
  poly([[lx,43],[rx,43],[rx+1,65],[lx-1,65]],1);rect(lx+1,44,rx-lx-1,19,4);rect(lx,63,rx-lx,7,6);rect(lx+1,64,rx-lx-2,2,7);
  const arms=side?[[27,s*3]]:[[20,s*3],[40,-s*3]];
  for(const [x,shift]of arms){poly([[x,44],[x+4,45],[x+5+shift,62],[x+3+shift,67],[x-2+shift,65]],1);poly([[x+1,46],[x+3,47],[x+3+shift,63],[x+shift,64]],2);}
  rect(29,37,6,8,1);rect(30,38,4,6,2);
  const head=side?[[28,8],[38,8],[38,10],[42,10],[42,14],[45,14],[45,32],[42,32],[42,37],[26,37],[26,35],[20,35],[20,30],[18,30],[18,17],[21,17],[21,12],[25,12],[25,10],[28,10]]:
    [[25,8],[39,8],[39,10],[43,10],[43,13],[46,13],[46,18],[48,18],[48,32],[46,32],[46,36],[41,36],[41,38],[23,38],[23,36],[18,36],[18,32],[16,32],[16,18],[18,18],[18,13],[21,13],[21,10],[25,10]];
  poly(head,1);poly(head.map(([x,y])=>[x<32?x+1:x-1,y<23?y+1:y-1]),2);
  rect(side?40:44,21,side?3:2,11,3);
  if(row===0){rect(23,25,3,3,1);rect(38,25,3,3,1);rect(29,33,6,1,3);}else if(side){rect(21,25,3,3,1);rect(27,30,3,3,3);}
  if(row===2){for(let y=0;y<H;y++)for(let x=0;x<W/2;x++){const a=y*W+x,b=y*W+W-1-x;[p[a],p[b]]=[p[b],p[a]];}}
  cache.set(key,p);return p.slice();
}
export function starterClothes(row,pose){
  const p=new Uint8Array(W*H),body=bodyPixels(row,pose),{rect}=painter(p),side=row===1||row===2;
  // A simple vest is a drawing starter, not an automatic cross-pose mapping.
  rect(side?26:23,45,side?14:18,18,2);rect(side?27:24,45,side?3:4,18,3);
  rect(side?29:28,44,side?5:8,4,0);rect(side?29:30,48,side?2:4,13,4);
  for(let i=0;i<p.length;i++)if(!body[i]||body[i]===1)p[i]=0;
  return Array.from(p,n=>n.toString(16)).join('');
}
