// SPDX-License-Identifier: AGPL-3.0-only
// UI only: selection uses the existing model-profile dialog and service commands.
export function mountApiFloatingSwitcher({open,toast}) {
  const ball=document.createElement('button');ball.type='button';ball.id='api-floating-switcher';
  ball.className='api-floating-switcher';ball.hidden=true;
  const icon=document.createElement('strong');icon.textContent='API';
  const name=document.createElement('span');ball.append(icon,name);document.body.append(ball);
  const storageKey='t.ui.api-switcher-position';
  let position={x:1,y:.78},drag=null,suppressClick=false;
  try {const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))position=saved;}catch { /* Use the initial position if UI preferences are unavailable. */ }
  function bounds(){
    const rect=document.querySelector('.phone').getBoundingClientRect(),size=ball.offsetWidth||58;
    return {left:Math.max(8,rect.left+8),top:Math.max(8,rect.top+8),right:Math.max(8,Math.min(innerWidth,rect.right)-size-8),bottom:Math.max(8,Math.min(innerHeight,rect.bottom)-size-8)};
  }
  const clamp=(n)=>Math.max(0,Math.min(1,n));
  function place(){
    const b=bounds();position={x:clamp(position.x),y:clamp(position.y)};
    ball.style.left=b.left+position.x*Math.max(0,b.right-b.left)+'px';
    ball.style.top=b.top+position.y*Math.max(0,b.bottom-b.top)+'px';
  }
  ball.onpointerdown=e=>{
    if(e.button!==0)return;
    suppressClick=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:parseFloat(ball.style.left),top:parseFloat(ball.style.top),moved:false};
    ball.setPointerCapture(e.pointerId);
  };
  ball.onpointermove=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<6)return;
    drag.moved=true;const b=bounds();
    position={x:clamp((drag.left+dx-b.left)/Math.max(1,b.right-b.left)),y:clamp((drag.top+dy-b.top)/Math.max(1,b.bottom-b.top))};place();
  };
  const end=e=>{
    if(!drag||drag.id!==e.pointerId)return;
    suppressClick=drag.moved;drag=null;
    if(ball.hasPointerCapture(e.pointerId))ball.releasePointerCapture(e.pointerId);
    try {localStorage.setItem(storageKey,JSON.stringify(position));}catch {toast('位置暂未保存，下次启动会使用默认位置');}
  };
  ball.onpointerup=end;ball.onpointercancel=end;
  ball.onclick=e=>{if(suppressClick&&e.detail!==0){suppressClick=false;return;}open();};
  window.addEventListener('resize',place);
  return {refresh({visible,label}){
    ball.hidden=!visible;name.textContent=label||'未配置';
    ball.title='切换聊天 API：'+(label||'未配置');ball.setAttribute('aria-label',ball.title);if(visible)place();
  }};
}
