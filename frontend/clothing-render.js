// SPDX-License-Identifier: AGPL-3.0-only
// Canvas is a disposable projection of the editable project.
import {CLOTHING_TEMPLATE as T} from './clothing-template.js';
import {drawingSize} from './clothing-project.js';
import {compositePixels} from './pixel-paint.js';
export function renderClothingFrame(canvas,project,index,options){
  const {width,height}=drawingSize(project);canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);
  image.data.set(compositePixels(project,index,options));ctx.putImageData(image,0,0);return canvas;
}
export function clothingAtlas(project){
  const {width,height}=drawingSize(project),canvas=document.createElement('canvas'),frame=document.createElement('canvas');canvas.width=width*3;canvas.height=height*4;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(let i=0;i<12;i++){renderClothingFrame(frame,project,i);ctx.drawImage(frame,i%3*width,Math.floor(i/3)*height);}
  return {image:canvas.toDataURL('image/png'),frames:3,row_count:4,rows:{down:0,left:1,right:2,up:3},idle_frame:1,walk_order:[...T.order],calibration:{version:1,foot_x:T.footX/T.width,foot_y:T.footY/T.height,body_height:T.bodyHeight/T.height,world_height:T.worldHeight}};
}
