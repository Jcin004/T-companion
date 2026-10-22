// SPDX-License-Identifier: AGPL-3.0-only
import {sceneText} from './world-scene-actions.js';
import {presentationText} from './scene-presentation.js';
import {replyParts} from './chat-style.js';
const el=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function mountWorldHistory({api,speak,stopSpeech,afterDelete,toast,report}){
  let people=[],cursor=null,rows=[],generation=0;
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){report(e);toast(e.message);el('world-history-status').textContent=e.message;}};
  function render(){
    const list=el('world-lines');list.replaceChildren();
    for(const entry of rows){
      const card=node('article');card.className='world-history-message';
      const name=id=>people.find(p=>p.id===id)?.name||id;
      card.append(node('small',new Date(entry.created_at).toLocaleString()+' · '+entry.participants.map(name).join('、')+(entry.state==='complete'?'':' · '+entry.state)));
      for(const m of entry.messages){
        const parts=m.role==='assistant'?replyParts(presentationText(sceneText(m.content)),m.chat_style):[{type:'text',text:m.content}];
        for(const part of parts){const p=node('p',name(m.speaker_id)+'：'+part.text);card.append(p);
          if(part.type==='voice'){const replay=node('button','重新播放语音');replay.onclick=safe(()=>speak(part.text,m.voice||''));card.append(replay);}
        }
      }
      if(entry.source_event_ids.length)card.append(node('small','事件来源：'+entry.source_event_ids.join('、')));
      if(entry.linked_memories.length){const details=node('details');details.append(node('summary','对应 '+entry.linked_memories.length+' 条记忆'));for(const m of entry.linked_memories)details.append(node('p',name(m.owner_id)+'：'+m.title));card.append(details);}
      const remove=node('button','删除对话与对应记忆');remove.onclick=safe(async()=>{
        if(!confirm('删除这条对话，并删除引用它的记忆、总结及关联？已完成的物品操作保留。'))return;
        stopSpeech();const result=await api('/world-history/'+encodeURIComponent(entry.id),'DELETE');await afterDelete();await load();toast('已删除对话及 '+result.memories+' 条对应记忆');
      });card.append(remove);list.append(card);
    }
    if(!rows.length)list.append(node('p','没有符合条件的世界对话。'));
  }
  async function load(older=false){
    const token=++generation,q=new URLSearchParams({q:el('world-history-search').value,owner:el('world-history-owner').value});if(older&&cursor)q.set('before',cursor);
    el('world-history-status').textContent='正在读取…';
    const result=await api('/world-history?'+q);if(token!==generation)return;rows=older?[...rows,...result.items]:result.items;cursor=result.next_cursor;
    el('world-older').hidden=!result.has_before;el('world-history-status').textContent='共显示 '+rows.length+' 条；查看记录不改变居民的知情范围。';render();
  }
  el('world-history-filter').onsubmit=safe(async e=>{e.preventDefault();await load();});
  el('world-history-owner').onchange=safe(()=>load());el('world-older').onclick=safe(()=>load(true));
  el('world-history-close').onclick=()=>el('world-history-dialog').close();
  el('world-history-dialog').addEventListener('close',()=>{generation++;stopSpeech();});
  return {async open(){people=[{id:'user',name:'我'},...await api('/characters')];const select=el('world-history-owner'),chosen=select.value;select.replaceChildren(new Option('全部人物',''),...people.map(p=>new Option(p.name,p.id)));select.value=chosen||'';await load();if(!el('world-history-dialog').open)el('world-history-dialog').showModal();}};
}
