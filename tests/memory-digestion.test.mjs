import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {copy} from '../frontend/memory-core.js';
import {removeSourceMemories} from '../frontend/memory-source-deletion.js';

async function fixture(){
 const store={value:emptyData(),fail:false,async load(){return copy(this.value);},async save(value){if(this.fail)throw Error('disk full');this.value=copy(value);},async hasKey(){return false;}};
 let response={summary:'依据近期经历复核。',reviews:[]},beforeReply=async()=>{};const requests=[];
 const service=await new LocalService(store,async(settings,key,messages,delta)=>{
  requests.push(copy(messages));await beforeReply(messages);const value=typeof response==='function'?response(messages):response;delta(typeof value==='string'?value:JSON.stringify(value));
 }).init();
 const a=await service.api('/characters','POST',{name:'甲',identity:'',style:'',avatar:''}),b=await service.api('/characters','POST',{name:'乙',identity:'',style:'',avatar:''});
 await service.api('/settings','PATCH',{model:'mock',timezone:'Asia/Shanghai'});
 const chatA=await service.api('/contacts','POST',{character_id:a.id}),chatB=await service.api('/contacts','POST',{character_id:b.id});
 await service.stream(chatA.id,'我一直想去海边。','seed-a-1',()=>{});
 await service.stream(chatA.id,'今天我们真的去了海边。','seed-a-2',()=>{});
 await service.stream(chatB.id,'这是乙自己的私密经历。','seed-b-1',()=>{});
 const source=(chat,role='user',index=0)=>service.data.messages.filter(item=>item.session_id===chat.id&&item.role===role)[index];
 const add=async(owner,chat,{title,content,room,kind='experience',sourceMessage, cognition_status,cognition_locked})=>{
  const payload={owner_id:owner.id,title,content,room,kind,evidence:[{message_id:sourceMessage.id,quote:sourceMessage.content}]};
  if(cognition_status!==undefined)Object.assign(payload,{cognition_status,cognition_locked});
  await service.api('/memories','POST',payload);return service.data.memory.events.find(item=>item.owner_id===owner.id&&item.title===title);
 };
 const wish=await add(a,chatA,{title:'海边期盼',content:'我一直期待去海边。',room:'windowsill',kind:'statement',sourceMessage:source(chatA,'user',0)});
 const concern=await add(a,chatA,{title:'是否能成行',content:'还不确定是否能一起去。',room:'attic',kind:'interpretation',sourceMessage:source(chatA,'assistant',0)});
 const experience=await add(a,chatA,{title:'去了海边',content:'今天确实一起去了海边。',room:'living_room',sourceMessage:source(chatA,'user',1)});
 const promise=await add(a,chatA,{title:'下次约定',content:'以后还会一起去。',room:'bedroom',kind:'promise',sourceMessage:source(chatA,'assistant',1)});
 const foreign=await add(b,chatB,{title:'乙的私密经历',content:'乙自己的私密经历。',room:'living_room',sourceMessage:source(chatB)});
 const output=reviews=>({summary:'近期经历显示已经成行；另一问题仍需复核。',reviews});
 const set=value=>{response=value;};
 const onRequest=fn=>{beforeReply=fn;};
 const material=(owner=a)=>service.api('/memory-digestion/material?owner='+encodeURIComponent(owner.id));
 const run=(owner=a)=>service.api('/memory-digestion/run','POST',{owner_id:owner.id});
 const reports=(owner=a)=>service.api('/memory-digestion?owner='+encodeURIComponent(owner.id));
 return {service,store,a,b,chatA,chatB,wish,concern,experience,promise,foreign,requests,output,set,onRequest,material,run,reports};
}

test('material selection is owner-scoped, excludes promises, and previews independent evidence',async()=>{
 const f=await fixture(),preview=await f.material();
 assert.deepEqual(new Set(preview.targets.map(item=>item.memory_id)),new Set([f.wish.id,f.concern.id]));
 assert.deepEqual(preview.experiences.map(item=>item.memory_id),[f.experience.id]);
 assert.ok(!preview.inputs.some(item=>item.memory_id===f.promise.id||item.memory_id===f.foreign.id));
 assert.equal(preview.can_run,true);assert.equal(preview.inputs.length,3);
 assert.ok(preview.inputs.every(item=>item.source_refs.length===1&&item.source_refs[0].source_type==='chat_message'));
 assert.equal((await f.material(f.b)).inputs.some(item=>item.memory_id===f.wish.id||item.memory_id===f.concern.id),false);
});

