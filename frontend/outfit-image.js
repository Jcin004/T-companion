// SPDX-License-Identifier: AGPL-3.0-only
// Browser import/projection only. Indexed editable pixels remain the source of truth.
import {drawingSize,newDrawing} from './clothing-project.js';
export const BASE_PALETTE=['','#302f43','#ffe0ca','#f5c7b1','#edac9b','#f3f0e5','#c9c8c0','#6b7081','#4c5063','#ffffff','#54705c','#78977b','#dfc792','#bc866e','#ad727f','#73949e'];
export function blankProject(){const p=newDrawing();p.colors=[...BASE_PALETTE];p.frames.fill('0'.repeat(6144));return p;}
export async function starterBody(){
  const project=blankProject();
  const front=await importPixels(new URL('./assets/body/owner-base-front.jpg',import.meta.url).href,project.colors,{whiteBackground:true});
  for(let p=0;p<3;p++)project.frames[p]=front;
  for(let d=1;d<4;d++){
    const frame=await importPixels(new URL('./assets/body/generated-standing-directions.png',import.meta.url).href,project.colors,{region:[(d-1)*512,0,512,1024]});
    for(let p=0;p<3;p++)project.frames[d*3+p]=frame;
  }
  return project;
}
const cache=new WeakMap();
export function pixelCanvas(project,index){
  let entries=cache.get(project);if(!entries){entries=new Map();cache.set(project,entries);}const prior=entries.get(index),signature=project.colors.join();if(prior?.frame===project.frames[index]&&prior.signature===signature)return prior.canvas;
  const {width,height}=drawingSize(project),c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d'),rgba=ctx.createImageData(width,height),frame=project.frames[index];
  const colors=project.colors.map(s=>s?[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16),255]:[0,0,0,0]);
  for(let i=0;i<width*height;i++)rgba.data.set(colors[parseInt(frame[i],16)],i*4);ctx.putImageData(rgba,0,0);entries.set(index,{canvas:c,frame,signature});return c;
}
export async function importPixels(url,colors=BASE_PALETTE,{whiteBackground=false,region=null,target=[8,8,48,80],pixelScale=1}={}){
  const image=new Image();image.src=url;await image.decode();
  if(image.width*image.height>4194304)throw Error('图片最多四百万像素');
  const c=document.createElement('canvas');c.width=region?.[2]||image.width;c.height=region?.[3]||image.height;const ctx=c.getContext('2d');
  if(region)ctx.drawImage(image,...region,0,0,c.width,c.height);else ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,c.width,c.height),d=rgba.data;
  if(whiteBackground){
    const seen=new Uint8Array(c.width*c.height),queue=new Uint32Array(seen.length);let head=0,tail=0;
    const push=(x,y)=>{if(x<0||y<0||x>=c.width||y>=c.height)return;const n=y*c.width+x;if(seen[n])return;seen[n]=1;if(Math.min(d[n*4],d[n*4+1],d[n*4+2])>235){d[n*4+3]=0;queue[tail++]=n;}};
    for(let x=0;x<c.width;x++){push(x,0);push(x,c.height-1);}for(let y=0;y<c.height;y++){push(0,y);push(c.width-1,y);}
    while(head<tail){const n=queue[head++],x=n%c.width,y=Math.floor(n/c.width);push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);}ctx.putImageData(rgba,0,0);
  }
  let left=c.width,top=c.height,right=-1,bottom=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>127){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)throw Error('图片没有可见像素');
  target=target.map(n=>n*pixelScale);const width=64*pixelScale,height=96*pixelScale;const out=document.createElement('canvas');out.width=width;out.height=height;const o=out.getContext('2d');o.imageSmoothingEnabled=false;
  const scale=Math.min(target[2]/(right-left+1),target[3]/(bottom-top+1)),w=Math.round((right-left+1)*scale),h=Math.round((bottom-top+1)*scale);
  o.drawImage(c,left,top,right-left+1,bottom-top+1,target[0]+Math.round((target[2]-w)/2),target[1]+target[3]-h,w,h);
  const pixels=o.getImageData(0,0,width,height).data,palette=colors.map(s=>s?[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)]:null);
  return Array.from({length:width*height},(_,i)=>{if(pixels[i*4+3]<128)return '0';let best=1,score=Infinity;for(let n=1;n<16;n++){const distance=palette[n].reduce((sum,v,k)=>sum+(v-pixels[i*4+k])**2,0);if(distance<score){score=distance;best=n;}}return best.toString(16);}).join('');
}
