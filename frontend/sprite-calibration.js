// SPDX-License-Identifier: AGPL-3.0-only
// Normalized frame coordinates. No storage, image decoding or UI ownership.
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

export function drawCalibrationGuide(ctx,view,calibration){
  const a=calibration||defaultCalibration(),x=view.x+a.foot_x*view.width,y=view.y+a.foot_y*view.height,h=a.body_height*view.height;
  ctx.save();ctx.strokeStyle='#517665';ctx.lineWidth=1;ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(x,view.y);ctx.lineTo(x,view.y+view.height);ctx.moveTo(view.x,y);ctx.lineTo(view.x+view.width,y);
  ctx.moveTo(view.x,y-h);ctx.lineTo(view.x+view.width,y-h);ctx.stroke();
  // A measuring silhouette, not a wearable body or generated character asset.
  ctx.fillStyle='#51766518';ctx.beginPath();ctx.ellipse(x,y-h*.77,h*.18,h*.23,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-h*.13,y-h*.54);ctx.lineTo(x+h*.13,y-h*.54);ctx.lineTo(x+h*.16,y-h*.22);ctx.lineTo(x+h*.10,y);ctx.lineTo(x-h*.10,y);ctx.lineTo(x-h*.16,y-h*.22);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.setLineDash([]);ctx.fillStyle='#315b49';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.restore();
}