test('model suggestions require independent experience IDs; accept writes one version and reject leaves state unchanged',async()=>{
 const f=await fixture();
 f.set(f.output([
  {target_id:f.wish.id,action:'fulfill',reason:'已有一段明确记录的共同经历。',confidence:'high',basis_memory_ids:[f.experience.id]},
  {target_id:f.concern.id,action:'resolve',reason:'经历能回答当时是否成行。',confidence:'medium',basis_memory_ids:[f.experience.id]}
 ]));
 const report=await f.run();assert.equal(report.status,'pending');assert.equal(report.model_called,true);assert.equal(report.proposals.length,2);
 const sent=JSON.parse(f.requests.at(-1)[1].content);assert.equal(sent.targets.length,2);assert.equal(sent.experiences.length,1);assert.ok(!JSON.stringify(sent).includes('乙自己的私密经历'));
 const beforeWish=copy(f.service.data.memory.events.find(item=>item.id===f.wish.id));
 const wishProposal=report.proposals.find(item=>item.target_memory_id===f.wish.id),concernProposal=report.proposals.find(item=>item.target_memory_id===f.concern.id);
 let current=await f.service.api('/memory-digestion/'+report.id+'/decision','POST',{owner_id:f.a.id,proposal_id:wishProposal.id,decision:'accept'});
 assert.equal(current.proposals.find(item=>item.id===wishProposal.id).state,'accepted');
 let saved=f.service.data.memory.events.find(item=>item.id===f.wish.id);assert.equal(saved.cognition_state.status,'fulfilled');assert.equal(saved.cognition_state.origin,'digest');assert.equal(saved.revision,beforeWish.revision+1);const {versions,...wishSnapshot}=beforeWish;assert.deepEqual(saved.versions.at(-1),wishSnapshot);
 await f.service.api('/memory-digestion/'+report.id+'/decision','POST',{owner_id:f.a.id,proposal_id:concernProposal.id,decision:'reject'});
 saved=f.service.data.memory.events.find(item=>item.id===f.concern.id);assert.equal(saved.cognition_state,undefined);assert.equal(saved.revision,f.concern.revision);
 await f.service.api('/memory-digestion/'+report.id+'/decision','POST',{owner_id:f.a.id,proposal_id:wishProposal.id,decision:'accept'});
 assert.equal(f.service.data.memory.events.find(item=>item.id===f.wish.id).revision,beforeWish.revision+1);
 assert.equal((await f.reports(f.b)).length,0);validateBackup(await f.service.api('/backup'));
});

test('no independent experience records keep without calling the model; manual lock excludes a target',async()=>{
 const f=await fixture();
 await f.service.api('/memories/'+f.experience.id,'DELETE');
 const beforeCalls=f.requests.length,report=await f.run();assert.equal(report.model_called,false);assert.ok(report.proposals.every(item=>item.action==='keep'&&item.state==='kept'));
 assert.equal(f.requests.length,beforeCalls);assert.equal(f.service.data.memory.events.find(item=>item.id===f.wish.id).cognition_state,undefined);
 await f.service.api('/memories/'+f.wish.id,'PATCH',{owner_id:f.a.id,title:'海边期盼',content:'我一直期待去海边。',kind:'statement',room:'windowsill',active:true,participants:[f.a.id],evidence:[{message_id:f.service.data.memory.events.find(item=>item.id===f.wish.id).evidence[0].message_id,quote:'我一直想去海边。'}],cognition_status:'active',cognition_locked:true});
 const preview=await f.material();assert.ok(!preview.targets.some(item=>item.memory_id===f.wish.id));
});

test('bad actions, foreign evidence and missing target reviews fail without saving a report',async()=>{
 const f=await fixture(),base=f.output([{target_id:f.wish.id,action:'fulfill',reason:'理由',confidence:'high',basis_memory_ids:[f.experience.id]},{target_id:f.concern.id,action:'resolve',reason:'理由',confidence:'medium',basis_memory_ids:[f.experience.id]}]);
 const invalid=[{...base,reviews:[{...base.reviews[0],target_id:f.concern.id},base.reviews[1]]},{...base,reviews:[{...base.reviews[0],action:'resolve'},base.reviews[1]]},{...base,reviews:[{...base.reviews[0],basis_memory_ids:[f.foreign.id]},base.reviews[1]]},{...base,reviews:[base.reviews[0]]}];
 for(const result of invalid){f.set(result);await assert.rejects(f.run());assert.equal((await f.reports()).length,0);}
});

