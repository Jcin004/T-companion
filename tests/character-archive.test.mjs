import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalService,emptyData,validateBackup,buildContext} from '../frontend/local-service.js';
import {lookFor,presentationOptions} from '../frontend/character-looks.js';
const copy=x=>JSON.parse(JSON.stringify(x)),image='data:image/png;base64,AAAA',other='data:image/png;base64,BBBB';
async function fixture(){
 let durable=emptyData(),failure=false;
 const storage={load:async()=>copy(durable),save:async d=>{if(failure)throw Error('synthetic disk failure');durable=copy(d);},hasKey:async()=>false};
 const s=await new LocalService(storage,async()=>{throw Error('No provider expected');}).init();
 for(const id of ['a','b'])await s.api('/characters','POST',{id,name:id,identity:'合成人物',style:''});
 // Character creation intentionally owns its own generated ID.
 const [a,b]=s.data.characters.map(c=>c.id);
 const add=(id='picture_one',picture=image)=>s.api('/character-archive/'+a,'POST',{id,name:'参考表情',image:picture,filename:'synthetic.png'});
 return {s,a,b,add,fail:v=>failure=v,restart:()=>new LocalService(storage,async()=>{}).init()};
}
test('archive upload retries, rename and restart retain stable IDs, provenance and owner isolation',async()=>{
 const {s,a,b,add,restart}=await fixture();const first=await add();await add();assert.equal((await s.api('/character-archive/'+a)).length,1);
 await s.api('/character-archive/'+a+'/'+first.id,'PATCH',{name:'新名字'});
 const again=await restart(),rows=await again.api('/character-archive/'+a);assert.equal(rows[0].id,first.id);assert.equal(rows[0].created_at,first.created_at);assert.equal(rows[0].name,'新名字');assert.deepEqual(rows[0].source,{type:'upload',filename:'synthetic.png'});
 assert.deepEqual(await s.api('/character-archive/'+b),[]);await assert.rejects(s.api('/character-archive/'+b+'/'+first.id,'PATCH',{name:'越权'}),/不存在/);
 await assert.rejects(add(first.id,other),/标识/);assert.equal((await s.api('/character-archive/'+a)).length,1);
});
test('legacy migration is transactional, deduplicates within owner, and keeps existing skin pictures',async()=>{
 const {s,a,b,restart,fail}=await fixture();for(const id of [a,b])await s.api('/character-looks/'+id,'PATCH',{portraits:[{name:'笑',image,emotion:'happy'},{name:'平静',image,emotion:'neutral'}]});
 const original=copy(s.data);fail(true);await assert.rejects(s.api('/character-archive/'+a),/disk failure/);assert.deepEqual(s.data,original);fail(false);
 const rows=await s.api('/character-archive/'+a);assert.equal(rows.length,1);assert.equal(rows[0].references.length,2);assert.equal(rows[0].source.type,'legacy_portrait');assert.equal(lookFor(s.data,a).portraits[0].image,image);
 const otherOwner=await s.api('/character-archive/'+b);assert.notEqual(otherOwner[0].id,rows[0].id);assert.equal((await restart()).data.character_archive.items.length,2);assert.deepEqual(s.data.characters,original.characters);
});
test('expression binding uses own saved asset; labels can change without changing expression ID',async()=>{
 const {s,a,b,add,restart}=await fixture();const asset=await add();
 const binding={asset_id:asset.id,skin_id:'default',emotion:'expression_proud',expression_name:'得意'};
 await s.api('/character-looks/'+a+'/archive-binding','POST',binding);await s.api('/character-looks/'+a+'/archive-binding','POST',binding);
 assert.equal(lookFor(s.data,a).portraits.length,1);assert.equal(lookFor(s.data,a).portraits[0].asset_id,asset.id);
 await s.api('/character-looks/'+a+'/archive-binding','POST',{...binding,expression_name:'小得意'});
 assert.equal(presentationOptions(s.data,a).expression_names.expression_proud,'小得意');assert.ok(presentationOptions(s.data,a).expressions.includes(binding.emotion));assert.ok(!presentationOptions(s.data,b).expressions.includes(binding.emotion));
 await assert.rejects(s.api('/character-looks/'+b+'/archive-binding','POST',binding),/不属于/);
 assert.deepEqual((await restart()).data.character_looks,s.data.character_looks);
 const chat=await s.api('/contacts','POST',{character_id:a});const context=JSON.stringify(buildContext(s.data,chat.id,'你好'));assert.ok(!context.includes(image));assert.ok(!context.includes('picture_one'));
 const backup=await s.api('/backup');assert.deepEqual(validateBackup(backup).character_archive,backup.character_archive);
 await s.api('/backup/restore','POST',backup);assert.deepEqual((await restart()).data.character_archive,backup.character_archive);
 const wrong=copy(backup);wrong.character_archive.items[0].owner_id=b;assert.throws(()=>validateBackup(wrong),/引用无效/);
 const missing=copy(backup);delete missing.character_archive;assert.throws(()=>validateBackup(missing),/缺少档案/);
});
test('referenced images require unbinding; deletion and binding failures preserve durable data',async()=>{
 const {s,a,add,fail}=await fixture();const asset=await add(),path='/character-looks/'+a+'/archive-binding',binding={asset_id:asset.id,skin_id:'default',emotion:'happy'};
 fail(true);await assert.rejects(s.api(path,'POST',binding),/disk failure/);assert.equal(lookFor(s.data,a).portraits.length,0);fail(false);await s.api(path,'POST',binding);
 await assert.rejects(s.api('/character-archive/'+a+'/'+asset.id,'DELETE'),/仍用于/);assert.equal((await s.api('/character-archive/'+a)).length,1);
 const second=await add('picture_two',other);await assert.rejects(s.api(path,'POST',{...binding,asset_id:second.id}),/别处修改/);
 await s.api(path,'DELETE',binding);await s.api(path,'DELETE',binding);assert.equal(lookFor(s.data,a).portraits.length,0);
 fail(true);await assert.rejects(s.api('/character-archive/'+a+'/'+asset.id,'DELETE'),/disk failure/);fail(false);assert.equal((await s.api('/character-archive/'+a)).length,2);
 await s.api('/character-archive/'+a+'/'+asset.id,'DELETE');assert.equal((await s.api('/character-archive/'+a)).length,1);
});
test('parallel uploads preserve each other, old wardrobe uploads enter archive and bad backups are rejected',async()=>{
 const {s,a,add}=await fixture();await Promise.all([add(),add('picture_two',other)]);assert.equal((await s.api('/character-archive/'+a)).length,2);
 await s.api('/character-looks/'+a,'PATCH',{portraits:[{name:'上传',image,emotion:'sad'}]});assert.equal((await s.api('/character-archive/'+a)).length,2);assert.equal(lookFor(s.data,a).portraits[0].asset_id,'picture_one');
 const backup=await s.api('/backup');backup.character_archive.items[0].source.type='generated';assert.throws(()=>validateBackup(backup),/来源/);
 await assert.rejects(s.api('/character-looks/'+a,'PATCH',{portraits:[{name:'伪造',image,emotion:'happy',asset_id:'missing'}]}),/引用无效/);
 await s.api('/character-looks/'+a,'PATCH',{portraits:[{name:'未分类',image}]});await s.api('/character-looks/'+a+'/archive-binding','DELETE',{asset_id:'picture_one',skin_id:'default',emotion:''});assert.equal(lookFor(s.data,a).portraits.length,0);
});
