import {test} from 'node:test';
import assert from 'node:assert/strict';
import {framePlacement,frameKey} from '../frontend/character-frame-editor.js';
import {validateAtlas} from '../frontend/character-looks.js';
import {bindCharacterImageInput} from '../frontend/character-image-input.js';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
const image='data:image/png;base64,AAAA';
const atlas=()=>({image,frames:3,row_count:4,idle_frame:1,walk_order:[1,0,1,2],rows:{down:0,left:3,right:1,up:2},frame_editor:{version:1,width:48,height:64,scale:1,base_image:image,cells:{'3_1':{image,scale:1,x:0,y:0}}}});
test('single frames keep canvas-based center/feet anchors and shared pixel scale',()=>{
 assert.deepEqual(framePlacement(48,64,32,48,{scale:1,x:0,y:0}),{x:8,y:16,width:32,height:48});
 assert.deepEqual(framePlacement(48,64,32,48,{scale:1,x:2,y:-3}),{x:10,y:13,width:32,height:48});
 assert.deepEqual(framePlacement(48,64,64,96,{scale:.5,x:0,y:0}),{x:8,y:16,width:32,height:48});
 assert.equal(frameKey(atlas(),'left',1),'3_1');
});
test('frame sources and alignment persist and survive backup; invalid replacements roll back',async()=>{
 let saved=emptyData(),fail=false;const clone=x=>JSON.parse(JSON.stringify(x));
 const storage={load:async()=>clone(saved),save:async d=>{if(fail)throw Error('synthetic save failure');saved=clone(d);}};
 const s=await new LocalService(storage).init();await s.transact(d=>d.characters.push({id:'a',name:'林',identity:'合成甲',style:'',avatar:''}));
 await s.api('/character-looks/a','PATCH',{sprite:atlas()});const expected=clone(s.data.character_looks);
 assert.deepEqual((await new LocalService(storage).init()).data.character_looks,expected);assert.deepEqual(validateBackup(await s.api('/backup')).character_looks,expected);
 for(const change of [a=>a.frame_editor.cells['9_1']=a.frame_editor.cells['3_1'],a=>a.frame_editor.cells['3_1'].x=49,a=>a.frame_editor.width=800,a=>a.frame_editor.cells['3_1'].scale=0,a=>a.frame_editor.base_image='file:///private.png']){const candidate=atlas();change(candidate);assert.throws(()=>validateAtlas(candidate),/单帧/);}
 fail=true;await assert.rejects(s.api('/character-looks/a','PATCH',{sprite:{...atlas(),image:'data:image/png;base64,BBBB'}}),/save failure/);assert.deepEqual(s.data.character_looks,expected);
});
test('native image input uses existing document adapter, ignores late ownership and cancellation',async()=>{
 const previous=globalThis.Capacitor;let handler,resolve,owner=1,calls=0;const files=[],errors=[],input={closest:()=>({addEventListener:(_,fn)=>handler=fn})};
 globalThis.Capacitor={isNativePlatform:()=>true,Plugins:{TDevice:{importFile:async options=>{assert.deepEqual(options,{image:true});calls++;return new Promise(r=>resolve=r);}}}};
 try{
  bindCharacterImageInput(input,{onFile:f=>files.push(f),error:e=>errors.push(e.message),guard:()=>{const original=owner;return ()=>owner===original;}});
  const first=handler({preventDefault(){}});owner++;resolve({dataURL:image});await first;assert.equal(files.length,0);
  const second=handler({preventDefault(){}});resolve({dataURL:image});await second;assert.equal(files.length,1);assert.equal(files[0].type,'image/png');assert.equal(files[0].size,3);
  globalThis.Capacitor.Plugins.TDevice.importFile=async()=>{throw {code:'image_cancelled',message:'已取消图片选择'};};await handler({preventDefault(){}});assert.deepEqual(errors,[]);assert.equal(calls,2);
 }finally{globalThis.Capacitor=previous;}
});
