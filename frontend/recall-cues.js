// SPDX-License-Identifier: MIT
// Copyright (c) 2026 ChiYouyu
// Adapted from Serein retrieval_budget.py, revision 180c94a54feb28283aa8af15a4f49a129aa8b397.
// Source blob 72838be2e3c8ae3f994bacb6c5b6afc066f67046.
// Ports REFERENCE_MARKERS, CONTINUATION_MARKERS and _contains_any; no identity defaults.
// Adaptation: bounded recent-context eligibility, without the Python routing/planner service.
// Full notice: licenses/Serein-MIT.txt. Source/blob and changes: THIRD_PARTY_NOTICES.md.
const referenceMarkers=['昨天那个','前天那个','上次那个','刚才那个','之前那个','提到的','说过的','记得那个','那个','这件','那件','这条','那条','这次','那次','上次'];
const continuationMarkers=['还没有','还没','还在','没完','继续','仍然','又','再'];
function containsAny(text,markers){
  const found=[];
  for(const marker of [...markers].sort((a,b)=>b.length-a.length)){
    if(text.includes(marker)&&!found.some(existing=>existing.includes(marker)))found.push(marker);
  }
  return found;
}
export function recallCues(text){
  if(/^(你好|早安|晚安|再见|谢谢|嗯|好的)[！!。.\s]*$/.test(text.trim()))return {needsContext:false,markers:[]};
  const references=containsAny(text,referenceMarkers);
  const continuations=text.trim().length<=24?containsAny(text,continuationMarkers):[];
  // Local extension for a follow-up whose subject lives in the preceding user turn.
  const followup=/^(后来|然后|结果)/.test(text.trim());
  return {needsContext:!!(references.length||continuations.length||followup),markers:[...references,...continuations,...(followup?['后续提问']:[])]};
}
