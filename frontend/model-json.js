// SPDX-License-Identifier: AGPL-3.0-only
// Wrapper helpers adapted from AI Virtual Phone / float, lib/checkphone-json-repair.ts.
// Revision c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b, blob fa64ad54e118b1a5d4fde3fc22ae21fe0e7dfdfb.
// Contributor: xiaolongbao0709. Modified 2026-10-16 for T-: remove types;
// strip only outer wrappers, preserve literal tags/typography inside JSON strings;
// repair through jsonrepair without global punctuation replacement. See THIRD_PARTY_NOTICES.md.
import {jsonrepair} from './vendor/jsonrepair/regular/jsonrepair.js';

export function stripJsonWrapperNoise(text) {
  let source = text.trim();
  source = source.replace(/^<think>[\s\S]*?<\/think>\s*/i, '').trim();
  source = source.replace(/^<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim();
  source = source.replace(/^<reasoning>[\s\S]*?<\/reasoning>\s*/i, '').trim();
  source = source.replace(/^```(?:json)?\s*([\s\S]*?)```\s*$/i, '$1').trim();
  return source;
}

export function extractJSONObjectCandidate(text) {
  const source = stripJsonWrapperNoise(text);
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return source.slice(firstBrace, lastBrace + 1);
  return source;
}

// Syntax recovery must not silently manufacture the missing tail of a model response.
function closedContainers(text) {
  const stack=[];let quote='',escaped=false;
  for(const c of text){
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='{'||c==='[')stack.push(c);
    else if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'['))return false;}
  }
  return !quote&&!stack.length;
}

export function parseModelObject(text) {
  if(typeof text!=='string'||text.length>100000)throw Error('模型结构结果过大或格式错误，原数据未修改');
  const object=value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('模型需要返回一个 JSON 对象');return value;};
  try{return {value:object(JSON.parse(text)),mode:'raw'};}catch{}
  const candidate=extractJSONObjectCandidate(text);
  // A plain JSON array or multiple objects is not an extraction result.
  const stripped=stripJsonWrapperNoise(text);
  if(stripped.startsWith('[')||!candidate.startsWith('{')||!closedContainers(candidate))throw Error('模型结果不完整或不是 JSON 对象，原数据未修改，可重试');
  try{return {value:object(JSON.parse(candidate)),mode:'wrapped'};}catch{}
  try{return {value:object(JSON.parse(jsonrepair(candidate))),mode:'repaired'};}
  catch{throw Error('模型未返回有效 JSON，原数据未修改，可重试');}
}
