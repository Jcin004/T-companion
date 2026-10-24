// SPDX-License-Identifier: AGPL-3.0-only
// Fixed reference and pointer gestures. The atlas editor owns draft mutation.
import {atlasMeta} from './character-looks.js';
import {loadArtImage,previewRoom} from './world-art.js';
import {calibrationForFrame,fittingRect,fittingPercent,fitCalibration,drawCalibrationGuide} from './sprite-calibration.js';

export function mountCalibration(root,{prefix,canvas,getAtlas,getLook,key,direction,commit,move,draw,valid,error}){
  const panel=document.createElement('details');
  panel.className='looks-calibration';panel.hidden=true;
  panel.innerHTML=`<summary>调整大小与落地</summary>
    <label class="looks-checkbox calibration-guide"><input type="checkbox" checked>对照固定素体</label>
    <p class="calibration-standard">64×96 画布 · 身高 80 · 脚底距底边 8 像素</p>
    <button type="button" class="calibration-view-reset" hidden>还原视图</button>
    <div class="calibration-size"><label>人物大小<input aria-label="人物大小百分比" type="text" inputmode="numeric" value="100"></label><span>%</span><button type="button" data-size="-5" aria-label="缩小人物">−</button><button type="button" data-size="5" aria-label="放大人物">＋</button></div>
    <p>拖动图片对齐脚底；大小与落地应用到整组。</p>
    <details class="calibration-room"><summary>房间试穿</summary><canvas class="looks-room-preview" width="256" height="384" aria-label="房间试穿与标准素体对比"></canvas><p>左侧为标准素体，右侧为当前人物。</p></details>
    <details class="calibration-frame-fine" hidden><summary>微调选中姿势</summary></details>
    <button type="button" class="looks-text-button calibration-reset">恢复原来的显示比例</button>`;
  root.insertBefore(panel,root.querySelector('.looks-import-advanced'));
  const stage=document.createElement('div');stage.className='looks-calibration-stage';canvas.before(stage);stage.append(canvas);
  canvas.height=288;canvas.setAttribute('aria-label','固定素体与人物对齐预览');canvas.style.touchAction='none';
  const guide=panel.querySelector('.calibration-guide input'),slider=panel.querySelector('.calibration-size input');
  const room=panel.querySelector('canvas'),roomPanel=panel.querySelector('.calibration-room'),fine=panel.querySelector('.calibration-frame-fine'),viewReset=panel.querySelector('.calibration-view-reset');
  fine.append(root.querySelector('.looks-frame-adjustments'));
  const preview=canvas.closest('.looks-animation-preview'),placeholder=document.createComment('sprite preview');preview.before(placeholder);panel.open=true;
  panel.insertBefore(preview,viewReset);room.id=prefix+'-room-preview';
  let mode='group',zoom=1,image=null,view=null,atlas=null,pointers=new Map(),gesture=null,pinched=false,roomGeneration=0;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  guide.onchange=safe(()=>draw());
  function setZoom(value){
    zoom=Math.max(1,Math.min(4,value));canvas.style.width=192*zoom+'px';canvas.style.maxWidth='none';canvas.style.height=288*zoom+'px';
    viewReset.hidden=zoom===1;
  }
  function cancel(){pointers.clear();gesture=null;pinched=false;roomGeneration++;}
  setZoom(1);viewReset.onclick=()=>setZoom(1);
  fine.ontoggle=()=>{cancel();mode=fine.open?'frame':'group';};
  roomPanel.ontoggle=safe(()=>{if(roomPanel.open)return drawRoom();roomGeneration++;});
  async function drawRoom(distance=null){
    const token=++roomGeneration;if(!panel.open||!roomPanel.open||!valid()||!getAtlas())return;
    await previewRoom(room,{...getLook(),sprite:getAtlas()},direction(),distance,()=>token===roomGeneration&&valid(),guide.checked);
  }
  panel.ontoggle=safe(async()=>{if(panel.open)await refresh();else cancel();});
  function currentCalibration(){
    const m=atlasMeta(atlas);return calibrationForFrame(image.width/m.frames,image.height/m.rowCount,atlas.calibration);
  }
  slider.onchange=safe(()=>{
    const percent=Number(slider.value);
    if(!Number.isFinite(percent)||percent<30||percent>250)throw Error('人物大小请填写 30～250');
    if(image&&getAtlas()===atlas)return commit({...atlas,calibration:fitCalibration(currentCalibration(),{percent})});
  });
  for(const button of panel.querySelectorAll('[data-size]'))button.onclick=safe(async()=>{
    slider.value=String(Math.max(30,Math.min(250,Number(slider.value)+Number(button.dataset.size))));await slider.onchange();
  });
  root.querySelector('.looks-import-advanced').append(panel.querySelector('.calibration-reset'));
  root.querySelector('.calibration-reset').onclick=safe(async()=>{const {calibration,...rest}=getAtlas();await commit(rest);});
  async function refresh(){
    cancel();atlas=getAtlas();panel.hidden=!atlas;
    root.querySelector('.calibration-reset').hidden=!atlas?.calibration;
    if(!atlas){image=null;view=null;placeholder.before(preview);return;}
    if(preview.parentNode!==panel)panel.insertBefore(preview,viewReset);
    const current=atlas;image=null;view=null;
    const loaded=await loadArtImage(current.image);if(!valid()||getAtlas()!==current)return;image=loaded;
    const m=atlasMeta(atlas);view=fittingRect(image.width/m.frames,image.height/m.rowCount,canvas.width,canvas.height,atlas.calibration);
    const percent=Math.round(fittingPercent(currentCalibration()));slider.value=percent;
    fine.hidden=!atlas.frame_editor?.cells[key()];if(fine.hidden){fine.open=false;mode='group';}
    await drawRoom();
  }
  const point=e=>{const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};};
  function paint(calibration=atlas.calibration,dx=0,dy=0){
    const ctx=canvas.getContext('2d'),m=atlasMeta(atlas),[row,col]=key().split('_').map(Number),fw=image.width/m.frames,fh=image.height/m.rowCount;
    const r=fittingRect(fw,fh,canvas.width,canvas.height,calibration);
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,col*fw,row*fh,fw,fh,r.x+dx*r.width/fw,r.y+dy*r.height/fh,r.width,r.height);
    if(guide.checked)drawCalibrationGuide(ctx);
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
    const p=point(e),m=atlasMeta(atlas),fw=image.width/m.frames,fh=image.height/m.rowCount;
    gesture.dx=Math.round((p.x-gesture.start.x)*fw/view.width);gesture.dy=Math.round((p.y-gesture.start.y)*fh/view.height);
    if(mode==='frame')paint(atlas.calibration,gesture.dx,gesture.dy);
    else{
      const a=currentCalibration();gesture.calibration=fitCalibration(a,{footX:a.foot_x-gesture.dx/fw,footY:a.foot_y-gesture.dy/fh});
      paint(gesture.calibration);
    }
  };
  async function end(e,cancelled=false){
    if(!pointers.has(e.pointerId))return;
    const old=gesture,multi=pinched;pointers.delete(e.pointerId);if(!pointers.size){gesture=null;pinched=false;}
    if(cancelled||multi||!old||!valid()||getAtlas()!==old.atlas||key()!==old.slot){if(!pointers.size)await draw();return;}
    if(old.mode==='frame'){if(old.dx||old.dy)await move(old.dx,old.dy);}
    else if(old.calibration)await commit({...old.atlas,calibration:old.calibration});
  }
  canvas.onpointerup=safe(e=>end(e));canvas.onpointercancel=safe(e=>end(e,true));canvas.onlostpointercapture=safe(e=>end(e,true));
  // A wheel above a focused number/range field scrolls its containing page.
  // Prevent the native value change, then forward the scrolling explicitly.
  root.addEventListener('wheel',e=>{
    const focused=document.activeElement;
    if(!e.target.closest('input')&&!(root.contains(focused)&&focused.matches('input')&&focused.closest('label')?.contains(e.target)))return;
    e.preventDefault();let scroller=e.target.parentElement;
    while(scroller&&!(scroller.scrollHeight>scroller.clientHeight+1&&/auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?(scroller?.clientHeight||innerHeight):1);
    if(scroller)scroller.scrollTop+=delta;else window.scrollBy(0,delta);
  },{passive:false,capture:true});
  return {refresh,drawRoom,cancel,guides:()=>guide.checked};
}
