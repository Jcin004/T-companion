// SPDX-License-Identifier: AGPL-3.0-only
import {drawWorld} from './world-renderer.js';
import {ROOM,FURNITURE,collision,distance} from './world-map.js';
import {findPath} from './world-pathfinding.js';
import {mountResidentLifeUI} from './resident-life-ui.js';
import {mountWorldJoystick} from './world-joystick.js';
const el=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const requestId=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function installWorldShell(){
  const b=node('button');b.dataset.app='world';b.innerHTML='<span class="app-icon world-icon">⌂</span>世界';document.querySelector('.app-grid').append(b);
  const screen=node('section');screen.id='world';screen.className='screen page';screen.hidden=true;
  screen.innerHTML='<header><button class="icon" data-home aria-label="返回桌面">‹</button><h1>世界 · 暖木小屋</h1></header><div class="world-body"><p id="world-notice" role="status"></p><div id="world-setup"></div><div id="world-play" hidden><div class="world-meta"><span id="world-time"></span><span>拖动摇杆行走 · 点人物交谈</span></div><div class="world-stage"><canvas id="world-canvas" width="288" height="312" aria-label="暖木小屋像素房间，可用左下摇杆或点击地板移动，点击人物交谈"></canvas><div class="world-controls"><div id="world-joystick" role="group" aria-label="移动摇杆，按住并拖向上下左右，松手停止"><span class="world-joystick-arrows" aria-hidden="true">✦</span><span class="world-joystick-thumb" aria-hidden="true"></span></div><span class="world-control-hint">按住移动 · 松手停下</span></div></div><label>移动对象<select id="world-actor"></select></label><div id="world-places" class="actions"></div><div class="actions"><button id="world-advance">推进一次世界</button><button id="world-retry" hidden>重试上次操作</button></div><details><summary>世界经历与知情范围</summary><div id="world-events"></div></details></div></div>';
  document.querySelector('.phone').insertBefore(screen,el('home-button'));
  const d=node('dialog');d.id='world-dialogue';d.className='world-dialogue';d.innerHTML='<header><h2>场景对话</h2><button id="world-close">返回房间</button></header><div class="world-portrait" id="world-portrait"></div><strong id="world-speaker"></strong><small>房间近处交流 · 仅交谈双方听到</small><div id="world-lines" aria-live="polite"></div><details><summary>上下文与记录</summary><label>历史消息条数（空白跟随全局）<input id="world-history-limit" type="number" min="0" max="2000"></label><button id="world-history-save">保存上下文设置</button><button id="world-preview">预览本轮上下文</button><button id="world-older">加载更早对话</button><pre id="world-preview-text"></pre></details><form id="world-composer"><textarea id="world-input" maxlength="20000" rows="2" placeholder="说些什么…" aria-label="场景对话输入"></textarea><div class="actions"><button id="world-send" class="primary">发送</button><button id="world-cancel" type="button">停止回复</button><button id="world-dialogue-retry" type="button" hidden>重试未完成消息</button></div></form><p id="world-dialogue-status" role="status"></p>';document.body.append(d);
}
export async function showWorldSource(api,ref,owner){
  const e=await api('/world/sources/'+encodeURIComponent(ref.event_id)+'?owner='+encodeURIComponent(owner));
  let d=el('world-source-dialog');if(!d){d=node('dialog');d.id='world-source-dialog';document.body.append(d);}
  d.replaceChildren();const close=node('button','关闭');close.onclick=()=>d.close();d.append(node('h2','世界事件来源'),close,node('p',e.id+' · '+e.created_at+' · '+e.location),node('pre',e.content),node('p','来源：'+e.source.type),node('p','知情依据：'+e.observations.filter(o=>o.owner_id===owner).map(o=>o.kind==='witness'?'在场观察':'听到对话').join('、')));
  if(!d.open)d.showModal();
}
export function mountWorldUI({api,localReady,isLocal,toast,report}){
  let world,session,person,busy=false,pending=null,failedTurn=null,animation=0,older=0;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);toast(e.message);el('world-dialogue-status').textContent=e.message;}};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=safe(fn);return b;};
  const lifeUI=mountResidentLifeUI({api,toast,report,refreshWorld:refresh});
  const joystick=mountWorldJoystick({
    element:el('world-joystick'),
    canStart:()=>!busy&&!pending&&!el('world').hidden&&!document.querySelector('dialog[open]')&&!!world?.state.positions.user,
    step:async direction=>{
      if(busy||el('world').hidden)return;
      const actor=el('world-actor').value,p=world.state.positions[actor];
      const target={x:p.x+direction.x,y:p.y+direction.y};
      if(target.x<0||target.x>=ROOM.width||target.y<0||target.y>=ROOM.height||collision(world.state.positions,actor)[target.y*ROOM.width+target.x])return;
      await command({request_id:requestId(),type:'move',actor_id:actor,target},true);
    },
    onRest:()=>{if(world&&!el('world').hidden)renderEvents();},
    onError:e=>{report(e);toast(e.message);}
  });
  async function refresh({light=false}={}){
    cancelAnimationFrame(animation);
    if(!isLocal()){el('world-notice').textContent='世界使用本机数据，请在设置切换到本机模式。';el('world-play').hidden=true;el('world-setup').replaceChildren();return;}
    world=await api('/world');el('world-notice').textContent='每次操作都会保存；居民生活和后台推进可在下方设置。';
    if(!light)await lifeUI.refresh();
    const ready=world.state.residents.length===2;el('world-play').hidden=!ready;el('world-setup').replaceChildren();
    el('world-time').textContent='第 '+world.state.tick+' 步 · '+(world.state.lamp?'灯亮':'灯灭');drawWorld(el('world-canvas'),world);
    if(light)return;
    if(!ready){
      const chars=await api('/characters');el('world-setup').append(node('p','从人设名册选择两位居民。世界只保存人物标识，资料继续由名册管理。'));
      if(chars.length<2){el('world-setup').append(node('p','请先到名册创建至少两位人物。'));return;}
      const selects=[0,1].map(i=>{const label=node('label','居民 '+(i+1)),select=node('select');select.id='world-resident-'+i;for(const c of chars){const o=node('option',c.name);o.value=c.id;select.append(o);}select.selectedIndex=i;label.append(select);el('world-setup').append(label);return select;});
      el('world-setup').append(button('进入小屋',async()=>{await api('/world/setup','POST',{character_ids:selects.map(s=>s.value)});await refresh();}));return;
    }
    const actor=el('world-actor'),selected=actor.value;actor.replaceChildren();for(const [id,name] of [['user','我'],...world.residents.map(r=>[r.id,r.name])]){const o=node('option',name);o.value=id;actor.append(o);}if(world.state.positions[selected])actor.value=selected;
    el('world-places').replaceChildren(...FURNITURE.map(f=>button(f.name,()=>interact(f))));
    renderEvents();
  }
  function renderEvents(){
    const list=el('world-events');list.replaceChildren();
    for(const e of world.state.events.slice(-30).reverse()){
      const card=node('article');card.className='world-event';card.append(node('p',e.content.slice(0,500)),node('small',e.created_at+' · 知情者：'+(e.observations.map(o=>world.residents.find(r=>r.id===o.owner_id)?.name||o.owner_id).join('、')||'无居民')));
      for(const o of e.observations){const name=world.residents.find(r=>r.id===o.owner_id)?.name||o.owner_id;card.append(button('保存为'+name+'的经历',async()=>{
        const rows=await api('/memories?owner='+encodeURIComponent(o.owner_id));
        if(rows.some(m=>m.evidence.some(ref=>ref.source_type==='world_event'&&ref.event_id===e.id))){toast('此事件已保存为该人物的记忆');return;}
        await api('/memories','POST',{owner_id:o.owner_id,title:e.content.slice(0,35),content:e.content.slice(0,3900),kind:e.source.type==='completed_dialogue'?'statement':'experience',evidence:[{source_type:'world_event',event_id:e.id,quote:e.content.slice(0,3900)}],participants:e.participants.filter(id=>id!=='user')});toast('已保存；可在记忆中编辑、召回并查看事件来源');
      }),button(name+'的事件来源',()=>showWorldSource(api,{event_id:e.id},o.owner_id)));}
      list.append(card);
    }
  }
  async function command(value,light=false){
    if(busy)throw Error('请等待当前操作完成');busy=true;pending=value;el('world-retry').hidden=true;
    const previous=world;
    try{
      const event=await api('/world/commands','POST',value);pending=null;await refresh({light});
      if(value.type==='move'){
        const actor=value.actor_id||'user',start=previous.state.positions[actor],path=findPath(collision(previous.state.positions,actor),12,13,start.x,start.y,value.target.x,value.target.y).path,started=performance.now(),duration=Math.min(900,path.length*90);
        const frame=now=>{if(el('world').hidden)return;const fraction=Math.min(1,(now-started)/duration),step=fraction*(path.length-1),i=Math.floor(step),a=path[i],b=path[Math.min(i+1,path.length-1)],positions={...world.state.positions,[actor]:{x:a.x+(b.x-a.x)*(step-i),y:a.y+(b.y-a.y)*(step-i)}};drawWorld(el('world-canvas'),world,positions);if(fraction<1)animation=requestAnimationFrame(frame);};animation=requestAnimationFrame(frame);
      }
      return event;
    }catch(e){el('world-retry').hidden=false;throw e;}finally{busy=false;}
  }
  async function interact(f){
    joystick.stop();
    const actor=el('world-actor').value,p=world.state.positions[actor];
    const spots=[];for(let y=3;y<12;y++)for(let x=1;x<11;x++){const d=Math.min(...Array.from({length:f.w*f.h},(_,i)=>distance({x,y},{x:f.x+i%f.w,y:f.y+Math.floor(i/f.w)})));if(d<=2&&!collision(world.state.positions,actor)[y*12+x]){const path=findPath(collision(world.state.positions,actor),12,13,p.x,p.y,x,y);if(path.reachable)spots.push({x,y,length:path.path.length});}}
    spots.sort((a,b)=>a.length-b.length);if(!spots.length)throw Error('这个地点暂时无法到达');
    if(spots[0].length>1)await command({request_id:requestId(),type:'move',actor_id:actor,target:{x:spots[0].x,y:spots[0].y}});
    await command({request_id:requestId(),type:'interact',actor_id:actor,target_id:f.id});
  }
  async function lines(before){
    const page=await api('/contacts/'+session.id+'/messages'+(before?'?before='+before:''));
    const list=el('world-lines');if(!before)list.replaceChildren();
    const nodes=page.items.map(m=>{const p=node('p',(m.role==='user'?'我':person.name)+'：'+m.content+(m.state==='complete'?'':' ['+m.state+']'));p.className=m.role;p.dataset.id=m.id;return p;});
    if(before)list.prepend(...nodes);else list.append(...nodes);
    older=Number(list.firstChild?.dataset.id)||0;el('world-older').hidden=!page.has_before;
    if(!before)list.scrollTop=list.scrollHeight;
    const failed=page.items.filter(m=>m.role==='user'&&['failed','cancelled','interrupted'].includes(m.state)).pop();
    failedTurn=failed?{text:failed.content,id:failed.request_id}:null;el('world-dialogue-retry').hidden=!failedTurn;
  }
  async function talk(id){
    joystick.stop();
    if(busy)throw Error('请等待操作完成');
    const target=world.state.positions[id],p=world.state.positions.user;
    if(distance(p,target)>3){
      const cells=collision(world.state.positions,'user'),spots=[];for(let y=3;y<12;y++)for(let x=1;x<11;x++)if(!cells[y*12+x]&&distance({x,y},target)<=2){const result=findPath(cells,12,13,p.x,p.y,x,y);if(result.reachable)spots.push({x,y,length:result.path.length});}
      spots.sort((a,b)=>a.length-b.length);if(!spots.length)throw Error('暂时无法走近人物');await command({request_id:requestId(),type:'move',target:{x:spots[0].x,y:spots[0].y}});
    }
    session=await api('/world/dialogue','POST',{character_id:id});person=world.residents.find(r=>r.id===id);
    el('world-speaker').textContent=person.name;el('world-portrait').replaceChildren();if(person.avatar){const img=node('img');img.src=person.avatar;img.alt=person.name;el('world-portrait').append(img);}else el('world-portrait').textContent=person.name.slice(0,1);
    el('world-history-limit').value=session.history_limit??'';el('world-preview-text').textContent='';el('world-dialogue-status').textContent='';el('world-input').value=(await api('/contacts/'+session.id+'/draft')).text;await lines();el('world-dialogue').showModal();
  }
  async function send(text,id=requestId()){
    if(busy||!text.trim())return;busy=true;el('world-send').disabled=true;failedTurn={text,id};el('world-dialogue-status').textContent='正在回复…';
    const list=el('world-lines'),u=node('p','我：'+text),reply=node('p',person.name+'：');list.append(u,reply);
    try{
      await (await localReady).stream(session.id,text,id,(type,event)=>{if(type==='delta'){reply.textContent+=event.text;list.scrollTop=list.scrollHeight;}});
      failedTurn=null;el('world-input').value='';await api('/contacts/'+session.id+'/draft','PATCH',{text:''});el('world-dialogue-status').textContent='已保存对话与世界事件';
    }catch(e){el('world-dialogue-status').textContent=e.message;report(e);}finally{busy=false;el('world-send').disabled=false;await lines();await refresh();el('world-dialogue-retry').hidden=!failedTurn;}
  }
  el('world-canvas').onclick=safe(async e=>{joystick.stop();const r=e.currentTarget.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*12),y=Math.floor((e.clientY-r.top)/r.height*13),id=world.state.residents.find(id=>world.state.positions[id].x===x&&Math.abs(world.state.positions[id].y-y)<=1);if(id)return talk(id);const f=FURNITURE.find(f=>x>=f.x&&x<f.x+f.w&&y>=f.y&&y<f.y+f.h);if(f)return interact(f);await command({request_id:requestId(),type:'move',actor_id:el('world-actor').value,target:{x,y}});});
  el('world-actor').onchange=()=>joystick.stop();
  el('world-advance').onclick=safe(()=>{joystick.stop();return command({request_id:requestId(),type:'advance',actor_id:el('world-actor').value});});
  el('world-retry').onclick=safe(()=>pending&&command(pending));
  el('world-close').onclick=()=>el('world-dialogue').close();el('world-dialogue').addEventListener('close',()=>{localReady.then(s=>s.cancel());});
  el('world-composer').onsubmit=safe(async e=>{e.preventDefault();await send(el('world-input').value);});
  el('world-input').oninput=safe(()=>api('/contacts/'+session.id+'/draft','PATCH',{text:el('world-input').value}));
  el('world-cancel').onclick=safe(async()=>{(await localReady).cancel();});
  el('world-dialogue-retry').onclick=safe(()=>failedTurn&&send(failedTurn.text,failedTurn.id));
  el('world-older').onclick=safe(()=>lines(older));
  el('world-history-save').onclick=safe(async()=>{const raw=el('world-history-limit').value;session=await api('/contacts/'+session.id,'PATCH',{history_limit:raw===''?null:Number(raw)});toast('场景上下文设置已保存');});
  el('world-preview').onclick=safe(async()=>{const value=await api('/contacts/'+session.id+'/context-preview','POST',{message:el('world-input').value});el('world-preview-text').textContent=JSON.stringify(value.messages,null,2);});
  return {refresh,leave(){joystick.stop();cancelAnimationFrame(animation);}};
}
