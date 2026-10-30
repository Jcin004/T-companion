// SPDX-License-Identifier: AGPL-3.0-only
import {CLOTHING_TEMPLATE as T} from './clothing-template.js';
import {newDrawing} from './clothing-project.js';
import {PaintSession,paintLine,fillPixels} from './pixel-paint.js';
import {clothingAtlas,renderClothingFrame} from './clothing-render.js';
import {jsonSnapshot as copy} from './json-snapshot.js';

export function mountClothingWorkbench({api,report,toast}){
  const box=document.createElement('dialog');box.id='clothing-workbench';box.className='world-panel clothing-workbench';
  box.innerHTML=`<header><div><h2>画衣服</h2><small class="paint-owner"></small></div><button class="paint-close" aria-label="关闭绘画">× 关闭</button></header>
    <div class="paint-scroll"><p class="paint-note">素体已锁定，画在透明衣服层。每个姿势单独编辑。</p>
    <div class="paint-pose"><label>朝向<select aria-label="绘画朝向">${['向下','向左','向右','向上'].map((s,i)=>`<option value="${i}">${s}</option>`).join('')}</select></label><div role="group" aria-label="绘画姿势">${['迈腿 A','站立','迈腿 B'].map((s,i)=>`<button data-pose="${i}" aria-pressed="${i===1}">${s}</button>`).join('')}</div></div>
    <div class="paint-tools" role="toolbar" aria-label="绘画工具">${[['pen','画笔'],['erase','橡皮'],['fill','填色'],['pick','取色'],['pan','移动画布']].map(([id,s])=>`<button data-tool="${id}" aria-pressed="${id==='pen'}">${s}</button>`).join('')}<button class="paint-undo">撤销</button><button class="paint-redo">重做</button></div>
    <div class="paint-units"><span>笔格</span>${[1,2,4].map(n=>`<button data-unit="${n}" aria-pressed="${n===1}">${n} 像素</button>`).join('')}<span class="paint-zoom"><button class="paint-minus" aria-label="缩小画布">−</button><output></output><button class="paint-plus" aria-label="放大画布">＋</button><button class="paint-fit">适合窗口</button></span></div>
    <canvas class="paint-canvas" aria-label="像素衣服画布"></canvas>
    <div class="paint-palette" role="group" aria-label="衣服调色板"></div><label class="paint-color-label">更改此颜色（所有姿势）<input class="paint-color" type="color"></label>
    <div class="paint-options"><label><input class="paint-grid" type="checkbox" checked>网格</label><label><input class="paint-mirror" type="checkbox">左右镜像画笔</label><label><input class="paint-onion" type="checkbox">站立叠影</label></div>
    <details class="paint-preview"><summary>检查四方向行走</summary><div class="paint-preview-row"><canvas width="64" height="96"></canvas><button class="paint-play">播放行走</button><span>站立 → 迈腿 A → 站立 → 迈腿 B</span></div></details>
    </div><footer><p class="paint-status" role="status"></p><button class="paint-retry" hidden>重试保存草稿</button><button class="paint-apply primary">应用到这套皮肤</button></footer>`;
  document.body.append(box);const el=s=>box.querySelector(s),canvas=el('.paint-canvas'),ctx=canvas.getContext('2d'),layer=document.createElement('canvas');
  let session,endpoint='',revision=0,index=1,tool='pen',unit=1,color=2,view={x:0,y:0,scale:1},pointers=new Map(),last=null,gesture=null,needsSave=false,saving=null,closing=false,playing=null,playStep=0,resolveClose;
  const status=text=>{el('.paint-status').textContent=text;};
  const error=e=>{report(e);status(e.message);el('.paint-retry').hidden=false;};
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  function lock(value){for(const input of box.querySelectorAll('.paint-scroll button,.paint-scroll input,.paint-scroll select'))input.disabled=value;if(!value)controls();}
  function stop(){clearInterval(playing);playing=null;el('.paint-play').textContent='播放行走';}
  function cancel(){session?.cancel();last=null;gesture=null;pointers.clear();}
  function controls(){
    for(const b of box.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
    for(const b of box.querySelectorAll('[data-unit]'))b.setAttribute('aria-pressed',String(+b.dataset.unit===unit));
    for(const b of box.querySelectorAll('[data-pose]'))b.setAttribute('aria-pressed',String(+b.dataset.pose===index%3));
    el('.paint-undo').disabled=!session.undoStack.length;el('.paint-redo').disabled=!session.redoStack.length;
    el('.paint-zoom output').textContent=view.scale+'×';
    el('.paint-color').value=session.project.colors[color];
    const palette=el('.paint-palette');palette.replaceChildren();
    for(let i=1;i<16;i++){
      const b=document.createElement('button');b.type='button';b.dataset.color=i;b.style.backgroundColor=session.project.colors[i];b.setAttribute('aria-label','颜色 '+i);b.setAttribute('aria-pressed',String(i===color));
      b.onclick=()=>{cancel();color=i;controls();draw();};palette.append(b);
    }
  }
  function fit(){const r=canvas.getBoundingClientRect();view.scale=Math.max(1,Math.floor(Math.min(r.width/T.width,r.height/T.height)));view.x=Math.floor((r.width-T.width*view.scale)/2);view.y=Math.floor((r.height-T.height*view.scale)/2);}
  function draw(){
    if(!box.open||!session)return;
    const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
    if(!r.width||!r.height)return;
    const width=Math.round(r.width*dpr),height=Math.round(r.height*dpr);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#dec7a6';ctx.fillRect(0,0,r.width,r.height);
    const {x,y,scale:s}=view,p=session.preview();
    ctx.save();ctx.beginPath();ctx.rect(x,y,T.width*s,T.height*s);ctx.clip();
    for(let j=0;j<T.height;j+=4)for(let i=0;i<T.width;i+=4){ctx.fillStyle=(i/4+j/4)%2?'#eddec4':'#f7ecd7';ctx.fillRect(x+i*s,y+j*s,4*s,4*s);}
    if(el('.paint-onion').checked&&index%3!==1){renderClothingFrame(layer,p,Math.floor(index/3)*3+1);ctx.globalAlpha=.18;ctx.drawImage(layer,x,y,T.width*s,T.height*s);ctx.globalAlpha=1;}
    renderClothingFrame(layer,p,index);ctx.drawImage(layer,x,y,T.width*s,T.height*s);
    if(el('.paint-grid').checked){ctx.strokeStyle='#65523c44';ctx.lineWidth=1/dpr;ctx.beginPath();for(let i=0;i<=T.width;i+=unit){ctx.moveTo(x+i*s,y);ctx.lineTo(x+i*s,y+T.height*s);}for(let j=0;j<=T.height;j+=unit){ctx.moveTo(x,y+j*s);ctx.lineTo(x+T.width*s,y+j*s);}ctx.stroke();}
    ctx.strokeStyle='#47705c';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x,y+T.footY*s);ctx.lineTo(x+T.width*s,y+T.footY*s);ctx.stroke();ctx.restore();
    el('.paint-zoom output').textContent=s+'×';
    preview();
  }
  function preview(){if(el('.paint-preview').open)renderClothingFrame(el('.paint-preview canvas'),session.project,Math.floor(index/3)*3+(playing?T.order[playStep%4]:index%3));}
  function zoom(scale,anchor){
    cancel();const r=canvas.getBoundingClientRect(),a=anchor||[r.width/2,r.height/2],next=Math.max(1,Math.min(16,Math.round(scale))),ratio=next/view.scale;
    view={scale:next,x:Math.round(a[0]-(a[0]-view.x)*ratio),y:Math.round(a[1]-(a[1]-view.y)*ratio)};draw();
  }
  async function flush(){
    if(saving)return saving;
    saving=(async()=>{
      while(needsSave){
        const project=copy(session.project);status('正在保存草稿…');
        const result=await api(endpoint,'PATCH',{expected_revision:revision,project});revision=result.revision;
        needsSave=JSON.stringify(project)!==JSON.stringify(session.project);
      }
      status('草稿已保存，房间形象尚未改变');el('.paint-retry').hidden=true;
    })();
    try{await saving;}finally{saving=null;}
  }
  function changed(){needsSave=true;controls();draw();flush().catch(error);}
  async function close(){if(closing)return;closing=true;try{cancel();stop();await flush();box.close();}finally{closing=false;}}
  el('.paint-close').onclick=safe(close);box.addEventListener('cancel',e=>{e.preventDefault();safe(close)();});
  box.addEventListener('close',()=>{cancel();stop();resolveClose?.();resolveClose=null;});
  el('.paint-retry').onclick=safe(flush);
  el('.paint-apply').onclick=safe(async()=>{
    if(closing)return;closing=true;el('.paint-apply').disabled=true;lock(true);cancel();stop();
    try{await flush();const result=await api(endpoint,'POST',{expected_revision:revision,project:copy(session.project),sprite:clothingAtlas(session.project)});revision=result.revision;toast('已应用到这套皮肤');box.close();}
    finally{closing=false;el('.paint-apply').disabled=false;lock(false);}
  });
  for(const b of box.querySelectorAll('[data-tool]'))b.onclick=()=>{cancel();tool=b.dataset.tool;controls();draw();};
  for(const b of box.querySelectorAll('[data-unit]'))b.onclick=()=>{cancel();unit=+b.dataset.unit;controls();draw();};
  function pose(next){cancel();stop();index=next;controls();draw();}
  el('.paint-pose select').onchange=e=>pose(+e.target.value*3+index%3);
  for(const b of box.querySelectorAll('[data-pose]'))b.onclick=()=>pose(Math.floor(index/3)*3+(+b.dataset.pose));
  el('.paint-undo').onclick=()=>{cancel();if(session.undo())changed();};el('.paint-redo').onclick=()=>{cancel();if(session.redo())changed();};
  el('.paint-color').onchange=e=>{cancel();if(session.recolor(color,e.target.value))changed();};
  for(const input of box.querySelectorAll('.paint-options input'))input.onchange=()=>{cancel();draw();};
  el('.paint-minus').onclick=()=>zoom(view.scale-1);el('.paint-plus').onclick=()=>zoom(view.scale+1);el('.paint-fit').onclick=()=>{cancel();fit();draw();};
  el('.paint-preview').ontoggle=()=>{if(!el('.paint-preview').open)stop();preview();};
  el('.paint-play').onclick=()=>{if(playing){stop();preview();return;}playStep=0;el('.paint-play').textContent='停止行走';playing=setInterval(()=>{playStep++;preview();},120);preview();};
  const point=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  const pixel=p=>[Math.floor((p[0]-view.x)/view.scale),Math.floor((p[1]-view.y)/view.scale)];
  const inside=p=>p[0]>=0&&p[0]<T.width&&p[1]>=0&&p[1]<T.height;
  function brush(p){paintLine(session.stroke.pixels,last||p,p,{unit,color:tool==='erase'?0:color,mirror:el('.paint-mirror').checked});last=p;}
  function pinch(){const [a,b]=[...pointers.values()];return {center:[(a[0]+b[0])/2,(a[1]+b[1])/2],distance:Math.hypot(a[0]-b[0],a[1]-b[1])};}
  canvas.onpointerdown=e=>{
    if(closing||e.button>0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,point(e));stop();
    if(pointers.size>1){session.cancel();last=null;if(pointers.size===2)gesture={...pinch(),view:{...view}};draw();return;}
    const p=pixel(point(e));if(tool==='pan'){gesture={pan:true,start:point(e),view:{...view}};return;}
    if(!inside(p))return;
    if(tool==='pick'){const n=parseInt(session.project.frames[index][p[1]*T.width+p[0]],16);if(n)color=n;controls();return;}
    session.begin(index);if(tool==='fill')fillPixels(session.stroke.pixels,p[0],p[1],color);else brush(p);draw();
  };
  canvas.onpointermove=e=>{
    if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,point(e));
    if(gesture&&!gesture.pan&&pointers.size===2){const now=pinch(),base=gesture.view,scale=Math.max(1,Math.min(16,Math.round(base.scale*now.distance/Math.max(1,gesture.distance)))),ratio=scale/base.scale;view={scale,x:Math.round(now.center[0]-(gesture.center[0]-base.x)*ratio),y:Math.round(now.center[1]-(gesture.center[1]-base.y)*ratio)};}
    else if(gesture?.pan){const p=point(e);view={...gesture.view,x:Math.round(gesture.view.x+p[0]-gesture.start[0]),y:Math.round(gesture.view.y+p[1]-gesture.start[1])};}
    else if(session.stroke&&tool!=='fill')brush(pixel(point(e)));draw();
  };
  function end(e,cancelled){
    if(!pointers.has(e.pointerId))return;
    if(cancelled){cancel();draw();return;}
    pointers.delete(e.pointerId);
    if(gesture){if(!pointers.size){gesture=null;last=null;}draw();return;}
    if(!pointers.size){last=null;if(session.finish())changed();else draw();}
  }
  canvas.onpointerup=e=>end(e,false);canvas.onpointercancel=e=>end(e,true);canvas.onlostpointercapture=e=>end(e,true);
  window.addEventListener('resize',()=>{if(box.open){cancel();fit();draw();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&box.open){cancel();stop();flush().catch(error);}});
  return {async open(owner,skinId,name){
    if(box.open)return;
    endpoint='/character-looks/'+encodeURIComponent(owner)+'/drawing/'+encodeURIComponent(skinId);
    const state=await api(endpoint);session=new PaintSession(state.draft||state.project||newDrawing());revision=state.revision;
    index=1;tool='pen';unit=1;color=2;needsSave=!state.draft&&!state.project;saving=null;closing=false;cancel();stop();
    el('.paint-owner').textContent=name;el('.paint-pose select').value='0';el('.paint-retry').hidden=true;
    el('.paint-grid').checked=true;el('.paint-mirror').checked=false;el('.paint-onion').checked=false;el('.paint-preview').open=false;
    box.showModal();el('.paint-scroll').scrollTop=0;fit();controls();draw();status(state.draft?'已恢复未应用的草稿':state.project?'可继续编辑已保存的衣服':'画笔整格填色；双指可以放大和移动画布');
    return new Promise(resolve=>{resolveClose=resolve;});
  }};
}
