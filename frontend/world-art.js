// SPDX-License-Identifier: AGPL-3.0-only
// Original generated assets; see assets/world/PROVENANCE.json.
const root=new URL('./assets/world/',import.meta.url).href;
const images=new Map(),ready=new Map();
export const art={room:root+'warm-room.png',sprites:root+'residents.png',portraits:root+'portraits.png'};
// One cycle spans two tiles. The first frame is also the resting pose.
export function walkFrame(distance,frames=4){return Math.floor(Math.max(0,distance)*frames/2)%frames;}
async function load(src){
  if(!src)return;
  if(!images.has(src))images.set(src,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(src);reject(Error('人物或房间图片加载失败'));};image.src=src;}));
  return images.get(src);
}
export async function loadWorldArt(world){
  const sources=[...Object.values(art)];
  for(const look of Object.values(world.looks||{})){if(look.sprite)sources.push(look.sprite.image);for(const p of look.portraits)sources.push(p.image);}
  for(const src of new Set(sources))ready.set(src,await load(src));
}
export function actorPoint(p,width,height){return {x:(p.x+.5)/12*width,y:(.4+(p.y-3)*.065)*height};}
export function floorPoint(x,y){return {x:Math.floor(x*12),y:Math.round((y-.4)/.065+3)};}
export const visualPlaces={books:{x:.08,y:.06,w:.26,h:.30},desk:{x:.35,y:.20,w:.24,h:.17},lamp:{x:.60,y:.20,w:.10,h:.17},bed:{x:.73,y:.20,w:.23,h:.34},plant:{x:.02,y:.63,w:.17,h:.23},window:{x:.56,y:.01,w:.30,h:.17}};
export function drawRoom(c,width,height,state){
  c.imageSmoothingEnabled=false;c.drawImage(ready.get(art.room),0,0,width,height);
  if(state.curtain){c.fillStyle='#985861';c.fillRect(width*.57,height*.02,width*.26,height*.16);c.fillStyle='#b87780';for(let x=.58;x<.83;x+=.025)c.fillRect(width*x,height*.02,width*.012,height*.16);}
  if(!state.lamp){c.fillStyle='#302b4659';c.fillRect(0,0,width,height);c.fillStyle='#8b785e';c.beginPath();c.ellipse(width*.624,height*.218,width*.015,height*.015,0,0,Math.PI*2);c.fill();}
}
export function drawActor(c,world,id,p,pose={},time=performance.now()){
  const width=c.canvas.width,height=c.canvas.height,look=world.looks[id],point=actorPoint(p,width,height);
  const image=ready.get(look.sprite?.image||art.sprites),frames=look.sprite?.frames||4;
  const row={down:0,left:1,right:2,up:3}[pose.direction||world.state.facing[id]||'down'];
  const cols=look.sprite?frames:12,fw=image.width/cols,fh=image.height/4;
  const frame=pose.walking?walkFrame(pose.distance||0,frames):0,col=look.sprite?frame:look.skin*4+frame;
  const size=Math.round(width*.24),lift=pose.using?Math.sin(time/90)*2:0;
  c.fillStyle='#342b3340';c.beginPath();c.ellipse(point.x,point.y-2,size*.25,size*.07,0,0,Math.PI*2);c.fill();
  c.drawImage(image,col*fw,row*fh,fw,fh,Math.round(point.x-size/2),Math.round(point.y-size+lift),size,size);
  if(pose.using&&pose.action==='plant'){
    const hand=point.x+(world.state.facing[id]==='left'?-1:1)*size*.19,y=point.y-size*.40;
    c.fillStyle='#779284';c.fillRect(hand-6,y,13,10);c.strokeStyle='#c3d5c1';c.lineWidth=3;c.strokeRect(hand-2,y-5,8,6);
    c.fillStyle='#a4d4de';for(let i=0;i<3;i++)c.fillRect(hand-11-i*3,y+10+(Math.floor(time/90)+i)%4*3,2,4);
  }
  c.font=Math.round(width/36)+'px sans-serif';c.textAlign='center';c.fillStyle='#fff3db';c.strokeStyle='#503b35';c.lineWidth=3;
  const name=id==='user'?'我':world.residents.find(r=>r.id===id)?.name||'';c.strokeText(name,point.x,point.y-size-3,width/3);c.fillText(name,point.x,point.y-size-3,width/3);
}
export async function portraitImage(look,avatar){
  const chosen=look.portraits[look.portrait]?.image||avatar;if(chosen)return chosen;
  const image=await load(art.portraits),canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  canvas.getContext('2d').drawImage(image,look.skin*image.width/3,0,image.width/3,image.height,0,0,256,512);
  return canvas.toDataURL('image/png');
}
export async function previewSprite(canvas,look,direction,frame,valid=()=>true){
  const image=await load(look.sprite?.image||art.sprites),frames=look.sprite?.frames||4,cols=look.sprite?frames:12;
  if(!valid())return;
  const col=(look.sprite?0:look.skin*4)+frame%frames,row={down:0,left:1,right:2,up:3}[direction],c=canvas.getContext('2d');
  c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
  c.drawImage(image,col*image.width/cols,row*image.height/4,image.width/cols,image.height/4,0,0,canvas.width,canvas.height);
}
