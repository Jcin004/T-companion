import test from 'node:test';
import assert from 'node:assert/strict';
import {NativePersistence,emptyData} from '../frontend/local-service.js';
import {visitLookImages,imageDigest} from '../frontend/native-look-images.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const image='data:image/png;base64,'+'A'.repeat(480000);
async function fixture(){
  const id=await imageDigest(image),atlas={image:'asset:'+id,frames:3,frame_editor:{base_image:'asset:'+id,cells:{'0_1':{image:'asset:'+id}}}};
  let document={...emptyData(),messages:[{content:'asset:'+id}],character_looks:{a:{portraits:[{image:'asset:'+id}],sprite:atlas,skins:[{sprite:atlas}],gestures:{wave:{atlas}}}},revision:1};
  const assets=new Map([[id,image]]),calls=[];
  const plugin={fail:false,reads:0,async load(){return {data:JSON.stringify(document),revision:document.revision,assetReferences:true};},
    async loadImages({ids}){this.reads++;return {images:Object.fromEntries(ids.map(id=>[id,assets.get(id)]))};},
    async save(request){
      calls.push(request);if(this.fail)throw Error('synthetic disk failure');
      assert.equal(request.revision,document.revision);const next=JSON.parse(request.data),keep=new Set();
      visitLookImages(next,v=>{assert.match(v,/^asset:[a-f0-9]{64}$/);const id=v.slice(6);keep.add(id);assert.ok(assets.has(id)||request.images[id]);return v;});
      for(const [id,data]of Object.entries(request.images)){assert.equal(await imageDigest(data),id);assets.set(id,data);}
      for(const id of assets.keys())if(!keep.has(id))assets.delete(id);
      next.revision=document.revision+1;document=next;return {revision:next.revision};
    }};
  return {plugin,calls,assets,id,replace:d=>document=d};
}
test('native bridge transmits repeated images once, then only references; snapshots/backups still contain images',async()=>{
  const f=await fixture(),p=new NativePersistence(f.plugin),data=await p.load();
  assert.equal(f.plugin.reads,1);assert.equal(data.character_looks.a.sprite.image,image);assert.equal(data.messages[0].content,'asset:'+f.id,'only image fields are decoded');
  await p.save(data);assert.ok(f.calls[0].data.length<5000);assert.deepEqual(f.calls[0].images,{});assert.equal(data.character_looks.a.sprite.image,image,'adapter never mutates business document');
  const again=await p.load();assert.equal(f.plugin.reads,1);assert.equal(again.character_looks.a.gestures.wave.atlas.image,image);
  const nextImage='data:image/png;base64,BBBB';again.character_looks.a.sprite.image=nextImage;
  f.plugin.fail=true;await assert.rejects(p.save(again),/disk failure/);assert.equal(p.revision,2);
  f.plugin.fail=false;await p.save(again);assert.equal(Object.values(f.calls.at(-1).images).length,1);assert.equal(Object.values(f.calls.at(-1).images)[0],nextImage);
  assert.equal((await p.load()).character_looks.a.sprite.image,nextImage);
});
test('missing/corrupt native assets fail without publishing a new revision; legacy plugin remains compatible',async()=>{
  const f=await fixture();f.assets.set(f.id,'data:image/png;base64,WRONG');const p=new NativePersistence(f.plugin);
  await assert.rejects(p.load(),/校验失败/);assert.equal(p.revision,undefined);
  const raw=emptyData(),legacy={load:async()=>({data:JSON.stringify(raw),revision:4}),save:async value=>{assert.deepEqual(JSON.parse(value.data),raw);return {revision:5};}};
  const old=new NativePersistence(legacy);assert.deepEqual(await old.load(),raw);await old.save(raw);assert.equal(old.revision,5);
});
test('native transaction reuses the leased snapshot and releases on successful commit only',async()=>{
  let reads=0,ends=0,fail=false;
  const plugin={beginWrite:async()=>({assetReferences:true,data:JSON.stringify(emptyData()),revision:1}),
    load:async()=>{reads++;throw Error('duplicate read');},endWrite:async()=>{ends++;},
    save:async request=>{assert.equal(request.release,true);if(fail)throw Error('save failed');return {revision:2,released:true};}};
  const p=new NativePersistence(plugin);await p.begin();const data=await p.load();await p.save(data);await p.end();assert.equal(reads,0);assert.equal(ends,0);
  fail=true;await p.begin();await p.load();await assert.rejects(p.save(data),/save failed/);await p.end();assert.equal(ends,1);
});
