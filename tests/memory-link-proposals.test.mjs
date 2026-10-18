import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {recallPlan} from '../frontend/memory-core.js';

async function fixture(){
 const store={value:emptyData(),fail:false,async load(){return structuredClone(this.value);},async save(d){if(this.fail)throw Error('disk full');this.value=structuredClone(d);},async hasKey(){return false;}};
 let output='收到',beforeReply=async()=>{},requests=[];
 const s=await new LocalService(store,async(config,key,m,delta)=>{requests.push({model:config.model,messages:m});await beforeReply();delta(typeof output==='string'?output:JSON.stringify(output));}).init();
 const a=await s.api('/characters','POST',{name:'甲',identity:'重视诚实',style:'',avatar:''}),b=await s.api('/characters','POST',{name:'乙',identity:'',style:'',avatar:''});
 await s.api('/settings','PATCH',{model:'mock'});const chat=await s.api('/contacts','POST',{character_id:a.id});
 for(const [n,word]of ['orchid','parcel'].entries()){
  await s.stream(chat.id,word,'seed'+n,()=>{});
  await s.api('/memories','POST',{owner_id:a.id,title:word,content:word,kind:'statement',evidence:[{message_id:n*2+1,quote:word}]});
 }
 await s.api('/self','POST',{owner_id:a.id,label:'诚实',interpretation:'如实表达',quote:'重视诚实'});
 const [one,two]=s.data.memory.events,anchor=s.data.memory.anchors[0];
 const ref=n=>({kind:n===anchor?'anchor':'memory',id:n.id});
 const refs=[ref(one),ref(two),ref(anchor)];
 const proposal=(to=two)=>({from:ref(one),to:ref(to),type:to===anchor?'supports':'supplements',reason:'候选解释，需要人工确认',proof:[{...ref(one),message_id:1,quote:'orchid'},to===anchor?{...ref(anchor),quote:'诚实'}:{...ref(two),message_id:3,quote:'parcel'}]});
 const generate=()=>s.api('/memory-link-proposals/generate','POST',{owner_id:a.id,refs});
 const list=(owner=a.id)=>s.api('/memory-link-proposals?owner='+owner);
 return {s,store,a,b,one,two,anchor,refs,proposal,generate,list,set:v=>{output=v;},hook:fn=>{beforeReply=fn;},requests};
}

test('pending candidates retain verbatim proof but never influence recall; review adds one directed link atomically',async()=>{
 const f=await fixture();f.set({proposals:[f.proposal(),f.proposal(f.anchor)]});
 const before=recallPlan(f.s.data,f.a.id,'orchid');
 assert.equal((await f.generate()).added,2);assert.deepEqual(recallPlan(f.s.data,f.a.id,'orchid'),before);
 let pending=await f.list();assert.equal(pending[0].status,'pending');assert.equal(f.s.data.memory.links.length,0);
 assert.equal((await f.list(f.b.id)).length,0);
 const result=await f.s.api('/memory-link-proposals/'+pending[0].id+'/accept','POST',{owner_id:f.a.id,type:'causes',note:'人工复核后的解读'});
 assert.equal(f.s.data.memory.links[0].from.id,f.one.id);assert.equal(f.s.data.memory.links[0].to.id,f.two.id);assert.equal(f.s.data.memory.links[0].note,'人工复核后的解读');
 assert.equal(f.s.data.memory.links[0].origin,'manual');assert.equal((await f.list())[0].link_id,result.link_id);
 assert.equal((await f.list())[0].reviewed_type,'causes');assert.equal((await f.list())[0].reviewed_note,'人工复核后的解读');
 assert.ok(recallPlan(f.s.data,f.a.id,'orchid').records.some(e=>e.id===f.two.id));
 await assert.rejects(f.s.api('/memory-link-proposals/'+pending[0].id+'/accept','POST',{owner_id:f.a.id}));
 const saved=validateBackup(await f.s.api('/backup'));assert.equal(saved.memory.link_proposals.length,2);
 const restarted=await new LocalService(f.store,async()=>{}).init();assert.equal(restarted.data.memory.link_proposals[0].status,'accepted');
 await f.s.api('/memory-link-proposals/'+pending[0].id+'?owner='+f.a.id,'DELETE');assert.equal(f.s.data.memory.links.length,1);
});

test('reject suppresses same revisions, owner checks prevent review and duplicates cannot overwrite manual links',async()=>{
 const f=await fixture();f.set({proposals:[f.proposal(),f.proposal()]});assert.equal((await f.generate()).added,1);
 const [p]=await f.list();
 await assert.rejects(f.s.api('/memory-link-proposals/'+p.id+'/accept','POST',{owner_id:f.b.id}));
 await assert.rejects(f.s.api('/memory-link-proposals/'+p.id+'?owner='+f.b.id,'DELETE'));
 await f.s.api('/memory-link-proposals/'+p.id+'/reject','POST',{owner_id:f.a.id});assert.equal((await f.generate()).added,0);
 assert.equal(f.s.data.memory.links.length,0);
 await f.s.api('/memory-link-proposals/'+p.id+'?owner='+f.a.id,'DELETE');assert.equal((await f.generate()).added,1);
 const [fresh]=await f.list();await f.s.api('/memory-links','POST',{owner_id:f.a.id,...f.proposal(),note:'人工已有的说明'});
 await assert.rejects(f.s.api('/memory-link-proposals/'+fresh.id+'/accept','POST',{owner_id:f.a.id}));
 assert.equal(f.s.data.memory.links[0].note,'人工已有的说明');
});

