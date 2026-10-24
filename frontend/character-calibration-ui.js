// SPDX-License-Identifier: AGPL-3.0-only
// Pointer gestures and previews only. The atlas editor owns draft mutation.
import {atlasMeta} from './character-looks.js';
import {loadArtImage,previewRoom} from './world-art.js';
import {defaultCalibration,frameView,locateCalibration,drawCalibrationGuide} from './sprite-calibration.js';

export function mountCalibration(root,{prefix,canvas,getAtlas,getLook,key,direction,commit,move,draw,valid,error}){
  const panel=document.createElement('details');panel.className='looks-calibration';panel.hidden=true;
  panel.innerHTML=`<summary>大小与落地 · 房间试穿</summary><p>先定位脚底，再定位头顶。轮廓只作身高对照，校准应用到这一组动作。</p><div class="looks-calibration-tools"><button type="button" data-mode="foot">定位脚底</button><button type="button" data-mode="head">定位头顶</button><button type="button" data-mode="drag">拖动这一格</button></div><p class="calibration-hint" role="status"></p><div class="looks-resource-tools"><button type="button" data-zoom="1">1 倍</button><button type="button" data-zoom="2">2 倍</button><button type="button" data-zoom="4">4 倍</button></div><label>房间中的身高 <output></output><input aria-label="房间中的身高" type="range" min="6" max="35" step="1"></label><canvas class="looks-room-preview" width="192" height="288" aria-label="房间试穿预览"></canvas><button type="button" class="looks-text-button calibration-reset">恢复原来的显示比例</button>`;
  root.insertBefore(panel,root.querySelector('.looks-import-advanced'));
  const stage=document.createElement('div');stage.className='looks-calibration-stage';canvas.before(stage);stage.append(canvas);
  canvas.setAttribute('aria-label','姿势预览与脚底校准');canvas.style.touchAction='none';
  const hint=panel.querySelector('.calibration-hint'),slider=panel.querySelector('input'),output=panel.querySelector('output'),room=panel.querySelector('canvas');
  const guideLabel=document.createElement('label');guideLabel.className='looks-checkbox calibration-guide';guideLabel.innerHTML='<input type="checkbox" checked>显示对照线与轮廓';hint.after(guideLabel);const guide=guideLabel.querySelector('input');
  slider.min='30';slider.max='175';slider.step='5';slider.setAttribute('aria-label','房间中的大小');slider.closest('label').firstChild.textContent='房间中的大小 ';
  panel.insertBefore(root.querySelector('.looks-frame-adjustments'),slider.closest('label'));
  const preview=canvas.closest('.looks-animation-preview'),placeholder=document.createComment('sprite preview');preview.before(placeholder);panel.open=true;
  room.id=prefix+'-room-preview';
  let mode='foot',zoom=1,image=null,view=null,atlas=null,pointers=new Map(),gesture=null,pinched=false,roomGeneration=0;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  guide.onchange=safe(()=>draw());
  function setZoom(value){zoom=Math.max(1,Math.min(4,value));canvas.style.width=192*zoom+'px';canvas.style.maxWidth='none';canvas.style.height=192*zoom+'px';}
  function cancel(){pointers.clear();gesture=null;pinched=false;roomGeneration++;}
  function selectMode(value){cancel();mode=value;for(const b of panel.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));hint.textContent=mode==='drag'?'拖动预览中的小人，松手后调整这一格；双指可缩放和平移。':mode==='foot'?'在姿势预览中点脚底接地处；双指可缩放和平移。':'在姿势预览中点头顶，确定人物实际身高。';}
  selectMode('foot');setZoom(1);
  for(const b of panel.querySelectorAll('[data-mode]'))b.onclick=()=>selectMode(b.dataset.mode);
  for(const b of panel.querySelectorAll('[data-zoom]'))b.onclick=()=>setZoom(+b.dataset.zoom);
  async function drawRoom(distance=null){
    const token=++roomGeneration;if(!panel.open||!valid()||!getAtlas())return;
    await previewRoom(room,{...getLook(),sprite:getAtlas()},direction(),distance,()=>token===roomGeneration&&valid());
  }
  panel.ontoggle=safe(async()=>{if(panel.open)await refresh();else{cancel();roomGeneration++;}});
  slider.onchange=safe(()=>commit({...getAtlas(),calibration:{...(getAtlas().calibration||defaultCalibration()),world_height:Number(slider.value)/500}}));
  slider.oninput=()=>{output.textContent=slider.value+'%';};
  panel.querySelector('.calibration-reset').onclick=safe(async()=>{const {calibration,...rest}=getAtlas();await commit(rest);});
  async function refresh(){
    cancel();atlas=getAtlas();panel.hidden=!atlas;
    if(!atlas){image=null;view=null;placeholder.before(preview);return;}
    if(preview.parentNode!==panel)panel.insertBefore(preview,hint);
    const current=atlas;image=null;view=null;
    const loaded=await loadArtImage(current.image);if(!valid()||getAtlas()!==current)return;image=loaded;
    const meta=atlasMeta(atlas);view=frameView(canvas.width,canvas.height,image.width/meta.frames,image.height/meta.rowCount);
    slider.value=Math.round((atlas.calibration?.world_height??.20)*500);output.textContent=slider.value+'%';
    panel.querySelector('[data-mode="drag"]').disabled=!atlas.frame_editor?.cells[key()];
    await drawRoom();
  }
  const point=e=>{const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};};
  function locate(p,previous=atlas.calibration,pick=mode){
    const m=atlasMeta(atlas),w=image.width/m.frames,h=image.height/m.rowCount;
    return locateCalibration(previous,pick,Math.round((p.x-view.x)/view.width*w)/w,Math.round((p.y-view.y)/view.height*h)/h);
  }
  function paint(dx=0,dy=0,calibration=atlas.calibration){
    const ctx=canvas.getContext('2d'),m=atlasMeta(atlas),[row,col]=key().split('_').map(Number),fw=image.width/m.frames,fh=image.height/m.rowCount;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    ctx.save();ctx.beginPath();ctx.rect(view.x,view.y,view.width,view.height);ctx.clip();
    ctx.drawImage(image,col*fw,row*fh,fw,fh,view.x+dx*view.scale,view.y+dy*view.scale,view.width,view.height);ctx.restore();
    if(guide.checked)drawCalibrationGuide(ctx,view,calibration);
  }
  canvas.onpointerdown=e=>{
    if(!panel.open||!atlas||getAtlas()!==atlas||!view)return;
    e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){gesture={start:point(e),atlas,slot:key(),mode,calibration:null,dx:0,dy:0};pinched=false;}
    if(pointers.size===2){const [a,b]=[...pointers.values()];gesture={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},scroll:{x:stage.scrollLeft,y:stage.scrollTop}};pinched=true;}
  };
  canvas.onpointermove=e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinched){
      if(pointers.size!==2)return;const [a,b]=[...pointers.values()];setZoom(gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance));
      stage.scrollLeft=gesture.scroll.x+gesture.center.x-(a.x+b.x)/2;stage.scrollTop=gesture.scroll.y+gesture.center.y-(a.y+b.y)/2;return;
    }
    const p=point(e);
    if(mode==='drag'){
      const cell=atlas.frame_editor?.cells[key()];if(!cell)return;
      gesture.dx=Math.round((p.x-gesture.start.x)/view.scale);gesture.dy=Math.round((p.y-gesture.start.y)/view.scale);paint(gesture.dx,gesture.dy);
    }else{gesture.calibration=locate(p);paint(0,0,gesture.calibration);}
  };
  async function end(e,cancelled=false){
    if(!pointers.has(e.pointerId))return;
    const old=gesture,multi=pinched;pointers.delete(e.pointerId);if(!pointers.size){gesture=null;pinched=false;}
    if(cancelled||multi||!old||!valid()||getAtlas()!==old.atlas||key()!==old.slot){if(!pointers.size)await draw();return;}
    if(old.mode==='drag'){await move(old.dx,old.dy);}
    else{const calibration=old.calibration||locate(point(e),old.atlas.calibration,old.mode);await commit({...old.atlas,calibration});}
  }
  canvas.onpointerup=safe(e=>end(e));canvas.onpointercancel=safe(e=>end(e,true));
  canvas.onlostpointercapture=safe(e=>end(e,true));
  return {refresh,drawRoom,cancel,guides:()=>guide.checked};
}
