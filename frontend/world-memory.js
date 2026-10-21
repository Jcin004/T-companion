// SPDX-License-Identifier: AGPL-3.0-only
// Shared MemoryModule acceptance rules, also used by the headless host.
import {eventValue,ensureMemory} from './memory-core.js';
export function acceptWorldMemories(data,owner,candidates,allowed,jobId,at){
  if(!Array.isArray(candidates)||candidates.length>3)throw Error('世界记忆候选最多三条');
  const values=candidates.map(c=>{
    if(!Array.isArray(c.evidence)||c.evidence.some(e=>e.source_type!=='world_event'||!allowed.includes(e.event_id)))throw Error('记忆只能引用本次已知世界事件');
    return eventValue(data,owner,{...c,participants:[owner]});
  });
  const memory=ensureMemory(data);
  if(memory.events.length+values.length>5000)throw Error('记忆容量已满');
  values.forEach((value,i)=>{
    const id='life_mem_'+jobId+'_'+i;
    if(!memory.events.some(m=>m.id===id||m.owner_id===owner&&m.content===value.content&&JSON.stringify(m.evidence)===JSON.stringify(value.evidence)))memory.events.push({id,...value,origin:'ai',revision:0,created_at:at,updated_at:at,versions:[]});
  });
  return values.length;
}
