import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,buildContext,validateBackup} from '../frontend/local-service.js';
import {copy,recall,rosterSource,dayKey} from '../frontend/memory-core.js';
async function fixture(){
 const store={value:emptyData(),keys:{},fail:false,async load(){return copy(this.value);},async save(v){if(this.fail)throw Error('disk full');this.value=copy(v);},async hasKey(id){return !!this.keys[id];},async setKey(v,id){this.keys[id]=v;},async getKey(id){return this.keys[id]||'';}};
 let result='好的';const calls=[];const service=await new LocalService(store,async(s,key,messages,delta,signal)=>{calls.push({s,key,messages});if(signal.aborted)throw Error('abort');delta(typeof result==='string'?result:JSON.stringify(result));}).init();
 const a=await service.api('/characters','POST',{name:'林',identity:'来自山间，重视诚实',style:'简短',avatar:''}),b=await service.api('/characters','POST',{name:'雨',identity:'',style:'',avatar:''});const chat=await service.api('/contacts','POST',{character_id:a.id});await service.api('/settings','PATCH',{model:'mock',api_key:'fixture-only'});
 await service.stream(chat.id,'我喜欢山间散步','first',()=>{});await service.transact(d=>{for(const m of d.messages)m.created_at='2026-01-01T17:00:00Z';});
 const event={owner_id:a.id,title:'山间散步',content:'用户说喜欢山间散步',kind:'statement',evidence:[{message_id:1,quote:'我喜欢山间散步'}],participants:[a.id,b.id]};
 return {service,store,a,b,chat,calls,event,set:v=>result=v};
}
test('evidence enforces verbatim completed owner sources; links do not share knowledge; pause and budget affect actual context',async()=>{
 const {service,a,b,chat,event}=await fixture();await service.api('/memories','POST',event);
 assert.equal(recall(service.data,a.id,'山间散步')[0].evidence[0].role,'user');assert.equal(recall(service.data,b.id,'山间散步').length,0);
 assert.match(buildContext(service.data,chat.id,'山间散步')[0].content,/Historical memory/);
 await assert.rejects(service.api('/memories','POST',{...event,evidence:[{message_id:1,quote:'不存在的原话'}]}),/来源/);
 await assert.rejects(service.api('/memories','POST',{...event,owner_id:b.id}),/来源/);
 const id=service.data.memory.events[0].id;await service.api('/memories/'+id,'PATCH',{active:false});assert.equal(recall(service.data,a.id,'山间散步').length,0);
 await service.api('/memories/'+id,'PATCH',{active:true});await service.api('/memory-settings','PATCH',{recall:false});assert.equal(recall(service.data,a.id,'山间散步').length,0);
});
test('model extraction validates all candidates before commit, deduplicates, advances only after durable save',async()=>{
 const {service,store,a,event,set}=await fixture();const extract=()=>service.api('/memories/extract','POST',{owner_id:a.id});
 set({memories:[event,{...event,evidence:[{message_id:1,quote:'fabrication'}]}]});await assert.rejects(extract(),/来源/);assert.equal(service.data.memory.events.length,0);assert.deepEqual(service.data.memory.watermarks,{});
 set({memories:[event]});store.fail=true;await assert.rejects(extract(),/disk full/);assert.equal(service.data.memory.events.length,0);assert.deepEqual(service.data.memory.watermarks,{});
 store.fail=false;await extract();assert.equal(service.data.memory.events.length,1);assert.equal(store.value.memory.watermarks[a.id],2);await assert.rejects(extract(),/没有可整理/);
 await service.api('/memories/extract','POST',{owner_id:a.id,day:'2026-01-02'});assert.equal(service.data.memory.events.length,1);
});
test('daily summary uses timezone raw sources; editing/rewriting keeps versions; deletion leaves messages',async()=>{
 assert.equal(dayKey('2026-01-01T17:00:00'),'2026-01-02');assert.equal(dayKey('2026-01-02T01:00:00+08:00'),'2026-01-02');
 const {service,a,set,calls}=await fixture();const generate=()=>service.api('/summaries/generate','POST',{owner_id:a.id,day:'2026-01-02'});set({summary:'讨论散步'});await generate();
 let cards=await service.api('/summaries?owner='+a.id);assert.deepEqual(cards[0].source_ids,[1,2]);await service.api('/summaries','PATCH',{owner_id:a.id,day:'2026-01-02',content:'人工编辑内容'});
 set({summary:'重新总结'});await generate();assert.ok(!calls.at(-1).messages[1].content.includes('人工编辑内容'));cards=await service.api('/summaries?owner='+a.id);assert.equal(cards[0].versions.length,2);assert.equal(cards[0].versions[1].content,'人工编辑内容');
 await service.api('/summaries','DELETE',{owner_id:a.id,day:'2026-01-02'});assert.equal(service.data.messages.length,2);assert.equal(service.data.memory.summaries.length,0);
});
test('self analysis cites roster, preserves manual anchors and never edits identity; same-label regeneration retains version',async()=>{
 const {service,a,set}=await fixture();const initial=copy(service.data.characters),analyze=()=>service.api('/self/analyze','POST',{owner_id:a.id});
 set({anchors:[{label:'诚实',interpretation:'重视如实表达',quote:'重视诚实',basis:'explicit'}]});await analyze();await analyze();assert.equal(service.data.memory.anchors[0].versions.length,1);
 const id=service.data.memory.anchors[0].id;await service.api('/self/'+id,'PATCH',{label:'诚实',interpretation:'人工解读',quote:'重视诚实'});await analyze();assert.equal(service.data.memory.anchors[0].interpretation,'人工解读');assert.equal(service.data.memory.anchors.length,1);assert.deepEqual(service.data.characters,initial);
 set({anchors:[{label:'童年',interpretation:'猜测',quote:'虚构童年',basis:'interpretation'}]});await assert.rejects(analyze(),/原文/);assert.equal(service.data.memory.anchors[0].origin,'manual');
 service.data.characters[0].identity+='，现在喜欢音乐';assert.equal((await service.api('/self?owner='+a.id))[0].stale,true);
});
test('memory profile uses its own credential without switching active model; backup roundtrip preserves network without keys',async()=>{
 const {service,store,a,set,calls,event}=await fixture();await service.api('/model-profiles','POST',{name:'整理专用',base_url:'https://memory.example/v1',model:'memory-model',protocol:'openai-chat',api_key:'second-fixture'});const profile=service.data.api_profiles.at(-1),active=service.data.active_profile_id;await service.api('/memory-settings','PATCH',{profile_id:profile.id});set({memories:[event]});await service.api('/memories/extract','POST',{owner_id:a.id});assert.equal(calls.at(-1).s.model,'memory-model');assert.equal(calls.at(-1).key,'second-fixture');assert.equal(service.data.active_profile_id,active);
 const backup=await service.api('/backup');assert.ok(!JSON.stringify(backup).includes('second-fixture'));validateBackup(backup);const recovered=await new LocalService(store,async()=>{}).init();assert.equal(recovered.data.memory.events.length,1);
 const bad=copy(backup);bad.memory.events[0].evidence[0].message_id=999;assert.throws(()=>validateBackup(bad),/来源/);
 const duplicate=copy(backup);duplicate.memory.events.push(copy(duplicate.memory.events[0]));assert.throws(()=>validateBackup(duplicate),/标识/);
});
test('manual save failure restores memory; invalid settings roll back; raw messages remain intact',async()=>{
 const {service,store,event}=await fixture();store.fail=true;await assert.rejects(service.api('/memories','POST',event),/disk full/);assert.equal(service.data.memory.events.length,0);store.fail=false;
 await assert.rejects(service.api('/memory-settings','PATCH',{recall_limit:0}),/范围/);assert.equal(service.data.memory.settings.recall_limit,4);assert.equal(service.data.messages.length,2);
});
test('new chat cancels auxiliary generation and never stores partial JSON or advances watermark',async()=>{
 const {service,a,chat}=await fixture();let started;const ready=new Promise(r=>started=r);service.transport=async(s,k,m,delta,signal)=>{if(m[0].content.includes('记忆整理器')){started();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('abort');}delta('新的回复');};
 const extraction=service.api('/memories/extract','POST',{owner_id:a.id});const rejected=assert.rejects(extraction,/停止/);await ready;await service.stream(chat.id,'继续聊天','second',()=>{});await rejected;assert.equal(service.data.memory.events.length,0);assert.deepEqual(service.data.memory.watermarks,{});assert.equal(service.data.turns.at(-1).state,'complete');
});
test('late retry includes original user message in pending extraction despite a newer watermark',async()=>{
 const {service,a,chat}=await fixture();service.data.memory.watermarks[a.id]=2;service.data.messages.push({id:3,session_id:chat.id,role:'assistant',content:'重试回复',created_at:'2026-01-01T17:00:00Z'});service.data.turns[0].assistant_id=3;assert.deepEqual(service.memoryModule.pending(a.id).map(m=>m.id),[1,3]);
 assert.ok(rosterSource(a).includes('重视诚实'));
});

test('repaired extraction still enforces source evidence; recall uses source terms and respects material budget',async()=>{
 const {service,a,event,set}=await fixture();
 set('<think>整理原话</think>\n结果如下：{memories: ['+JSON.stringify({...event,title:'日常偏好',content:'用户提到一种活动'})+',],}');
 await service.api('/memories/extract','POST',{owner_id:a.id});const found=recall(service.data,a.id,'山间散步');assert.equal(found.length,1);assert.ok(found[0].matched_terms.includes('散步'));
 const id=service.data.memory.events[0].id;await service.api('/memories/'+id,'PATCH',{...event,content:'很长的记忆'.repeat(500)});await service.api('/memory-settings','PATCH',{budget:500});assert.equal(recall(service.data,a.id,'山间散步').length,0);
 set('说明：{memories:['+JSON.stringify({...event,evidence:[{message_id:1,quote:'编造的引用'}]})+',]}');await assert.rejects(service.api('/memories/extract','POST',{owner_id:a.id,day:'2026-01-02'}),/来源/);assert.equal(service.data.memory.events.length,1);
});
