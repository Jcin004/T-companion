// SPDX-License-Identifier: AGPL-3.0-only
import {portraitImage} from './world-art.js';
import {sceneText} from './world-scene-actions.js';
import {replyParts} from './chat-style.js';
import {presentationLines,presentationText} from './scene-presentation.js';
import {skinChoices} from './character-looks.js';
const el=id=>document.getElementById(id),uid=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
export function installSceneDialogue(){
  const d=document.createElement('dialog');d.id='world-dialogue';d.className='world-dialogue';
  d.innerHTML='<button id="world-close" aria-label="返回房间">×</button><div class="world-dialogue-main"><button id="world-portrait" aria-label="切换对话立绘"></button><div class="world-dialogue-copy"><strong id="world-speaker"></strong><div id="world-current-line" aria-live="polite"></div></div></div><div class="world-playback"><button id="world-records" aria-label="查看场景聊天记录">记录</button><button id="world-prev">◀ 上一句</button><button id="world-replay">▷ 重播本轮</button><button id="world-next">下一句 ▶</button><small id="world-page"></small></div><form id="world-composer"><textarea id="world-input" maxlength="20000" rows="1" placeholder="说些什么…" aria-label="场景对话输入"></textarea><button id="world-send" class="primary">发送</button><button id="world-cancel" type="button" hidden>停止</button><button id="world-dialogue-retry" type="button" hidden>重试</button></form><p id="world-dialogue-status" role="status"></p>';
  document.body.append(d);
  const history=document.createElement('dialog');history.id='world-history-dialog';history.className='world-panel';
  history.innerHTML='<header><h2>世界对话记录</h2><button id="world-history-close" aria-label="关闭聊天记录">× 关闭</button></header><form id="world-history-filter"><label>人物<select id="world-history-owner"></select></label><label>搜索内容<input id="world-history-search" type="search" maxlength="200" placeholder="搜索世界里的对话"></label><button>搜索</button></form><div id="world-lines"></div><footer><p id="world-history-status" role="status"></p><button id="world-older">加载更早对话</button></footer><details id="world-history-context" hidden><summary>当前交谈人物的上下文设置</summary><label>历史消息条数（空白跟随全局）<input id="world-history-limit" type="number" min="0" max="2000"></label><button id="world-history-save">保存上下文设置</button><button id="world-preview">预览本轮上下文</button><pre id="world-preview-text"></pre></details>';document.body.append(history);
}
export function mountSceneDialogue({api,localReady,getWorld,refresh,animate,speak,stopSpeech,toast,report,editLook,history}){
  let session,person,busy=false,failedTurn=null,older=0,pages=[],index=0,messages=[],chosen=null,streamText='',catalog,portraitVersion=0,manualPortrait=null;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);toast(e.message);el('world-dialogue-status').textContent=e.message;}};
  function paragraphPages(message){
    const pages=[];let group='',emotion='neutral';const flush=()=>{for(const p of replyParts(group,message.chat_style).filter(p=>['text','voice','action'].includes(p.type)))if(p.text.trim())pages.push({text:p.text,emotion,type:p.type});group='';};
    for(const line of presentationLines(sceneText(message.content)).lines){if(line.emotion!==emotion||!line.text.trim()){flush();emotion=line.emotion;}group+=(group?'\n':'')+line.text;}flush();return pages;
  }
  function show(message){
    stopSpeech();manualPortrait=null;chosen=message;pages=paragraphPages(message);if(!pages.length)pages=[{text:'（这条消息没有可显示的文字）',emotion:'neutral'}];index=0;render();
  }
  function render(){
    el('world-current-line').textContent=pages[index]?.text||'走近的人正在等你说话。';
    el('world-page').textContent=pages.length?(index+1)+' / '+pages.length:'';
    el('world-prev').disabled=busy||index===0;el('world-next').disabled=busy||index>=pages.length-1;
    el('world-replay').disabled=busy||!chosen||chosen.state!=='complete';
    if(person&&catalog)void portrait().catch(e=>report(e));
  }
  async function portrait(){
    const version=++portraitVersion,w=getWorld(),look=skinChoices(catalog).find(s=>s.id===chosen?.presentation?.skin_id)||w.looks[person.id],img=document.createElement('img');img.src=await portraitImage(manualPortrait===null?look:{...look,portrait:manualPortrait},person.avatar,manualPortrait===null?(pages[index]?.emotion||'neutral'):undefined);if(version!==portraitVersion)return;img.alt=person.name+' · '+(pages[index]?.emotion||'neutral');el('world-portrait').replaceChildren(img);el('world-speaker').textContent=person.name;
  }
  async function lines(before){
    const page=await api('/contacts/'+session.id+'/messages'+(before?'?before='+before:''));
    messages=before?[...page.items,...messages]:page.items;
    older=messages[0]?.id||0;el('world-older').hidden=!page.has_before;
    const failed=messages.filter(m=>m.role==='user'&&['failed','cancelled','interrupted'].includes(m.state)).pop();
    failedTurn=failed?{text:failed.content,id:failed.request_id}:null;el('world-dialogue-retry').hidden=!failedTurn;
    if(!before){const last=messages.filter(m=>m.role==='assistant').pop();if(last)show(last);else{pages=[];chosen=null;render();}}
  }
  async function open(id){
    session=await api('/world/dialogue','POST',{character_id:id});person=getWorld().residents.find(r=>r.id===id);
    await refresh({light:true});catalog=await api('/character-looks/'+id);el('world-history-context').hidden=false;
    el('world-history-limit').value=session.history_limit??'';el('world-preview-text').textContent='';el('world-dialogue-status').textContent='';
    el('world-input').value=(await api('/contacts/'+session.id+'/draft')).text;
    await portrait();await lines();el('world-dialogue').show();document.body.classList.add('world-talking');
  }
  async function send(text,id=uid()){
    if(busy||!text.trim())return;
    busy=true;failedTurn={text,id};streamText='';chosen=null;pages=[];el('world-send').disabled=true;el('world-cancel').hidden=false;render();
    el('world-dialogue-status').textContent='正在回复…';const before=getWorld();
    try{
      await (await localReady).stream(session.id,text,id,(type,e)=>{if(type==='delta'){streamText+=e.text;el('world-current-line').textContent=presentationText(sceneText(streamText)).replace(/\[世界行动:[\s\S]*$/,'');}});
      el('world-input').value='';await api('/contacts/'+session.id+'/draft','PATCH',{text:''});failedTurn=null;
      await refresh({light:true,paint:false});await animate(before,getWorld());
      catalog=await api('/character-looks/'+person.id);
      const rows=await api('/contacts/'+session.id+'/messages'),last=rows.items.filter(m=>m.role==='assistant').pop();
      el('world-dialogue-status').textContent=last?.skin_error?'台词已保存；未换装：'+last.skin_error:last?.world_action?.state==='rejected'?'台词已保存；动作未执行：'+last.world_action.reason:'已保存对话与世界事件';
    }catch(e){report(e);el('world-dialogue-status').textContent=e.message;}
    finally{busy=false;el('world-send').disabled=false;el('world-cancel').hidden=true;await lines();render();}
  }
  el('world-close').onclick=()=>el('world-dialogue').close();
  el('world-dialogue').addEventListener('close',()=>{document.body.classList.remove('world-talking');stopSpeech();localReady.then(s=>s.cancel());});
  el('world-records').onclick=safe(()=>history.open());
  el('world-prev').onclick=()=>{stopSpeech();manualPortrait=null;index=Math.max(0,index-1);render();};
  el('world-next').onclick=()=>{stopSpeech();manualPortrait=null;index=Math.min(pages.length-1,index+1);render();};
  el('world-replay').onclick=safe(async()=>{if(!chosen||chosen.state!=='complete'||busy)return;const text=pages.map(p=>p.text).join('\n');if(text.length>3500)throw Error('本轮台词过长，请选择较短的回复朗读');await speak(text,session.voice||'');});
  el('world-portrait').onclick=safe(async()=>{
    catalog=await api('/character-looks/'+person.id);const id=chosen?.presentation?.skin_id||catalog.active_skin_id,skin=id==='default'?catalog:catalog.skins.find(s=>s.id===id)||catalog;
    if(skin.portraits.length<2){await editLook(person.id);catalog=await api('/character-looks/'+person.id);await portrait();return;}
    manualPortrait=((manualPortrait??skin.portrait)+1)%skin.portraits.length;skin.portrait=manualPortrait;
    await api('/character-looks/'+person.id,'PATCH',catalog);await refresh({light:true});await portrait();
  });
  el('world-composer').onsubmit=safe(async e=>{e.preventDefault();await send(el('world-input').value);});
  el('world-input').oninput=safe(()=>api('/contacts/'+session.id+'/draft','PATCH',{text:el('world-input').value}));
  el('world-cancel').onclick=()=>localReady.then(s=>s.cancel());
  el('world-dialogue-retry').onclick=safe(()=>failedTurn&&send(failedTurn.text,failedTurn.id));
  el('world-history-save').onclick=safe(async()=>{const raw=el('world-history-limit').value;session=await api('/contacts/'+session.id,'PATCH',{history_limit:raw===''?null:Number(raw)});toast('场景上下文设置已保存');});
  el('world-preview').onclick=safe(async()=>{const v=await api('/contacts/'+session.id+'/context-preview','POST',{message:el('world-input').value});el('world-preview-text').textContent=JSON.stringify(v.messages,null,2);});
  return {open,reload:()=>session&&lines(),isBusy:()=>busy,close(){if(el('world-history-dialog').open)el('world-history-dialog').close();if(el('world-dialogue').open)el('world-dialogue').close();stopSpeech();}};
}