test('invented or one-sided quotes, foreign/unselected nodes, bad routes and oversized batches fail without saving',async()=>{
 const f=await fixture(),good=f.proposal();
 const bad=[{...good,proof:[good.proof[0],{...good.proof[1],quote:'不存在的原话'}]}, {...good,proof:[good.proof[0],good.proof[0]]},{...good,to:{kind:'memory',id:'foreign'}},{...good,type:'friendship'},{...good,reason:''}];
 for(const p of bad){f.set({proposals:[p]});await assert.rejects(f.generate());assert.equal((await f.list()).length,0);}
 f.set({proposals:Array(9).fill(good)});await assert.rejects(f.generate());
 f.set({proposals:[f.proposal(f.anchor)]});await assert.rejects(f.s.api('/memory-link-proposals/generate','POST',{owner_id:f.a.id,refs:f.refs.slice(0,2)}));
 const count=f.requests.length;await assert.rejects(f.s.api('/memory-link-proposals/generate','GET'));assert.equal(f.requests.length,count);
 await assert.rejects(f.s.api('/memory-link-proposals/generate','POST',{owner_id:f.a.id,refs:[f.refs[0]]}));assert.equal(f.requests.length,count);
 const legacy=await f.s.api('/backup');delete legacy.memory.link_proposals;assert.deepEqual(validateBackup(legacy).memory.link_proposals,[]);
});

test('stale endpoints and roster changes block confirmation; deleting endpoints cleans candidates atomically',async()=>{
 const f=await fixture();f.set({proposals:[f.proposal(),f.proposal(f.anchor)]});await f.generate();const [p,tag]=await f.list();
 await f.s.api('/memories/'+f.two.id,'PATCH',{active:false});assert.equal((await f.list())[0].stale,true);
 await assert.rejects(f.s.api('/memory-link-proposals/'+p.id+'/accept','POST',{owner_id:f.a.id}));
 await f.s.api('/characters/'+f.a.id,'PUT',{name:'甲',identity:'重视诚实，也重视耐心',style:'',avatar:''});assert.equal((await f.list())[1].stale,true);
 await assert.rejects(f.s.api('/memory-link-proposals/'+tag.id+'/accept','POST',{owner_id:f.a.id}));
 await f.s.api('/memories/'+f.one.id,'DELETE');assert.equal((await f.list()).length,0);
});

test('save failure rolls back generation and accept; generation rechecks selected snapshots after async model',async()=>{
 const f=await fixture();f.set({proposals:[f.proposal()]});f.store.fail=true;await assert.rejects(f.generate());assert.equal((await f.list()).length,0);
 f.store.fail=false;await f.generate();const [p]=await f.list();f.store.fail=true;
 await assert.rejects(f.s.api('/memory-link-proposals/'+p.id+'/accept','POST',{owner_id:f.a.id}));assert.equal(f.s.data.memory.links.length,0);assert.equal((await f.list())[0].status,'pending');
 f.store.fail=false;
 f.hook(async()=>{await f.s.transact(d=>{d.memory.events.find(e=>e.id===f.two.id).revision++;});});
 await assert.rejects(f.generate());assert.equal((await f.list()).length,1);
});

test('dedicated memory connection receives only selected material; cancellation does not save partial proposals',async()=>{
 const f=await fixture();
 const profile=await f.s.api('/model-profiles','POST',{name:'独立整理',base_url:'https://memory.example/v1',model:'memory-mock',protocol:'openai-chat',api_key:''});
 const profiles=await f.s.api('/model-profiles');const id=profiles.find(p=>p.name==='独立整理').id;
 await f.s.api('/memory-settings','PATCH',{profile_id:id});
 f.set({proposals:[f.proposal()]});await f.s.api('/memory-link-proposals/generate','POST',{owner_id:f.a.id,refs:f.refs.slice(0,2)});
 const request=f.requests.at(-1);assert.equal(request.model,'memory-mock');
 const materials=JSON.parse(request.messages[1].content);assert.equal(materials.length,2);assert.ok(!request.messages[1].content.includes('重视诚实'));
 let started;const running=new Promise(resolve=>started=resolve);
 f.s.transport=async(c,k,m,delta,signal)=>{delta('{"proposals":[');started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));};
 const task=f.generate();await running;f.s.cancel();await assert.rejects(task);assert.equal((await f.list()).length,1);assert.equal(f.s.data.memory.links.length,0);
});

test('malformed candidate backups are rejected atomically and source material limit is checked before model work',async()=>{
 const f=await fixture();f.set({proposals:[f.proposal()]});await f.generate();
 for(const mutate of [d=>{d.memory.link_proposals[0].owner_id=f.b.id;},d=>{d.memory.link_proposals[0].proof[0].quote='伪造引用';},d=>{d.memory.link_proposals[0].status='accepted';}]){
  const before=await f.s.api('/backup'),bad=structuredClone(before);mutate(bad);assert.throws(()=>validateBackup(bad));
  await assert.rejects(f.s.api('/backup/restore','POST',bad));assert.deepEqual(await f.s.api('/backup'),before);
 }
 const refs=[];
 for(let i=0;i<9;i++){
  await f.s.api('/memories','POST',{owner_id:f.a.id,title:'长材料'+i,content:'长'.repeat(6000),kind:'statement',evidence:[{message_id:1,quote:'orchid'}]});
  refs.push({kind:'memory',id:f.s.data.memory.events.at(-1).id});
 }
 const count=f.requests.length;await assert.rejects(f.s.api('/memory-link-proposals/generate','POST',{owner_id:f.a.id,refs}));assert.equal(f.requests.length,count);
});
