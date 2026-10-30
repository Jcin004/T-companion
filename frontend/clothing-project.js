// SPDX-License-Identifier: AGPL-3.0-only
// Pure project schema; safe in foreground and the headless world host.
import {CLOTHING_TEMPLATE as T,CLOTHING_COLORS,starterClothes} from './clothing-template.js';
export function newDrawing(){return {version:1,template_id:T.id,colors:[...CLOTHING_COLORS],frames:Array.from({length:12},(_,i)=>starterClothes(Math.floor(i/3),i%3))};}
export function validateDrawing(project){
  if(!project||Object.keys(project).some(k=>!['version','template_id','colors','frames'].includes(k))||project.version!==1||project.template_id!==T.id||!Array.isArray(project.colors)||project.colors.length!==16||project.colors[0]!==''||project.colors.slice(1).some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))||!Array.isArray(project.frames)||project.frames.length!==12||project.frames.some(f=>typeof f!=='string'||f.length!==T.width*T.height||!/^[0-9a-f]+$/.test(f)))throw Error('绘画工程格式或素体版本无效');
  return project;
}
export function validateDrawingState(value){
  if(value===undefined)return;
  if(!value||Object.keys(value).some(k=>!['version','revision','project','draft'].includes(k))||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('绘画版本无效');
  for(const project of [value.project,value.draft])if(project!==undefined)validateDrawing(project);
}
export function drawingChange(skin,method,body){
  const state=skin.drawing||{version:1,revision:0},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(method==='GET')return state;
  if(!['PATCH','POST'].includes(method)||!body||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0||body.expected_revision>state.revision)throw Error('绘画请求或版本无效');
  validateDrawing(body.project);
  const duplicate=method==='PATCH'?same(state.draft,body.project):!state.draft&&same(state.project,body.project)&&same(skin.sprite,body.sprite);
  if(duplicate)return state;
  if(state.revision!==body.expected_revision)throw Error('这幅画已在别处修改，请关闭后重新打开；当前画面尚未覆盖已保存内容');
  if(state.revision===Number.MAX_SAFE_INTEGER)throw Error('绘画版本已达上限');
  const next={...state,revision:state.revision+1};
  if(method==='PATCH')next.draft=body.project;
  else{next.project=body.project;delete next.draft;skin.sprite=body.sprite;}
  skin.drawing=next;validateDrawingState(next);return next;
}
