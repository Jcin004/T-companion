// SPDX-License-Identifier: AGPL-3.0-only
// Fixed measuring outline, traced as geometry from the user-approved base-body
// preview. No private reference image is bundled. Not a wearable body layer.
export const SPRITE_STANDARD=Object.freeze({width:64,height:96,bodyHeight:80,footX:32,footY:88,worldHeight:.20});
export const FRAME_WORLD_HEIGHT=SPRITE_STANDARD.worldHeight*SPRITE_STANDARD.height/SPRITE_STANDARD.bodyHeight;
const outline=[[-56,0],[56,0],[56,13],[82,13],[82,26],[95,26],[95,39],[107,39],[107,77],[119,77],[119,172],[132,172],[132,209],[119,209],[119,222],[107,222],[107,235],[82,235],[82,248],[31,248],[31,274],[56,274],[56,286],[70,286],[70,300],[82,300],[82,350],[95,350],[95,393],[107,393],[107,431],[119,431],[119,468],[107,468],[107,481],[82,481],[82,648],[69,648],[69,658],[12,658],[12,648],[-12,648],[-12,658],[-69,658],[-69,648],[-82,648],[-82,481],[-107,481],[-107,468],[-119,468],[-119,431],[-107,431],[-107,393],[-95,393],[-95,350],[-82,350],[-82,300],[-70,300],[-70,286],[-56,286],[-56,274],[-31,274],[-31,248],[-82,248],[-82,235],[-95,235],[-95,222],[-119,222],[-119,209],[-132,209],[-132,172],[-119,172],[-119,77],[-107,77],[-107,39],[-95,39],[-95,26],[-82,26],[-82,13],[-56,13]];

export function referenceView(width,height){
  const scale=Math.min(width/SPRITE_STANDARD.width,height/SPRITE_STANDARD.height);
  return {x:width/2,y:(height-SPRITE_STANDARD.height*scale)/2+SPRITE_STANDARD.footY*scale,height:SPRITE_STANDARD.bodyHeight*scale};
}

export function drawBodyReference(ctx,point,height,{labels=false}={}){
  ctx.save();ctx.strokeStyle='#41695b';ctx.lineWidth=1;ctx.fillStyle='#51766522';ctx.setLineDash([]);
  ctx.beginPath();outline.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](point.x+x/658*height,point.y-height+y/658*height));ctx.closePath();ctx.fill();ctx.stroke();
  // Hands, legs and neckline remain legible without drawing face or clothing.
  ctx.beginPath();ctx.moveTo(point.x,point.y-height*.25);ctx.lineTo(point.x,point.y-height*.01);ctx.stroke();
  ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(4,point.y);ctx.lineTo(ctx.canvas.width-4,point.y);
  ctx.moveTo(4,point.y-height);ctx.lineTo(ctx.canvas.width-4,point.y-height);ctx.stroke();ctx.setLineDash([]);
  if(labels){ctx.font='11px sans-serif';ctx.textAlign='left';ctx.fillStyle='#25483b';ctx.fillText('标准头顶',5,Math.max(12,point.y-height-5));ctx.fillText('固定地面',5,point.y-5);}
  ctx.fillStyle='#315b49';ctx.beginPath();ctx.arc(point.x,point.y,2,0,Math.PI*2);ctx.fill();ctx.restore();
}
