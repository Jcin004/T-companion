// SPDX-License-Identifier: AGPL-3.0-only
// Allowlisted display metadata. No sentiment classifier or model/network calls.
export function presentationLines(text){
  let fenced=false,emotion='neutral';const lines=[],skins=[],gestures=[];
  for(const raw of text.split('\n')){
    if(raw.trim().startsWith('```'))fenced=!fenced;
    if(!fenced){
      const skin=raw.trim().match(/^\[换装:([a-zA-Z0-9_-]{1,48})\]$/);if(skin){skins.push(skin[1]);continue;}
      const gesture=raw.trim().match(/^\[小人动作:([a-zA-Z0-9_-]{1,48})\]$/);if(gesture){gestures.push(gesture[1]);continue;}
      const match=raw.match(/^\s*\[情绪:([a-zA-Z0-9_-]{1,48})\]\s*(.*)$/);if(match){emotion=match[1];lines.push({text:match[2],emotion});continue;}
    }
    lines.push({text:raw,emotion});
  }
  return {lines,skins,gestures};
}
export function presentationText(text){return presentationLines(text).lines.map(l=>l.text).join('\n').replace(/\[(?:情绪|换装|小人动作):[^\]]*$/,'');}
export function sceneSkinCandidate(text){const skins=presentationLines(text).skins;if(skins.length>1)throw Error('一轮只允许选择一套皮肤');return skins[0];}
export function sceneGestureCandidate(text){const {gestures}=presentationLines(text);if(gestures.length>1)throw Error('一轮只允许一个小人动作');return gestures[0];}
export function presentationInstructions(options){return '\n【本人物的显示选项】\n'+JSON.stringify(options)+'\n可以在一段台词前写 [情绪:已配置的表情ID]，只切换对话图片，不是语音音色，也不代表永久情绪或身份变化。没有相应图片时使用 neutral。仅当 skins 提供候选且确实想换装，末尾单独一行写 [换装:皮肤ID]；只允许你本人的已授权皮肤，完成回复后由程序校验。若 gestures 有候选，可在末尾独立写 [小人动作:候选ID] 播放一次自己的表情姿态；它不操作家具、不改变他人状态，不得编造物品效果。';}
