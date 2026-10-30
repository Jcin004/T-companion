// SPDX-License-Identifier: AGPL-3.0-only
// Isolated acceptance page reuses the production importer, assets and renderer.
import {blankProject,importPixels} from './outfit-image.js';
import {drawOutfit} from './outfit-compose.js';
import {WALK_TEMPLATE as T} from './outfit-motion.js';
const body=blankProject(),front=await importPixels('./assets/body/owner-base-front.jpg',body.colors,{whiteBackground:true});
for(let p=0;p<3;p++)body.frames[p]=front;
const shirt=blankProject(),catalog={assets:[{id:'body',kind:'body',ready:[true,false,false,false],project:body},{id:'shirt',kind:'top',ready:[true,false,false,false],project:shirt}]};
let step=0,timer;const el=id=>document.getElementById(id);
function render(){
 shirt.colors[10]=el('color').value;
 const pixels=Array(6144).fill('0');for(let y=44;y<64;y++)for(let x=18;x<46;x++)if(front[y*64+x]!=='0'&&(x>=24&&x<40||y<54))pixels[y*64+x]=(y===49&&x>=27&&x<37)?'c':'a';
 for(let p=0;p<3;p++)shirt.frames[p]=pixels.join('');
 for(const [id,height]of [['a',80],['b',64]])drawOutfit(el(id),catalog,{body:'body',height,wear:el('wear').checked?[{asset:'shirt',fit:{scale:1,x:0,y:0}}]:[]},0,timer?T.order[step%4]:1);
}
el('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;step=0;el('play').textContent='播放行走';render();}else{el('play').textContent='停止';timer=setInterval(()=>{step++;render();},T.duration);}};
for(const id of ['wear','color'])el(id).onchange=render;
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(timer);timer=null;step=0;el('play').textContent='播放行走';}});
render();el('status').textContent='原始素体已读取；本页复用衣柜的导入、动作和渲染接口。上衣原件一份，两个人分别穿戴。';
