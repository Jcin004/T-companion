// SPDX-License-Identifier: AGPL-3.0-only
// Image composition only. The looks module validates and persists these values.
import {atlasMeta,validateAtlas,DIRECTIONS} from './character-looks.js';
import {previewSprite,loadArtImage} from './world-art.js';
import {fittingRect,drawCalibrationGuide} from './sprite-calibration.js';
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export const frameKey=(atlas,direction,frame)=>atlasMeta(atlas).rows[direction]+'_'+frame;
export function fallbackFrame(look,meta,frame,action=false){
  const m=atlasMeta(look.sprite);
  return action?m.idle:meta.frames===3?[m.order[1]??m.idle,m.idle,m.order[3]??m.order[m.order.length-1]][frame]:m.order[frame%m.order.length];
}
export function framePlacement(width,height,imageWidth,imageHeight,cell){
  const w=Math.max(1,Math.round(imageWidth*cell.scale)),h=Math.max(1,Math.round(imageHeight*cell.scale));
  return {x:Math.round((width-w)/2+cell.x),y:Math.round(height-h+cell.y),width:w,height:h};
}
function boundedImage(c){
  const image=c.toDataURL('image/png');
  if(image.length>1200000)throw Error('合成图超过 900 KB，请缩小图片或画布');
  return image;
}
export async function initializeFrames(atlas,look,meta,source,action=false){
  if(atlas?.frame_editor)return atlas;
  const img=await loadArtImage(source);
  let width,height,base;
  if(atlas){const old=await loadArtImage(atlas.image);width=old.width/meta.frames;height=old.height/meta.row_count;base=atlas.image;}
  else{
    const scale=Math.min(1,128/Math.max(img.width,img.height));width=Math.max(1,Math.round(img.width*scale));height=Math.max(1,Math.round(img.height*scale));
    const c=canvas(width*meta.frames,height*meta.row_count),ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    for(const direction of meta.row_count===1?['down']:DIRECTIONS){
      const row=meta.rows[direction];
      for(let f=0;f<meta.frames;f++){
        const cell=canvas(width,height),index=fallbackFrame(look,meta,f,action);
        await previewSprite(cell,look,direction,index);ctx.drawImage(cell,f*width,row*height);
      }
    }
    base=boundedImage(c);
  }
  const fit=Math.min(16,width/img.width,height/img.height),scale=fit>1?Math.floor(fit):fit;
  return {...(atlas||meta),image:base,frame_editor:{version:1,width,height,scale,base_image:base,cells:{}}};
}
export async function composeFrames(atlas){
  const e=atlas.frame_editor,m=atlasMeta(atlas),base=await loadArtImage(e.base_image),c=canvas(e.width*m.frames,e.height*m.rowCount),ctx=c.getContext('2d');
  ctx.imageSmoothingEnabled=false;ctx.drawImage(base,0,0,c.width,c.height);
  for(const [key,cell]of Object.entries(e.cells)){
    const [row,col]=key.split('_').map(Number),image=await loadArtImage(cell.image),p=framePlacement(e.width,e.height,image.width,image.height,cell);
    ctx.save();ctx.beginPath();ctx.rect(col*e.width,row*e.height,e.width,e.height);ctx.clip();ctx.clearRect(col*e.width,row*e.height,e.width,e.height);
    ctx.drawImage(image,col*e.width+p.x,row*e.height+p.y,p.width,p.height);ctx.restore();
  }
  const result={...atlas,image:boundedImage(c)};validateAtlas(result);return result;
}
export async function replaceFrame(atlas,key,image,adjustment){
  const e=atlas.frame_editor,previous=e.cells[key];
  const cell=adjustment?{...previous,...adjustment}:{image,scale:e.scale,x:0,y:0};
  return composeFrames({...atlas,frame_editor:{...e,cells:{...e.cells,[key]:cell}}});
}
export async function removeFrame(atlas,key){
  const e=atlas.frame_editor,cells={...e.cells};delete cells[key];
  if(!Object.keys(cells).length){const {frame_editor,...rest}=atlas;return {...rest,image:e.base_image};}
  return composeFrames({...atlas,frame_editor:{...e,cells}});
}
export async function drawFrameGuide(c,atlas,direction,frame,look,valid,showGuide=true,showOnion=true){
  const image=await loadArtImage(atlas.image);if(!valid())return;
  const ctx=c.getContext('2d'),m=atlasMeta(atlas),fw=image.width/m.frames,fh=image.height/m.rowCount,row=m.rows[direction];
  const r=fittingRect(fw,fh,c.width,c.height,atlas.calibration);
  ctx.clearRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(image,frame*fw,row*fh,fw,fh,r.x,r.y,r.width,r.height);
  if(!showGuide)return;
  if(showOnion&&frame!==m.idle){
    ctx.save();ctx.globalAlpha=.2;ctx.drawImage(image,m.idle*fw,row*fh,fw,fh,r.x,r.y,r.width,r.height);ctx.restore();
  }
  drawCalibrationGuide(ctx);
}
