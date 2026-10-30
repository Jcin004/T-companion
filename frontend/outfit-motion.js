// SPDX-License-Identifier: AGPL-3.0-only
// Shared front-facing motion coordinates, independent of artwork and persistence.
export const WALK_TEMPLATE=Object.freeze({id:'humanoid-front-v1',width:64,height:96,foot:[32,88],order:[1,0,1,2],duration:120});
const regions={torso:[24,44,16,20],leftArm:[18,44,6,24],rightArm:[40,44,6,24],leftLeg:[24,64,8,24],rightLeg:[32,64,8,24],head:[14,8,36,36]};
export function bodyPose(height=80,pose=1){
 if(!Number.isInteger(height)||height<56||height>80||![0,1,2].includes(pose))throw Error('Unsupported body or pose');
 const scale=(height-36)/44,step=pose===1?0:pose===0?-1:1;
 return Object.fromEntries(Object.entries(regions).map(([part,[x,y,w,h]])=>{
  const lift=(part==='leftLeg'&&step<0||part==='rightLeg'&&step>0)?2:0;
  const dx=part==='leftArm'?step*2:part==='rightArm'?-step*2:0;
  return [part,{x:x+dx,y:part==='head'?88-height:88-Math.round((88-y)*scale)-lift,width:w,height:part==='head'?h:Math.max(1,Math.round(h*scale))}];
 }));
}
// Return draw commands referencing the same source texture. No copied per-person asset.
export function garmentCommands(garment,body,fit={}){
 if(!fit||typeof fit!=='object'||Array.isArray(fit)||Object.keys(fit).some(k=>!['x','y','scale'].includes(k)))throw Error('Invalid fit');
 if(garment.template!==WALK_TEMPLATE.id||!Array.isArray(garment.parts)||!garment.parts.length)throw Error('Incompatible garment template');
 const scale=fit.scale??1,x=fit.x??0,y=fit.y??0;
 if(!Number.isFinite(scale)||scale<.5||scale>2||![x,y].every(n=>Number.isInteger(n)&&Math.abs(n)<=32))throw Error('Invalid fit');
 return garment.parts.map(part=>{
  const target=body[part.slot],source=part.source;
  if(!target||!Array.isArray(source)||source.length!==4||!source.every(Number.isInteger)||source[0]<0||source[1]<0||source[2]<1||source[3]<1||source[0]+source[2]>64||source[1]+source[3]>96)throw Error('Invalid garment part');
  const cover=part.coverage||[0,0,1,1];
  if(cover.length!==4||!cover.every(Number.isFinite)||cover[2]<=0||cover[3]<=0||cover.some(n=>Math.abs(n)>4))throw Error('Invalid garment coverage');
  const originY=body.torso.y;
  return {asset:garment.asset,source:[...source],target:[32+x+Math.round((target.x-32+cover[0]*target.width)*scale),originY+y+Math.round((target.y-originY+cover[1]*target.height)*scale),Math.max(1,Math.round(target.width*scale*cover[2])),Math.max(1,Math.round(target.height*scale*cover[3]))]};
 });
}
export function paintGarment(ctx,image,commands){
 ctx.save();ctx.imageSmoothingEnabled=false;
 for(const command of commands)ctx.drawImage(image,...command.source,...command.target);
 ctx.restore();
}
