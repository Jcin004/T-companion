// SPDX-License-Identifier: AGPL-3.0-only
// Editable indexed clothing pixels. No DOM, requests or storage.
import {CLOTHING_TEMPLATE as T,BODY_COLORS,bodyPixels} from './clothing-template.js';
import {validateDrawing,drawingSize,refineDrawing} from './clothing-project.js';
import {connectedFill} from './piskel-connected-fill.js';
const W=T.width,H=T.height;
export function paintLine(pixels,from,to,{unit=1,color=1,mirror=false,width=W,height=H}={}){
  if(![1,2,4].includes(unit)||!Number.isInteger(color)||color<0||color>15)throw Error('画笔单位或颜色无效');
  const a=from.map(v=>Math.floor(v/unit)),b=to.map(v=>Math.floor(v/unit));
  const steps=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
  for(let i=0;i<=steps;i++){
    const x=Math.round(a[0]+(b[0]-a[0])*(steps?i/steps:0))*unit,y=Math.round(a[1]+(b[1]-a[1])*(steps?i/steps:0))*unit;
    for(let j=0;j<unit;j++)for(let k=0;k<unit;k++)if(x+k>=0&&x+k<width&&y+j>=0&&y+j<height){pixels[(y+j)*width+x+k]=color;if(mirror)pixels[(y+j)*width+width-1-x-k]=color;}
  }
}
export function fillPixels(pixels,x,y,color,{width=W,height=H}={}){
  const frame={getWidth:()=>width,getHeight:()=>height,getPixel(x,y){if(x<0||x>=width||y<0||y>=height)throw Error('bounds');return pixels[y*width+x];},setPixel(x,y,value){pixels[y*width+x]=value;}};
  connectedFill(frame,x,y,color);
}
export function compositePixels(project,index,{clothes=true,body=true}={}){
  const {width,height,scale}=drawingSize(project),pixels=bodyPixels(Math.floor(index/3),index%3),paint=project.frames[index],out=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){
    const n=clothes?parseInt(paint[i],16):0;
    const base=pixels[Math.floor(i/width/scale)*W+Math.floor(i%width/scale)];
    const color=n?project.colors[n]:body&&base?BODY_COLORS[base]:null;
    if(color){out[i*4]=parseInt(color.slice(1,3),16);out[i*4+1]=parseInt(color.slice(3,5),16);out[i*4+2]=parseInt(color.slice(5,7),16);out[i*4+3]=255;}
  }
  return out;
}
export class PaintSession{
  constructor(project){validateDrawing(project);this.project=JSON.parse(JSON.stringify(project));this.undoStack=[];this.redoStack=[];this.stroke=null;}
  begin(index){this.cancel();this.stroke={index,before:this.project.frames[index],pixels:Uint8Array.from(this.project.frames[index],n=>parseInt(n,16))};}
  finish(){if(!this.stroke)return false;const {index,before,pixels}=this.stroke;this.stroke=null;const after=Array.from(pixels,n=>n.toString(16)).join('');if(before===after)return false;this.undoStack.push({index,before,after});if(this.undoStack.length>40)this.undoStack.shift();this.redoStack=[];this.project.frames[index]=after;return true;}
  cancel(){this.stroke=null;}
  refine(){this.cancel();if(drawingSize(this.project).scale===2)return false;const after=refineDrawing(this.project);this.undoStack.push({project:true,before:this.project,after});if(this.undoStack.length>40)this.undoStack.shift();this.redoStack=[];this.project=after;return true;}
  recolor(index,color){const before=this.project.colors[index];if(before===color)return false;this.undoStack.push({palette:true,index,before,after:color});if(this.undoStack.length>40)this.undoStack.shift();this.redoStack=[];this.project.colors[index]=color;return true;}
  undo(){this.cancel();const item=this.undoStack.pop();if(!item)return false;if(item.project)this.project=JSON.parse(JSON.stringify(item.before));else this.project[item.palette?'colors':'frames'][item.index]=item.before;this.redoStack.push(item);return true;}
  redo(){this.cancel();const item=this.redoStack.pop();if(!item)return false;if(item.project)this.project=JSON.parse(JSON.stringify(item.after));else this.project[item.palette?'colors':'frames'][item.index]=item.after;this.undoStack.push(item);return true;}
  preview(){if(!this.stroke)return this.project;const p={...this.project,frames:[...this.project.frames]};p.frames[this.stroke.index]=Array.from(this.stroke.pixels,n=>n.toString(16)).join('');return p;}
}
