import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {resolvedGarment,ensureAdaptation,wearGarment,adaptationDrawingChange} from '../frontend/outfit-adaptation.js';
import {emptyOutfits,validateOutfits,outfitDrawingChange} from '../frontend/outfit-catalog.js';
import {blankProject} from '../frontend/outfit-image.js';
import {WALK_TEMPLATE} from '../frontend/outfit-motion.js';
const clone=v=>JSON.parse(JSON.stringify(v)),path='/character-looks/user/workshop';
const source=(id,kind)=>{const project=blankProject();project.frames.fill('0'.repeat(50*64+30)+'2'+'0'.repeat(6144-50*64-31));return {id,name:id,kind,revision:0,template:WALK_TEMPLATE.id,ready:[true,true,true,true],project};};
async function fixture(){let saved=emptyData(),fail=false;const storage={load:async()=>clone(saved),save:async d=>{if(fail)throw Error('synthetic disk full');saved=clone(d);},hasKey:async()=>false};const s=await new LocalService(storage,()=>{throw Error('No model allowed');}).init();await s.transact(d=>d.characters.push({id:'a',name:'合成人物',identity:'',style:'',avatar:''}));return {s,storage,read:()=>clone(saved),fail:v=>{fail=v;}};}
async function seed(s){const c=emptyOutfits();c.assets=[source('body','body'),source('shirt','top')];c.people={user:{body:'body',height:80,wear:[{asset:'shirt',fit:{x:0,y:0,scale:1}}]},a:{body:'body',height:64,wear:[{asset:'shirt',fit:{x:1,y:0,scale:1}}]}};return s.api(path,'PUT',{expected_revision:0,catalog:c});}
test('standing edits propagate default poses but preserve independently drawn steps',()=>{
 const c=emptyOutfits();c.assets=[source('body','body')];c.assets[0].project.frames[2]='3'+'0'.repeat(6143);const project=clone(c.assets[0].project);project.frames[1]='4'+'0'.repeat(6143);
 const draft=outfitDrawingChange(c,'body','PATCH',{expected_revision:0,project});assert.deepEqual(draft.assets[0].project,c.assets[0].project);
 const next=outfitDrawingChange(draft,'body','POST',{expected_revision:0,project});assert.equal(next.assets[0].project.frames[0],project.frames[1]);assert.equal(next.assets[0].project.frames[2],c.assets[0].project.frames[2]);assert.notEqual(c.assets[0].project.frames[0],project.frames[1]);
});
test('shared clothing and per-person fit persist, restart and backup without duplicating source',async()=>{
 const f=await fixture(),c=await seed(f.s);assert.equal(c.assets.length,2);const n=clone(c);n.people.a.wear[0].fit.x=4;await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:n});
 const restarted=await new LocalService(f.storage).init(),read=await restarted.api(path);assert.equal(read.people.a.wear[0].fit.x,4);assert.equal(read.people.user.wear[0].fit.x,0);assert.equal(read.assets.length,2);assert.deepEqual(validateBackup(f.read()).outfit_catalog,read);
});
test('CAS, duplicate retry, disk failure and draft recovery preserve applied assets',async()=>{
 const f=await fixture(),c=await seed(f.s),n=clone(c);n.assets[1].draft=blankProject();n.assets[1].draft.frames[1]='2'+'0'.repeat(6143);
 const result=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:n});assert.equal(result.assets[1].project.frames[1][0],'0');
 const duplicate=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:n});assert.equal(duplicate.revision,result.revision);
 const conflict=clone(c);conflict.people.a.height=70;await assert.rejects(f.s.api(path,'PUT',{expected_revision:c.revision,catalog:conflict}),/别处修改/);
 f.fail(true);const failed=clone(result);failed.people.a.height=72;await assert.rejects(f.s.api(path,'PUT',{expected_revision:result.revision,catalog:failed}),/disk full/);assert.deepEqual(await f.s.api(path),result);f.fail(false);
 const restored=await new LocalService(f.storage).init();assert.equal((await restored.api(path)).assets[1].draft.frames[1][0],'2');
});
test('invalid owners, missing referenced materials, duplicate slots and invalid fit are rejected',async()=>{
 const {s}=await fixture(),c=await seed(s);for(const mutate of [n=>delete n.assets[0],n=>n.assets.splice(1,1),n=>n.people.unknown=n.people.a,n=>n.people.a.wear.push(clone(n.people.a.wear[0])),n=>delete n.people.a.height,n=>n.people.a.wear[0].fit.scale=NaN]){const n=clone(c);mutate(n);assert.throws(()=>validateOutfits(n,new Set(['user','a'])));}
});
test('world apply preserves old skins, blocks missing directions and checks saved revision',async()=>{
 const {s}=await fixture(),c=await seed(s),sprite={image:'data:image/png;base64,AAAA',frames:3,row_count:4,idle_frame:1,rows:{down:0,left:1,right:2,up:3},walk_order:[1,0,1,2]};
 await s.api('/character-looks/a','PATCH',{skins:[{id:'old',name:'旧衣服',skin:1,portraits:[],portrait:0,sprite:null}]});
 await s.api('/character-looks/user/workshop-apply','POST',{owner:'a',expected_revision:c.revision,sprite});const look=await s.api('/character-looks/a');assert.equal(look.active_skin_id,'modular_outfit');assert.equal(look.skins.length,2);assert.equal(look.skins[0].id,'old');
 await assert.rejects(s.api('/character-looks/user/workshop-apply','POST',{owner:'a',expected_revision:0,sprite}),/已改变/);
 const n=clone(c);n.assets[1].ready[3]=false;let latest=await s.api(path,'PUT',{expected_revision:c.revision,catalog:n});const reset=clone(latest);delete reset.people.a.adaptations;latest=await s.api(path,'PUT',{expected_revision:latest.revision,catalog:reset});await assert.rejects(s.api('/character-looks/user/workshop-apply','POST',{owner:'a',expected_revision:latest.revision,sprite}),/四个方向/);
});

