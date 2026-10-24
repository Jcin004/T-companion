// SPDX-License-Identifier: AGPL-3.0-only
// Normalized frame coordinates. No storage, image decoding or UI ownership.
import {FRAME_WORLD_HEIGHT,SPRITE_STANDARD,referenceView,drawBodyReference} from './sprite-reference.js';
export const defaultCalibration=()=>({version:1,foot_x:.5,foot_y:1,body_height:1,world_height:.20});

export function validateCalibration(value){
  if(value===undefined)return;
  const fields=['version','foot_x','foot_y','body_height','world_height'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k))||value.version!==1||
    !Number.isFinite(value.foot_x)||value.foot_x<0||value.foot_x>1||
    !Number.isFinite(value.foot_y)||value.foot_y<=0||value.foot_y>1||
    !Number.isFinite(value.body_height)||value.body_height<.05||value.body_height>value.foot_y||
    !Number.isFinite(value.world_height)||value.world_height<.06||value.world_height>.35)throw Error('小人脚底或身高校准无效');
}

export function spriteRect(width,height,size,point,calibration){
  if(!calibration){
    const w=size*Math.min(1,width/height),h=size*Math.min(1,height/width);
    return {x:point.x-w/2,y:point.y-h,width:w,height:h};
  }
  const scale=size/(height*calibration.body_height),w=width*scale,h=height*scale;
  return {x:point.x-calibration.foot_x*w,y:point.y-calibration.foot_y*h,width:w,height:h};
}

export function frameView(width,height,frameWidth,frameHeight){
  const scale=Math.min(width/frameWidth,height/frameHeight);
  return {x:(width-frameWidth*scale)/2,y:height-frameHeight*scale,width:frameWidth*scale,height:frameHeight*scale,scale};
}

export function locateCalibration(previous,mode,x,y){
  const next={...(previous||defaultCalibration())};
  if(mode==='foot'){
    const top=next.foot_y-next.body_height;
    next.foot_x=Math.max(0,Math.min(1,x));next.foot_y=Math.max(.05,Math.min(1,y));
    next.body_height=Math.max(.05,next.foot_y-Math.min(top,next.foot_y-.05));
  }else if(mode==='head')next.body_height=Math.max(.05,next.foot_y-Math.max(0,Math.min(next.foot_y-.05,y)));
  validateCalibration(next);return next;
}

export function drawCalibrationGuide(ctx){
  const ref=referenceView(ctx.canvas.width,ctx.canvas.height);
  drawBodyReference(ctx,ref,ref.height,{labels:true});
}

// Preserve the world projection of old skins until the user changes the draft.
export function calibrationForFrame(width,height,calibration){
  return calibration||{...defaultCalibration(),world_height:.24*Math.min(1,height/width)};
}
export function fittingRect(width,height,canvasWidth,canvasHeight,calibration){
  const ref=referenceView(canvasWidth,canvasHeight),a=calibrationForFrame(width,height,calibration);
  return spriteRect(width,height,ref.height*a.world_height/SPRITE_STANDARD.worldHeight,ref,a);
}
export const fittingPercent=a=>a.world_height/a.body_height/FRAME_WORLD_HEIGHT*100;

// v1 stores scale as world_height/body_height. Rebalance that fraction to keep
// its existing validation and backup format while translating without resizing.
export function fitCalibration(previous,{percent,footX=previous.foot_x,footY=previous.foot_y}={}){
  const effective=percent===undefined?previous.world_height/previous.body_height:FRAME_WORLD_HEIGHT*Math.max(30,Math.min(250,percent))/100;
  const y=Math.max(.05,.06/effective,Math.min(1,footY));
  const body=Math.max(.05,.06/effective,Math.min(y,.35/effective,previous.body_height));
  const next={version:1,foot_x:Math.max(0,Math.min(1,footX)),foot_y:y,body_height:body,world_height:Math.max(.06,Math.min(.35,effective*body))};
  validateCalibration(next);return next;
}
