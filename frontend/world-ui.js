// SPDX-License-Identifier: AGPL-3.0-only
import {drawWorld} from './world-renderer.js';
import {loadWorldArt,actorPoint,floorPoint,visualPlaces,portraitImage} from './world-art.js';
import {ROOM,FURNITURE,collision,distance} from './world-map.js';
import {findPath} from './world-pathfinding.js';
import {sceneActionSteps} from './world-scene-actions.js';
import {mountResidentLifeUI} from './resident-life-ui.js';
import {mountWorldJoystick} from './world-joystick.js';
import {installSceneDialogue,mountSceneDialogue} from './world-dialogue-ui.js';
import {mountCharacterLooksUI} from './character-looks-ui.js';
import {mountWorldHistory} from './world-history-ui.js';
const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const uid=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
function panel(id,title,html){const d=node('dialog');d.id=id;d.className='world-panel';d.innerHTML='<header><h2>'+title+'</h2><button aria-label="关闭">×</button></header>'+html;d.querySelector('header button').onclick=()=>d.close();document.body.append(d);return d;}
export function installWorldShell(){
  const b=node('button');b.dataset.app='world';b.innerHTML='<span class="app-icon world-icon">⌂</span>世界';document.querySelector('.app-grid').append(b);
  const screen=node('section');screen.id='world';screen.className='screen page';screen.hidden=true;
  screen.innerHTML='<div class="world-body"><p id="world-notice" role="status"></p><div id="world-setup"></div><div id="world-play" hidden><div class="world-stage"><canvas id="world-canvas" width="576" height="960" aria-label="暖木小屋，左下摇杆移动，靠近物品交互，点击人物交谈"></canvas><div class="world-hud"><div class="world-room-label">暖木小屋<small id="world-time"></small></div><button id="world-menu-open" aria-label="打开用户菜单"><img id="world-user-avatar" alt="用户头像"></button></div><div class="world-controls"><div id="world-joystick" role="group" aria-label="移动摇杆，按住并拖向上下左右，松手停止"><span class="world-joystick-arrows" aria-hidden="true">✦</span><span class="world-joystick-thumb" aria-hidden="true"></span></div></div><div id="world-places" class="world-context-actions"></div><button id="world-retry" hidden>重试上次操作</button><p id="world-action-status" role="status"></p></div></div></div>';
  document.querySelector('.phone').insertBefore(screen,el('home-button'));
  panel('world-menu','我的世界','<div class="world-menu-grid"></div>');
  panel('world-events-panel','世界经历与知情范围','<div id="world-events"></div>');
  panel('world-life-panel','居民生活','<div id="world-life-container"></div>');
  panel('world-settings-panel','世界设置','<label>移动对象<select id="world-actor"></select></label><button id="world-advance">推进一次世界</button><p>移动与交互自动保存；点击物品可走近，靠近后按操作按钮。人物形象与居民生活从用户菜单进入。</p>');
  installSceneDialogue();
}
export async function showWorldSource(api,ref,owner){
  const e=await api('/world/sources/'+encodeURIComponent(ref.event_id)+'?owner='+encodeURIComponent(owner));
  let d=el('world-source-dialog');if(!d)d=panel('world-source-dialog','世界事件来源','');
  const close=node('button','关闭');close.onclick=()=>d.close();d.replaceChildren(node('h2','世界事件来源'),close,node('p',e.id+' · '+e.created_at+' · '+e.location),node('pre',e.content),node('p','来源：'+e.source.type),node('p','知情依据：'+e.observations.filter(o=>o.owner_id===owner).map(o=>o.kind==='witness'?'在场观察':'听到对话').join('、')));if(!d.open)d.showModal();
}
export function mountWorldUI({api,localReady,isLocal,toast,report,navigate,speak,stopSpeech,pickArchive}){
  let world,busy=false,pending=null,animation=0,resolveAnimation=null;const walkDistances=new Map();
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);toast(e.message);el('world-action-status').textContent=e.message;}};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=safe(fn);return b;};
  const lifeUI=mountResidentLifeUI({api,toast,report,refreshWorld:refresh});el('world-life-container').append(el('resident-life'));el('resident-life').open=true;
  const looks=mountCharacterLooksUI({api,getWorld:()=>world,refresh,toast,report,pickArchive});
  const history=mountWorldHistory({api,speak,stopSpeech,toast,report,afterDelete:async()=>{await refresh({light:true});await dialogue.reload();}});
  const dialogue=mountSceneDialogue({api,localReady,getWorld:()=>world,refresh,animate:animateEvents,speak,stopSpeech,toast,report,history,editLook:id=>looks.open(id)});
  const joystick=mountWorldJoystick({element:el('world-joystick'),canStart:()=>!busy&&!dialogue.isBusy()&&!pending&&!el('world').hidden&&!document.querySelector('dialog[open]')&&!!world?.state.residents.length,
    step:async d=>{if(busy||el('world').hidden)return;const actor=el('world-actor').value,p=world.state.positions[actor],target={x:p.x+d.x,y:p.y+d.y};if(target.x<1||target.x>10||target.y<3||target.y>11||collision(world.state.positions,actor)[target.y*12+target.x])return;await command({request_id:uid(),type:'move',actor_id:actor,target},{preview:true});},
    onRest:()=>{walkDistances.clear();if(world&&!el('world').hidden){drawWorld(el('world-canvas'),world);renderEvents();}},onError:e=>{report(e);toast(e.message);}});
  const menu=el('world-menu').querySelector('.world-menu-grid');
  for(const [label,icon,fn] of [
    ['人物','♙',()=>looks.open()],['居民生活','☀',async()=>{await lifeUI.refresh();el('world-life-panel').showModal();}],['世界记录','▤',()=>{renderEvents();el('world-events-panel').showModal();}],
    ['对话记录','▤',()=>history.open()],['消息','✉',()=>navigate('chat')],['记忆','▣',()=>navigate('memory')],['外观','✿',()=>navigate('appearance')],['模型连接','⌘',()=>{navigate('settings');}],['设置','⚙',()=>el('world-settings-panel').showModal()],['返回桌面','⌂',()=>navigate('home')]
  ]){const b=button('',async()=>{el('world-menu').close();await fn();}),i=node('span',icon);i.setAttribute('aria-hidden','true');i.className='world-menu-icon';i.textContent='';const n=({'人物':0,'居民生活':1,'世界记录':2,'对话记录':2,'消息':3,'记忆':4,'外观':5,'模型连接':6,'设置':7,'返回桌面':8})[label];i.style.backgroundPosition=(n%3*50)+'% '+(Math.floor(n/3)*50)+'%';b.append(i,node('span',label));menu.append(b);}
  el('world-menu-open').onclick=safe(async()=>{joystick.stop();dialogue.close();el('world-menu').showModal();});
  function stopAnimation(){cancelAnimationFrame(animation);resolveAnimation?.();resolveAnimation=null;}
  async function refresh({light=false,paint=true,keepAnimation=false,snapshot=null}={}){
    if(!keepAnimation)stopAnimation();
    if(!isLocal()){el('world-notice').textContent='世界使用本机数据，请在设置切换到本机模式。';el('world-notice').hidden=false;el('world-play').hidden=true;return;}
    world=snapshot||await api('/world');await loadWorldArt(world);document.body.classList.toggle('world-active',!el('world').hidden);
    const ready=world.state.residents.length===2;el('world-play').hidden=!ready;el('world-notice').hidden=ready;el('world-setup').replaceChildren();
    if(!ready){
      el('world-notice').textContent='从名册选择两位居民，进入暖木小屋。';const people=await api('/characters');
      if(people.length<2){el('world-setup').append(button('打开人设名册',()=>navigate('roster')));return;}
      const selects=[0,1].map(i=>{const s=node('select');s.id='world-resident-'+i;people.forEach(p=>s.append(new Option(p.name,p.id)));s.selectedIndex=i;const label=node('label','居民 '+(i+1));label.append(s);el('world-setup').append(label);return s;});
      el('world-setup').append(button('进入小屋',async()=>{await api('/world/setup','POST',{character_ids:selects.map(s=>s.value)});await refresh();}));return;
    }
    if(!light){const actor=el('world-actor'),chosen=actor.value;actor.replaceChildren(...[['user','我'],...world.residents.map(r=>[r.id,r.name])].map(([id,name])=>new Option(name,id)));if(world.state.positions[chosen])actor.value=chosen;await lifeUI.refresh();}
    el('world-time').textContent=(world.state.lamp?'暖灯亮着':'灯已熄灭')+' · '+world.state.residents.length+' 位居民';
    el('world-user-avatar').src=await portraitImage(world.looks.user);
    if(paint)drawWorld(el('world-canvas'),world);renderPlaces();if(!light)renderEvents();
  }
  function renderPlaces(){
    const actor=el('world-actor').value||'user',p=world.state.positions[actor],list=el('world-places');list.replaceChildren();
    const actionNames={books:'翻阅书架',desk:'读书',lamp:world.state.lamp?'关灯':'开灯',bed:'整理床铺',plant:'浇水',window:world.state.curtain?'拉开窗帘':'合上窗帘'};
    for(const f of FURNITURE){const d=Math.min(...Array.from({length:f.w*f.h},(_,i)=>distance(p,{x:f.x+i%f.w,y:f.y+Math.floor(i/f.w)})));if(d<=2){const b=button(actionNames[f.id],()=>command({request_id:uid(),type:'interact',actor_id:actor,target_id:f.id}));b.dataset.place=f.id;b.disabled=busy;list.append(b);}}
  }
  function renderEvents(){
    const list=el('world-events');list.replaceChildren();
    for(const e of world.state.events.filter(e=>!e.deleted_at).slice(-50).reverse()){
      const card=node('article');card.className='world-event';card.append(node('p',e.content.slice(0,1000)),node('small',new Date(e.created_at).toLocaleString()+' · 知情者：'+(e.observations.map(o=>world.residents.find(r=>r.id===o.owner_id)?.name||o.owner_id).join('、')||'无居民')));
      for(const o of e.observations){const name=world.residents.find(r=>r.id===o.owner_id)?.name||o.owner_id;
        card.append(button('保存为'+name+'的经历',async()=>{const rows=await api('/memories?owner='+encodeURIComponent(o.owner_id));if(rows.some(m=>m.evidence.some(ref=>ref.source_type==='world_event'&&ref.event_id===e.id))){toast('此事件已保存为该人物的记忆');return;}await api('/memories','POST',{owner_id:o.owner_id,title:e.content.slice(0,35),content:e.content.slice(0,3900),kind:e.source.type==='completed_dialogue'?'statement':'experience',evidence:[{source_type:'world_event',event_id:e.id,quote:e.content.slice(0,3900)}],participants:e.participants.filter(id=>id!=='user')});toast('已保存；可在记忆中查看事件来源');}),button(name+'的事件来源',()=>showWorldSource(api,{event_id:e.id},o.owner_id)));
      }
      list.append(card);
    }
  }
  function animatePath(actor,path,positions){
    stopAnimation();const start=performance.now(),duration=(path.length-1)*200,travelled=walkDistances.get(actor)||0;
    return new Promise((resolve,reject)=>{
      resolveAnimation=resolve;
      const frame=now=>{try{
        if(el('world').hidden){resolveAnimation=null;resolve();return;}
        const fraction=Math.max(0,Math.min(1,(now-start)/duration)),step=fraction*(path.length-1),i=Math.floor(step),a=path[i],b=path[Math.min(i+1,path.length-1)];
        const direction=b.x>a.x?'right':b.x<a.x?'left':b.y>a.y?'down':b.y<a.y?'up':world.state.facing[actor];
        drawWorld(el('world-canvas'),world,{...positions,[actor]:{x:a.x+(b.x-a.x)*(step-i),y:a.y+(b.y-a.y)*(step-i)}},{[actor]:{walking:fraction<1||joystick.isMoving(),direction,distance:travelled+step}});
        if(fraction<1)animation=requestAnimationFrame(frame);else{walkDistances.set(actor,travelled+path.length-1);resolveAnimation=null;resolve();}
      }catch(e){resolveAnimation=null;reject(e);}};animation=requestAnimationFrame(frame);
    });
  }
  async function animateEvents(previous,current){
    const known=new Set(previous.state.events.map(e=>e.id)),positions=JSON.parse(JSON.stringify(previous.state.positions));
    for(const e of current.state.events.filter(e=>!known.has(e.id))){
      const c=e.source.command,actor=c?.actor_id||'user';if(!c||!positions[actor])continue;
      if(c.type==='move'){
        const p=positions[actor],path=findPath(collision(positions,actor),12,13,p.x,p.y,c.target.x,c.target.y).path;
        if(path.length>1)await animatePath(actor,path,positions);positions[actor]=c.target;
      }else if(c.type==='interact'||c.type==='gesture'){
        const started=performance.now(),duration=c.type==='gesture'?800:420;await new Promise(resolve=>{resolveAnimation=resolve;const frame=now=>{if(el('world').hidden||now-started>duration){resolveAnimation=null;drawWorld(el('world-canvas'),world);resolve();return;}drawWorld(el('world-canvas'),world,world.state.positions,{[actor]:{using:c.type==='interact',action:c.target_id,gesture:c.gesture_id,progress:Math.max(0,(now-started)/duration)}});animation=requestAnimationFrame(frame);};animation=requestAnimationFrame(frame);});
      }
      if(el('world').hidden)break;
    }
  }
  async function command(value,{preview=false}={}){
    if(busy||dialogue.isBusy())throw Error('请等待当前操作完成');busy=true;pending=value;el('world-retry').hidden=true;const previous=world;
    try{
      // A validated adjacent tile may be previewed while its single transaction
      // saves. No next command is accepted until both save and animation finish.
      // Slow saves stop at this endpoint; failed saves restore saved positions.
      const positions=previous.state.positions,actor=value.actor_id||'user';
      const movement=preview?animatePath(actor,[positions[actor],value.target],positions):null;
      const saved=(async()=>{const result=await api('/world/commands?view=world','POST',value);await refresh({light:true,paint:false,keepAnimation:preview,snapshot:result.world});})();
      await Promise.all([saved,movement]);pending=null;
      if(!preview)await animateEvents(previous,world);
      el('world-action-status').textContent=value.type==='interact'?world.state.events[world.state.events.length-1].content:'';
    }
    catch(e){stopAnimation();drawWorld(el('world-canvas'),world);el('world-retry').hidden=false;throw e;}finally{busy=false;renderPlaces();}
  }
  async function approach(f){
    const actor=el('world-actor').value,{target}=sceneActionSteps({world:world.state},actor,{target_id:f.id});
    if(target.route.length>1)await command({request_id:uid(),type:'move',actor_id:actor,target:{x:target.x,y:target.y}});
    renderPlaces();el('world-action-status').textContent='已走近'+f.name+'，点击操作按钮。';
  }
  async function talk(id){
    joystick.stop();if(busy||dialogue.isBusy())throw Error('请等待操作完成');
    const p=world.state.positions.user,target=world.state.positions[id];
    if(distance(p,target)>3){const cells=collision(world.state.positions),spots=[];for(let y=3;y<12;y++)for(let x=1;x<11;x++)if(!cells[y*12+x]&&distance({x,y},target)<=2){const route=findPath(cells,12,13,p.x,p.y,x,y);if(route.reachable)spots.push({x,y,n:route.path.length});}spots.sort((a,b)=>a.n-b.n);if(!spots.length)throw Error('目前无法走近人物');await command({request_id:uid(),type:'move',target:{x:spots[0].x,y:spots[0].y}});}
    await dialogue.open(id);
  }
  el('world-canvas').onclick=safe(async e=>{
    joystick.stop();if(el('world-dialogue').open)return;const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
    const id=world.state.residents.find(id=>{const p=actorPoint(world.state.positions[id],1,1);return Math.abs(p.x-x)<.06&&y>p.y-.16&&y<p.y+.02;});if(id)return talk(id);
    const f=FURNITURE.find(f=>{const v=visualPlaces[f.id];return x>=v.x&&x<v.x+v.w&&y>=v.y&&y<v.y+v.h;});if(f)return approach(f);
    await command({request_id:uid(),type:'move',actor_id:el('world-actor').value,target:floorPoint(x,y)});
  });
  el('world-actor').onchange=()=>{joystick.stop();renderPlaces();};
  el('world-advance').onclick=safe(()=>command({request_id:uid(),type:'advance',actor_id:el('world-actor').value}));
  el('world-retry').onclick=safe(()=>pending&&command(pending));
  return {refresh,editLooks:id=>looks.open(id),leave(){joystick.stop();stopAnimation();dialogue.close();document.body.classList.remove('world-active');}};
}
