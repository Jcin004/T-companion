// SPDX-License-Identifier: AGPL-3.0-only
import {portraitImage} from './world-art.js';
import {sceneText} from './world-scene-actions.js';
import {replyParts} from './chat-style.js';
const el=id=>document.getElementById(id),uid=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function installSceneDialogue(){
  const d=document.createElement('dialog');d.id='world-dialogue';d.className='world-dialogue';
  d.innerHTML='<button id="world-close" aria-label="返回房间">×</button><div class="world-dialogue-main"><button id="world-portrait" aria-label="切换对话立绘"></button><div class="world-dialogue-copy"><strong id="world-speaker"></strong><div id="world-current-line" aria-live="polite"></div></div></div><div class="world-playback"><button id="world-records" aria-label="查看场景聊天记录">记录</button><button id="world-prev">◀ 上一句</button><button id="world-replay">▷ 重播本轮</button><button id="world-next">下一句 ▶</button><small id="world-page"></small></div><form id="world-composer"><textarea id="world-input" maxlength="20000" rows="1" placeholder="说些什么…" aria-label="场景对话输入"></textarea><button id="world-send" class="primary">发送</button><button id="world-cancel" type="button" hidden>停止</button><button id="world-dialogue-retry" type="button" hidden>重试</button></form><p id="world-dialogue-status" role="status"></p>';
  document.body.append(d);
  const history=document.createElement('dialog');history.id='world-history-dialog';history.className='world-panel';
  history.innerHTML='<header><h2>场景聊天记录</h2><button id="world-history-close" aria-label="关闭聊天记录">×</button></header><div id="world-lines"></div><button id="world-older">加载更早对话</button><details><summary>上下文与记录</summary><label>历史消息条数（空白跟随全局）<input id="world-history-limit" type="number" min="0" max="2000"></label><button id="world-history-save">保存上下文设置</button><button id="world-preview">预览本轮上下文</button><pre id="world-preview-text"></pre></details>';document.body.append(history);
}
export function mountSceneDialogue({api,localReady,getWorld,refresh,animate,speak,stopSpeech,toast,report,editLook}){
  let session,person,busy=false,failedTurn=null,older=0,pages=[],index=0,messages=[],chosen=null,streamText='';
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);toast(e.message);el('world-dialogue-status').textContent=e.message;}};
  function paragraphPages(message){return replyParts(sceneText(message.content),message.chat_style).filter(p=>p.type==='text'||p.type==='voice'||p.type==='action').flatMap(p=>p.text.split(/\n\s*\n/)).filter(p=>p.trim());}
  function show(message){
    stopSpeech();chosen=message;pages=paragraphPages(message);if(!pages.length)pages=['（这条消息没有可显示的文字）'];index=0;render();
  }
  function render(){
    el('world-current-line').textContent=pages[index]||'走近的人正在等你说话。';
    el('world-page').textContent=pages.length?(index+1)+' / '+pages.length:'';
    el('world-prev').disabled=busy||index===0;el('world-next').disabled=busy||index>=pages.length-1;
    el('world-replay').disabled=busy||!chosen||chosen.state!=='complete';
  }
  async function portrait(){
    const w=getWorld(),img=document.createElement('img');img.src=await portraitImage(w.looks[person.id],person.avatar);img.alt=person.name;el('world-portrait').replaceChildren(img);el('world-speaker').textContent=person.name;
  }
  async function lines(before){
    const page=await api('/contacts/'+session.id+'/messages'+(before?'?before='+before:''));
    messages=before?[...page.items,...messages]:page.items;
    older=messages[0]?.id||0;el('world-older').hidden=!page.has_before;
    const list=el('world-lines');list.replaceChildren();
    for(const m of messages){
      const card=document.createElement('article');card.className='world-history-message';
      const p=document.createElement('p');p.textContent=(m.role==='user'?'我':person.name)+'：'+sceneText(m.content)+(m.state==='complete'?'':' ['+m.state+']');card.append(p);
      if(m.role==='assistant'&&m.state==='complete'){
        const b=document.createElement('button');b.textContent='回看这几句';b.onclick=()=>{show(m);el('world-history-dialog').close();};card.append(b);
      }
      list.append(card);
    }
    const failed=messages.filter(m=>m.role==='user'&&['failed','cancelled','interrupted'].includes(m.state)).pop();
    failedTurn=failed?{text:failed.content,id:failed.request_id}:null;el('world-dialogue-retry').hidden=!failedTurn;
    if(!before){const last=messages.filter(m=>m.role==='assistant').pop();if(last)show(last);else{pages=[];chosen=null;render();}}
  }
  async function open(id){
    session=await api('/world/dialogue','POST',{character_id:id});person=getWorld().residents.find(r=>r.id===id);
    el('world-history-limit').value=session.history_limit??'';el('world-preview-text').textContent='';el('world-dialogue-status').textContent='';
    el('world-input').value=(await api('/contacts/'+session.id+'/draft')).text;
    await portrait();await lines();el('world-dialogue').show();document.body.classList.add('world-talking');
  }
  async function send(text,id=uid()){
    if(busy||!text.trim())return;
    busy=true;failedTurn={text,id};streamText='';chosen=null;pages=[];el('world-send').disabled=true;el('world-cancel').hidden=false;render();
    el('world-dialogue-status').textContent='正在回复…';const before=getWorld();
    try{
      await (await localReady).stream(session.id,text,id,(type,e)=>{if(type==='delta'){streamText+=e.text;el('world-current-line').textContent=sceneText(streamText).replace(/\[世界行动:[\s\S]*$/,'');}});
      el('world-input').value='';await api('/contacts/'+session.id+'/draft','PATCH',{text:''});failedTurn=null;
      await refresh({light:true});await animate(before,getWorld());
      const rows=await api('/contacts/'+session.id+'/messages'),last=rows.items.filter(m=>m.role==='assistant').pop();
      el('world-dialogue-status').textContent=last?.world_action?.state==='rejected'?'台词已保存；动作未执行：'+last.world_action.reason:'已保存对话与世界事件';
    }catch(e){report(e);el('world-dialogue-status').textContent=e.message;}
    finally{busy=false;el('world-send').disabled=false;el('world-cancel').hidden=true;await lines();render();}
  }
  el('world-close').onclick=()=>el('world-dialogue').close();
  el('world-dialogue').addEventListener('close',()=>{document.body.classList.remove('world-talking');stopSpeech();localReady.then(s=>s.cancel());});
  el('world-records').onclick=safe(async()=>{await lines();el('world-history-dialog').showModal();});
  el('world-history-close').onclick=()=>el('world-history-dialog').close();
  el('world-prev').onclick=()=>{stopSpeech();index=Math.max(0,index-1);render();};
  el('world-next').onclick=()=>{stopSpeech();index=Math.min(pages.length-1,index+1);render();};
  el('world-replay').onclick=safe(async()=>{if(!chosen||chosen.state!=='complete'||busy)return;const text=pages.join('\n');if(text.length>3500)throw Error('本轮台词过长，请在记录中选择较短的回复朗读');await speak(text,session.voice||'');});
  el('world-portrait').onclick=safe(async()=>{
    const look=await api('/character-looks/'+person.id);
    if(look.portraits.length<2){await editLook(person.id);await portrait();return;}
    await api('/character-looks/'+person.id,'PATCH',{portrait:(look.portrait+1)%look.portraits.length});await refresh({light:true});await portrait();
  });
  el('world-composer').onsubmit=safe(async e=>{e.preventDefault();await send(el('world-input').value);});
  el('world-input').oninput=safe(()=>api('/contacts/'+session.id+'/draft','PATCH',{text:el('world-input').value}));
  el('world-cancel').onclick=()=>localReady.then(s=>s.cancel());
  el('world-dialogue-retry').onclick=safe(()=>failedTurn&&send(failedTurn.text,failedTurn.id));
  el('world-older').onclick=safe(()=>lines(older));
  el('world-history-save').onclick=safe(async()=>{const raw=el('world-history-limit').value;session=await api('/contacts/'+session.id,'PATCH',{history_limit:raw===''?null:Number(raw)});toast('场景上下文设置已保存');});
  el('world-preview').onclick=safe(async()=>{const v=await api('/contacts/'+session.id+'/context-preview','POST',{message:el('world-input').value});el('world-preview-text').textContent=JSON.stringify(v.messages,null,2);});
  return {open,isBusy:()=>busy,close(){if(el('world-history-dialog').open)el('world-history-dialog').close();if(el('world-dialogue').open)el('world-dialogue').close();stopSpeech();}};
}
