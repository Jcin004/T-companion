// SPDX-License-Identifier: AGPL-3.0-only
import {DEFAULT_ACTION_PROMPT,normalizeChatStyle} from './chat-style.js';
import {validateHistoryLimit} from './context-policy.js';
const el=id=>document.getElementById(id);

export function mountChatSettings({api,isLocal,isBusy,getCurrent,setCurrent,getPrefs,setPrefs,voiceOptions,updated,toast,dialogs}) {
  const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
  const localOnly=()=>{if(!isLocal())throw Error('聊天风格目前支持本机模式');if(isBusy())throw Error('请等待当前回复完成');};
  function readLimit(id) {
    const text=el(id).value.trim();
    if(!/^\d+$/.test(text))throw Error('历史消息条数应为 0–2000 的整数');
    return validateHistoryLimit(Number(text));
  }
  function scopeHint() {
    const inherited=el('chat-history-mode').value==='inherit';
    el('chat-history-hint').textContent=inherited
      ? `当前跟随全局 ${getPrefs().history_limit??30} 条。直接输入数字会改为此聊天独立设置。`
      : '仅此人物的当前聊天生效；其他人物保持原设置。0 表示不携带历史，不删除记录。';
  }
  function refresh() {
    el('history-limit').value=getPrefs().history_limit??30;
    el('quick-actions').textContent='动作：'+(normalizeChatStyle(getCurrent()?.chat_style).actions?'开':'关');
  }
  el('details').onclick=()=>{
    const c=getCurrent();if(!c)return;
    el('note').value=c.note;el('background').value=c.background;
    voiceOptions(el('contact-voice'),c.voice,true);
    el('chat-history-mode').value=c.history_limit==null?'inherit':'custom';
    el('chat-history-limit').value=c.history_limit??getPrefs().history_limit??30;
    scopeHint();el('details-dialog').showModal();
  };
  el('chat-history-mode').onchange=()=>{
    if(el('chat-history-mode').value==='inherit')el('chat-history-limit').value=getPrefs().history_limit??30;
    scopeHint();
  };
  el('chat-history-limit').oninput=()=>{el('chat-history-mode').value='custom';scopeHint();};
  el('context-form').onsubmit=guard(async e=>{
    e.preventDefault();setPrefs(await api('/settings','PATCH',{history_limit:readLimit('history-limit')}));
    await updated();toast('全局默认已保存；跟随全局的聊天下次发送生效');
  });
  el('details-form').onsubmit=guard(async e=>{
    e.preventDefault();const c=getCurrent();
    setCurrent(await api('/contacts/'+c.id,'PATCH',{
      note:el('note').value,background:el('background').value,voice:el('contact-voice').value,
      history_limit:el('chat-history-mode').value==='inherit'?null:readLimit('chat-history-limit')
    }));
    await updated();el('details-dialog').close();toast('此聊天设置已保存，下次发送生效');
  });
  el('chat-style-open').onclick=guard(()=>{localOnly();const c=getCurrent();if(!c)return;const s=normalizeChatStyle(c.chat_style);el('split-replies').checked=s.split;el('allow-actions').checked=s.actions;el('action-prompt').value=s.action_prompt;el('style-mode').value=s.mode;for(const [id,key,out]of [['action-weight','action_weight','action-value'],['emoji-weight','emoji','emoji-value'],['voice-weight','voice','voice-value']]){el(id).value=s[key];el(out).value=s[key];}dialogs.openChild('chat-style-dialog','details-dialog');});
  for(const [id,out]of [['action-weight','action-value'],['emoji-weight','emoji-value'],['voice-weight','voice-value']])el(id).oninput=()=>el(out).value=el(id).value;
  el('chat-style-form').onsubmit=guard(async e=>{e.preventDefault();localOnly();const c=getCurrent(),chat_style={split:el('split-replies').checked,actions:el('allow-actions').checked,mode:el('style-mode').value,action_weight:Number(el('action-weight').value),emoji:Number(el('emoji-weight').value),voice:Number(el('voice-weight').value),action_prompt:el('action-prompt').value};setCurrent(await api('/contacts/'+c.id,'PATCH',{chat_style}));el('chat-style-dialog').close();await updated();toast('当前聊天风格已保存');});
  el('reset-action-prompt').onclick=()=>{el('action-prompt').value=DEFAULT_ACTION_PROMPT;};
  el('quick-actions').onclick=guard(async()=>{localOnly();const c=getCurrent();if(!c)return;const chat_style=normalizeChatStyle(c.chat_style);chat_style.actions=!chat_style.actions;setCurrent(await api('/contacts/'+c.id,'PATCH',{chat_style}));el('quick-actions').textContent='动作：'+(chat_style.actions?'开':'关');toast('动作描写已'+(chat_style.actions?'开启':'关闭'));});

  return {refresh};
}
