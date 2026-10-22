// SPDX-License-Identifier: AGPL-3.0-only
// Pointer input only. World validation and persistence stay behind the command API.
export function joystickDirection(x,y,radius){
  if(Math.hypot(x,y)<radius*.22)return null;
  return Math.abs(x)>Math.abs(y)?{x:Math.sign(x),y:0}:{x:0,y:Math.sign(y)};
}

// One saved step at a time; release drops the next step, never a committed one.
export function createJoystickMotion({step,onError,onRest=()=>{},interval=180,schedule=setTimeout,clear=clearTimeout}){
  let active=false,direction=null,inFlight=false,timer=null,needsRest=false;
  function rest(){if(needsRest&&!inFlight&&!active){needsRest=false;onRest();}}
  function stop(){active=false;direction=null;if(timer!==null)clear(timer);timer=null;rest();}
  async function pump(){
    timer=null;
    if(!active||!direction||inFlight)return;
    inFlight=true;const started=Date.now();
    try{await step({...direction});}
    catch(e){stop();onError(e);}
    finally{
      inFlight=false;
      if(active&&direction)timer=schedule(pump,Math.max(0,interval-(Date.now()-started)));
      rest();
    }
  }
  return {
    point(value){active=true;direction=value;needsRest=true;if(timer===null&&!inFlight&&direction)void pump();},
    stop
  };
}

export function mountWorldJoystick({element,step,canStart,onError,onRest}){
  const thumb=element.querySelector('.world-joystick-thumb');
  let pointer=null;
  const motion=createJoystickMotion({step,onRest,onError:e=>{release();onError(e);}});
  function release(){
    const id=pointer;pointer=null;motion.stop();
    thumb.style.transform='translate(0px,0px)';element.classList.remove('held');
    if(id!==null&&element.hasPointerCapture(id))element.releasePointerCapture(id);
  }
  function point(e){
    const r=element.getBoundingClientRect(),radius=r.width*.34;
    let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
    const length=Math.hypot(x,y),scale=length>radius?radius/length:1;
    x*=scale;y*=scale;thumb.style.transform='translate('+x+'px,'+y+'px)';
    motion.point(joystickDirection(x,y,radius));
  }
  element.addEventListener('pointerdown',e=>{
    if(pointer!==null||!e.isPrimary||e.button!==0||!canStart())return;
    e.preventDefault();pointer=e.pointerId;element.setPointerCapture(pointer);element.classList.add('held');point(e);
  });
  element.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();point(e);}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,e=>{if(e.pointerId===pointer)release();});
  element.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('blur',release);
  window.addEventListener('pagehide',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  return {stop:release};
}