test('concurrent identical requests share one model run; material changes during generation abort persistence',async()=>{
 const f=await fixture();f.set(f.output([{target_id:f.wish.id,action:'fulfill',reason:'已有经历。',confidence:'high',basis_memory_ids:[f.experience.id]},{target_id:f.concern.id,action:'resolve',reason:'已有经历。',confidence:'medium',basis_memory_ids:[f.experience.id]}]));
 let started,release;const begun=new Promise(resolve=>started=resolve);f.onRequest(async()=>{started();await new Promise(resolve=>release=resolve);});
 const first=f.run();await begun;const second=f.run();release();const [one,two]=await Promise.all([first,second]);assert.equal(one.id,two.id);assert.equal(f.requests.length,4); // three seed chats and exactly one digestion request
 const g=await fixture();g.set(g.output([{target_id:g.wish.id,action:'fulfill',reason:'已有经历。',confidence:'high',basis_memory_ids:[g.experience.id]},{target_id:g.concern.id,action:'resolve',reason:'已有经历。',confidence:'medium',basis_memory_ids:[g.experience.id]}]));
 g.store.plugin={beginWrite:true};let changed=false;g.onRequest(async()=>{const other=await new LocalService(g.store,async()=>{}).init();await other.api('/memories/'+g.experience.id,'PATCH',{active:false});changed=true;});
 await assert.rejects(g.run(),/材料已变化/);assert.equal(changed,true);assert.equal((await g.reports()).length,0);
});

test('changed evidence makes a pending suggestion stale; a failed write rolls back report and state',async()=>{
 const f=await fixture();f.set(f.output([{target_id:f.wish.id,action:'fulfill',reason:'已有经历。',confidence:'high',basis_memory_ids:[f.experience.id]},{target_id:f.concern.id,action:'resolve',reason:'已有经历。',confidence:'medium',basis_memory_ids:[f.experience.id]}]));
 const report=await f.run(),proposal=report.proposals.find(item=>item.target_memory_id===f.wish.id);
 await f.service.api('/memories/'+f.experience.id,'PATCH',{active:false});
 let current=(await f.reports())[0];assert.equal(current.proposals.find(item=>item.id===proposal.id).stale,true);
 current=await f.service.api('/memory-digestion/'+report.id+'/decision','POST',{owner_id:f.a.id,proposal_id:proposal.id,decision:'accept'});
 assert.equal(current.proposals.find(item=>item.id===proposal.id).state,'stale');assert.equal(f.service.data.memory.events.find(item=>item.id===f.wish.id).cognition_state,undefined);
 const g=await fixture();g.set(g.output([{target_id:g.wish.id,action:'fulfill',reason:'已有经历。',confidence:'high',basis_memory_ids:[g.experience.id]},{target_id:g.concern.id,action:'resolve',reason:'已有经历。',confidence:'medium',basis_memory_ids:[g.experience.id]}]));g.store.fail=true;
 await assert.rejects(g.run(),/disk full/);assert.equal((await g.reports()).length,0);assert.equal(g.service.data.memory.events.find(item=>item.id===g.wish.id).cognition_state,undefined);
});

test('source deletion removes dependent reports; legacy backups gain an empty report list',async()=>{
 const f=await fixture();f.set(f.output([{target_id:f.wish.id,action:'fulfill',reason:'已有经历。',confidence:'high',basis_memory_ids:[f.experience.id]},{target_id:f.concern.id,action:'resolve',reason:'已有经历。',confidence:'medium',basis_memory_ids:[f.experience.id]}]));
 await f.run();const sourceId=f.service.data.memory.events.find(item=>item.id===f.experience.id).evidence[0].message_id;
 await f.service.transact(data=>removeSourceMemories(data,[sourceId],[]));assert.equal(f.service.data.memory.digest_reports.length,0);assert.equal(f.service.data.memory.events.some(item=>item.id===f.experience.id),false);
 const legacy=await f.service.api('/backup');delete legacy.memory.digest_reports;assert.deepEqual(validateBackup(legacy).memory.digest_reports,[]);
});
