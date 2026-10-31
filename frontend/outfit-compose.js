// SPDX-License-Identifier: AGPL-3.0-only
// Disposable renderer; no persistence or character identity access.
import {bodyPose,garmentCommands,paintGarment,WALK_TEMPLATE as T} from './outfit-motion.js';
import {drawingSize} from './clothing-project.js';
import {pixelCanvas} from './outfit-image.js';
const slots={top:['torso','leftArm','rightArm'],bottom:['leftLeg','rightLeg'],shoes:['leftLeg','rightLeg'],hair:['head'],hat:['head'],accessory:['torso']};
const rect=r=>[r.x,r.y,r.width,r.height];
function outputScale(catalog,person){return Math.max(1,...[person.body,...person.wear.map(w=>w.asset)].map(id=>drawingSize(catalog.assets.find(a=>a.id===id)?.project||{}).scale));}
export function drawOutfit(canvas,catalog,person,direction=0,pose=1){
  const scale=outputScale(catalog,person);canvas.width=64*scale;canvas.height=96*scale;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.scale(scale,scale);
  const body=catalog.assets.find(a=>a.id===person.body);if(!body?.ready[direction])return false;
  const bodyScale=drawingSize(body.project).scale,base=direction*3,rest=bodyPose(80,1),target=bodyPose(person.height,pose),source=pixelCanvas(body.project,base+1);
  const custom=/[^0]/.test(body.project.frames[base+pose])&&body.project.frames[base+pose]!==body.project.frames[base+1];
  if(custom)ctx.drawImage(pixelCanvas(body.project,base+pose),0,8*bodyScale,64*bodyScale,80*bodyScale,0,88-person.height,64,person.height);
  else for(const [part,r]of Object.entries(target))ctx.drawImage(source,...rect(rest[part]).map(n=>n*bodyScale),...rect(r));
  for(const kind of ['shoes','bottom','top','hair','hat','accessory']){
    const worn=person.wear.find(w=>catalog.assets.find(a=>a.id===w.asset)?.kind===kind);if(!worn)continue;
    const a=catalog.assets.find(a=>a.id===worn.asset);if(!a.ready[direction])continue;
    const explicit=/[^0]/.test(a.project.frames[base+pose])&&a.project.frames[base+pose]!==a.project.frames[base+1];
    const image=pixelCanvas(a.project,base+(explicit?pose:1));
    const parts=slots[kind].map(slot=>({slot,source:rect(rest[slot])}));
    // Shoes use only the bottom six pixels, not a stretched full leg.
    if(kind==='shoes')for(const p of parts){p.source[1]+=18;p.source[3]=6;p.coverage=[0,.75,1,.25];}
    const commands=garmentCommands({asset:a.id,template:T.id,parts},explicit?bodyPose(person.height,1):target,worn.fit);
    for(const c of commands)c.source=c.source.map(n=>n*drawingSize(a.project).scale);
    paintGarment(ctx,image,commands);
  }
  return true;
}
export function outfitAtlas(catalog,person){
  const used=[person.body,...person.wear.map(w=>w.asset)];
  if(used.some(id=>!catalog.assets.find(a=>a.id===id)?.ready.every(Boolean)))throw Error('本体或已穿衣物缺少方向，请先补齐下、左、右、上');
  const scale=outputScale(catalog,person),atlas=document.createElement('canvas'),frame=document.createElement('canvas');atlas.width=192*scale;atlas.height=384*scale;
  for(let row=0;row<4;row++)for(let pose=0;pose<3;pose++){drawOutfit(frame,catalog,person,row,pose);atlas.getContext('2d').drawImage(frame,pose*64*scale,row*96*scale);}
  return {image:atlas.toDataURL('image/png'),frames:3,row_count:4,rows:{down:0,left:1,right:2,up:3},idle_frame:1,walk_order:[...T.order],calibration:{version:1,foot_x:.5,foot_y:88/96,body_height:person.height/96,world_height:.2*person.height/80}};
}
