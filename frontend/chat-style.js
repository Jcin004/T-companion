// SPDX-License-Identifier: AGPL-3.0-only
// Presentation actions only: these markers never execute external tools.
export const DEFAULT_ACTION_PROMPT = '当前是线上私聊，{{char}}与{{user}}通过消息交流，不默认身处同一空间。需要时用 [动作:描写] 简短表达角色自己这一端的表情或小动作，倾向 {{action_weight}}/100；也可以直接用文字说出来。不要把用户写进同处一室、触碰或面对面互动的场景；只有双方明确进入共同的虚构场景时，才按该场景描写。';
export const DEFAULT_CHAT_STYLE = Object.freeze({split:true,actions:false,mode:'dynamic',emoji:30,voice:15,action_weight:40,action_prompt:DEFAULT_ACTION_PROMPT});
export function normalizeChatStyle(value={}) {
  if(value.action_prompt!=null&&(typeof value.action_prompt!=='string'||value.action_prompt.length>4000))throw Error('动作模板须为不超过 4000 字的文字');
  const actionPrompt=value.action_prompt?.trim()||DEFAULT_ACTION_PROMPT;
  const percent=(key)=>Math.max(0,Math.min(100,Number.isFinite(Number(value[key]))?Number(value[key]):DEFAULT_CHAT_STYLE[key]));
  return {split:value.split!==false,actions:value.actions===true&&percent('action_weight')>0,mode:value.mode==='fixed'?'fixed':'dynamic',emoji:percent('emoji'),voice:percent('voice'),action_weight:percent('action_weight'),action_prompt:actionPrompt};
}
export function styleInstructions(value, {characterName='角色',userName='用户',scene=false}={}) {
  const s=normalizeChatStyle(value);
  const tokens={char:characterName,user:userName,action_weight:String(s.action_weight)};
  const template=scene&&s.action_prompt===DEFAULT_ACTION_PROMPT?'当前在已确认的共同场景中交流。可用 [动作:描写] 表达角色自身的小动作，倾向 {{action_weight}}/100。不得替用户行动；模型描写不执行世界命令。':s.action_prompt;
  const actionPrompt=template.replace(/\{\{(char|user|action_weight)\}\}/g,(_,key)=>tokens[key]);
  return (scene?'\n\n【场景对话表达设置】\n':'\n\n【当前私聊表达设置】\n')+[
    '以角色自己的身份自然交流，结合原始人设和当前情景，不扮演设置管理员。',
    s.split?'需要时用空行分成几条自然消息；一条一个意思，不机械按句号拆开。':'本轮使用一个连续文本回复，不刻意分条。',
    s.actions?`动作描写偏好（不改变人物事实与运行约束）：\n${actionPrompt}\n不要声称已操作真实设备或完成外部行动。`:'关闭动作描写：不输出动作、旁白或星号动作。',
    s.emoji?`可用 [表情:一个或少量合适的emoji]，倾向 ${s.emoji}/100。`:'关闭表情，不添加 emoji 或表情标记。',
    s.voice?`可将适合朗读的一小段话写为 [语音:要说的话]，倾向 ${s.voice}/100，每轮最多一条。由用户点击设备语音朗读，不代表录制的真人声音。`:'关闭语音条，全部使用文字。',
    s.mode==='dynamic'?'这些数值是表达倾向；结合角色说话习惯、话题和情景决定是否使用，严肃话题可全部不用，不要凑配额。':'这些数值表示本轮候选动作的机会；只使用本轮获准的类型，获准也可以不用。',
    '只使用上述表达标记，不输出工具调用、转账或设备操作标签。'
  ].join('\n');
}
export function turnChatStyle(value, requestId) {
  const s=normalizeChatStyle(value);if(s.mode!=='fixed')return s;
  const eligible=(key)=>{let n=2166136261;for(const c of requestId+':'+key)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0)%100<s[key];};
  return {...s,actions:s.actions&&eligible('action_weight'),emoji:eligible('emoji')?s.emoji:0,voice:eligible('voice')?s.voice:0};
}
export function replyParts(text,value,partial=false) {
  const s=normalizeChatStyle(value),parts=[];let cursor=0;
  // Match code fences first so markup examples remain ordinary text.
  const pattern=/```[\s\S]*?(?:```|$)|\[(动作|表情|语音)[:：]([^\]\n]*)(?:\]|$)/g;
  const addText=t=>{for(const body of (s.split?t.split(/\n\s*\n+/):[t]))if(body.trim())parts.push({type:'text',text:body.trim()});};
  let match,voices=0;
  while((match=pattern.exec(text))){
    addText(text.slice(cursor,match.index));cursor=pattern.lastIndex;
    if(match[0].startsWith('```')){parts.push({type:'text',text:match[0]});continue;}
    if(partial&&!match[0].endsWith(']'))continue;
    const body=match[2].trim();if(!body)continue;
    if(match[1]==='动作'){if(s.actions)parts.push({type:'action',text:body});}
    else if(match[1]==='表情'){if(s.emoji>0)parts.push({type:'emoji',text:body});}
    else {parts.push({type:s.voice>0&&voices++===0?'voice':'text',text:body});}
  }
  let tail=text.slice(cursor);if(partial)tail=tail.replace(/\[(?:动(?:作)?|表(?:情)?|语(?:音)?)(?:[:：][^\]]*)?$/,'');
  addText(tail);
  // Bound the number of DOM nodes without discarding a long answer.
  if(parts.length>40){const rest=parts.splice(39);parts.push({type:'text',text:rest.map(p=>p.text).join('\n\n')});}
  return parts;
}