test('shared original versions and wearer paintings survive source edits, removal, restart and backup',async()=>{
 const f=await fixture();let c=await seed(f.s),next=clone(c);
 for(const p of Object.values(next.people))ensureAdaptation(p,next.assets[1]);
 c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});
 const picture=clone(c.assets[1].project);picture.frames[1]='3'+picture.frames[1].slice(1);
 next=adaptationDrawingChange(c,'a','shirt','POST',{expected_revision:c.revision,project:picture});
 c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});
 assert.equal(c.assets[1].project.frames[1][0],'0');assert.equal(resolvedGarment(c.assets[1],c.people.a).project.frames[1][0],'3');assert.equal(resolvedGarment(c.assets[1],c.people.user).project.frames[1][0],'0');
 next=clone(c);next.assets[1].project.frames.fill('4'+'0'.repeat(6143));
 const request={expected_revision:c.revision,catalog:next,request_id:'synthetic_original_update'};
 c=await f.s.api(path,'PUT',request);assert.deepEqual(await f.s.api(path,'PUT',request),c);
 assert.equal(c.assets[1].editions.length,1);assert.equal(c.assets[1].project.frames[1][0],'4');assert.equal(resolvedGarment(c.assets[1],c.people.user).project.frames[1][0],'0');assert.equal(resolvedGarment(c.assets[1],c.people.a).project.frames[1][0],'3');
 next=clone(c);next.people.a.wear=[];c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});
 next=clone(c);wearGarment(next.people.a,next.assets[1]);c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});assert.equal(c.people.a.wear[0].fit.x,1);assert.equal(resolvedGarment(c.assets[1],c.people.a).project.frames[1][0],'3');
 const restarted=await new LocalService(f.storage).init();assert.deepEqual(await restarted.api(path),c);assert.deepEqual(validateBackup(f.read()).outfit_catalog,c);
 // Adopt latest on one wearer; the other keeps their original version.
 next=clone(c);delete next.people.a.adaptations.shirt;ensureAdaptation(next.people.a,next.assets[1]);
 c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});assert.equal(resolvedGarment(c.assets[1],c.people.a).project.frames[1][0],'4');assert.equal(resolvedGarment(c.assets[1],c.people.user).project.frames[1][0],'0');
});
test('adaptation drafts, concurrent writes and persistence failures do not leak between people',async()=>{
 const f=await fixture();let c=await seed(f.s);const picture=clone(c.assets[1].project);picture.frames[1]='5'+picture.frames[1].slice(1);
 const next=adaptationDrawingChange(c,'a','shirt','PATCH',{expected_revision:c.revision,project:picture});
 f.fail(true);await assert.rejects(f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next}),/disk full/);assert.deepEqual(await f.s.api(path),c);f.fail(false);
 c=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:next});const restarted=await new LocalService(f.storage).init(),read=await restarted.api(path);assert.equal(read.people.a.adaptations.shirt.draft.frames[1][0],'5');assert.equal(resolvedGarment(read.assets[1],read.people.a).project.frames[1][0],'0');assert.equal(read.people.user.adaptations,undefined);
 const updates=[1,2].map(x=>{const n=clone(c);n.people.a.height=64+x;return f.s.api(path,'PUT',{expected_revision:c.revision,catalog:n});});const results=await Promise.allSettled(updates);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
test('sets reuse references and reject duplicate slots, missing originals and invalid adaptation revisions',async()=>{
 const f=await fixture(),c=await seed(f.s),owners=new Set(['user','a']);let n=clone(c);n.sets=[{id:'daily',name:'日常装',assets:['shirt']}];validateOutfits(n,owners);const saved=await f.s.api(path,'PUT',{expected_revision:c.revision,catalog:n});assert.equal(saved.assets.length,2);
 for(const mutate of [n=>n.sets[0].assets.push('shirt'),n=>n.sets[0].assets=['missing'],n=>{ensureAdaptation(n.people.a,n.assets[1]).revision=999;},n=>{ensureAdaptation(n.people.a,n.assets[1]).project=blankProject();}]){n=clone(saved);mutate(n);assert.throws(()=>validateOutfits(n,owners));}
});
