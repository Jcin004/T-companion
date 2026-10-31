// SPDX-License-Identifier: AGPL-3.0-only
// Memory owns dependent cards, versions and links. Raw sources are owned elsewhere.
import {ensureMemory} from './memory-core.js';
import {removeNodeLinks} from './memory-links.js';
export function removeSourceMemories(data,messageIds,eventIds){
  const memory=ensureMemory(data),messages=new Set(messageIds),events=new Set(eventIds);
  const refers=v=>(v.evidence||[]).some(e=>e.source_type==='world_event'?events.has(e.event_id):messages.has(e.message_id))||(v.source_ids||[]).some(id=>messages.has(id));
  const depends=v=>refers(v)||(v.versions||[]).some(refers);
  const removed=memory.events.filter(depends);memory.events=memory.events.filter(e=>!depends(e));
  for(const m of removed)removeNodeLinks(data,'memory',m.id);
  const summaries=memory.summaries.filter(depends);memory.summaries=memory.summaries.filter(s=>!depends(s));
  memory.monthly_summaries=memory.monthly_summaries.filter(s=>!depends(s));
  return {memories:removed.length,summaries:summaries.length};
}
