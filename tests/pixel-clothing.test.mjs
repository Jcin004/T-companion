import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDrawing,validateDrawing} from '../frontend/clothing-project.js';
import {PaintSession,paintLine,fillPixels,compositePixels} from '../frontend/pixel-paint.js';
import {bodyPixels,CLOTHING_TEMPLATE as T} from '../frontend/clothing-template.js';
import {LocalService,emptyData,validateBackup} from '../frontend/local-service.js';
import {lookFor} from '../frontend/character-looks.js';
const clone=v=>JSON.parse(JSON.stringify(v));
async function fixture(){
 let saved=emptyData(),fail=false;
 const storage={load:async()=>clone(saved),save:async d=>{if(fail)throw Error('synthetic disk full');saved=clone(d);},hasKey:async()=>false};
 const service=await new LocalService(storage,()=>{throw Error('No model allowed');}).init();
 await service.transact(d=>d.characters.push({id:'a',name:'合成人物',identity:'',style:'',avatar:''}));
 await service.api('/character-looks/a','PATCH',{skins:[{id:'paint',name:'手绘衣服',skin:1,portraits:[],portrait:0,sprite:null,ai_allowed:false}]});
 return {service,storage,fail:value=>{fail=value;},read:()=>clone(saved)};
}
const path='/character-looks/a/drawing/paint';
const atlas={image:'data:image/png;base64,AAAA',frames:3,row_count:4,rows:{down:0,left:1,right:2,up:3},idle_frame:1,walk_order:[1,0,1,2]};
test('grid pencil paints entire anchored cells and fills fast strokes; eraser and mirror share units',()=>{
 const p=new Uint8Array(64*96);paintLine(p,[3,3],[11,3],{unit:4,color:2});
 for(let y=0;y<96;y++)for(let x=0;x<64;x++)assert.equal(p[y*64+x],y<4&&x<12?2:0);
 paintLine(p,[4,1],[4,1],{unit:4,color:0});assert.equal(p[4],0);assert.equal(p[3],2);
 paintLine(p,[0,8],[0,8],{unit:2,color:5,mirror:true});assert.equal(p[8*64],5);assert.equal(p[8*64+63],5);assert.equal(p[9*64+62],5);
 const before=p.slice();paintLine(p,[-2,-2],[-1,-1],{unit:1,color:9});assert.deepEqual(p,before);
});
test('reused Piskel fill respects connected boundaries, edges and same-color no-op',()=>{
 const p=new Uint8Array(64*96);for(let y=5;y<9;y++)for(let x=4;x<8;x++)p[y*64+x]=3;
 fillPixels(p,4,5,6);assert.equal(p.filter(n=>n===6).length,16);assert.equal(p[0],0);fillPixels(p,0,0,2);assert.equal(p[0],2);assert.equal(p[5*64+4],6);const before=p.slice();fillPixels(p,0,0,2);assert.deepEqual(p,before);
});
test('one stroke is one undo, cancel is inert, frames and locked body never share mutable pixels',()=>{
 const project=newDrawing(),s=new PaintSession(project),body=bodyPixels(0,1),original=clone(project);
 s.begin(1);paintLine(s.stroke.pixels,[0,0],[30,0],{color:9});assert.equal(s.finish(),true);
 assert.equal(s.undoStack.length,1);for(let i=0;i<12;i++)if(i!==1)assert.equal(s.project.frames[i],original.frames[i]);
 assert.equal(s.undo(),true);assert.deepEqual(s.project,original);assert.equal(s.redo(),true);
 const painted=clone(s.project);s.begin(1);paintLine(s.stroke.pixels,[0,2],[20,2],{color:4});s.cancel();assert.deepEqual(s.project,painted);
 assert.deepEqual(project,original);assert.deepEqual(bodyPixels(0,1),body);body.fill(0);assert.ok(bodyPixels(0,1).some(Boolean));
 assert.equal(compositePixels(s.project,1).length,64*96*4);
 const oldColor=s.project.colors[2];s.recolor(2,'#123456');assert.equal(s.project.colors[2],'#123456');s.undo();assert.equal(s.project.colors[2],oldColor);s.redo();assert.equal(s.project.colors[2],'#123456');
});
test('all template poses keep fixed head and supporting sole, correct order, distinct views',()=>{
 assert.deepEqual(T.order,[1,0,1,2]);
 for(let r=0;r<4;r++)for(let f=0;f<3;f++){const p=bodyPixels(r,f),ys=[];for(let i=0;i<p.length;i++)if(p[i])ys.push(Math.floor(i/64));assert.equal(Math.min(...ys),8);assert.equal(Math.max(...ys),87);}
 assert.notDeepEqual(bodyPixels(0,1),bodyPixels(3,1));assert.notDeepEqual(bodyPixels(1,1),bodyPixels(2,1));
});
test('drawing drafts restart, save errors preserve old state, CAS prevents conflicts, apply is idempotent and owner-local',async()=>{
 const f=await fixture(),s=f.service,project=newDrawing(),initial=f.read();
 assert.deepEqual(await s.api(path),{version:1,revision:0});
 const first=await s.api(path,'PATCH',{expected_revision:0,project});assert.equal(first.revision,1);assert.equal(s.data.character_looks.a.skins[0].sprite,null);
 assert.deepEqual(await s.api(path,'PATCH',{expected_revision:0,project}),first);
 const reopened=await new LocalService(f.storage,()=>{throw Error('model');}).init();assert.deepEqual((await reopened.api(path)).draft,project);
 const next=clone(project);next.frames[1]='f'+next.frames[1].slice(1);f.fail(true);
 await assert.rejects(s.api(path,'PATCH',{expected_revision:1,project:next}),/disk full/);assert.deepEqual((await s.api(path)).draft,project);f.fail(false);
 await s.api(path,'PATCH',{expected_revision:1,project:next});
 const conflict=clone(project);conflict.frames[2]='e'+conflict.frames[2].slice(1);
 await assert.rejects(s.api(path,'PATCH',{expected_revision:1,project:conflict}),/别处修改/);
 const applied=await s.api(path,'POST',{expected_revision:2,project:next,sprite:atlas});assert.equal(applied.revision,3);assert.equal(applied.draft,undefined);
 assert.deepEqual(await s.api(path,'POST',{expected_revision:2,project:next,sprite:atlas}),applied);
 assert.deepEqual(s.data.characters,initial.characters);assert.equal(s.data.character_looks.a.active_skin_id,'default');assert.equal(s.data.character_looks.a.skins[0].ai_allowed,false);
 assert.equal(lookFor(s.data,'a','paint').drawing,undefined);
 assert.deepEqual(validateBackup(await s.api('/backup')).character_looks,s.data.character_looks);
 await assert.rejects(s.api('/character-looks/user/drawing/paint','PATCH',{expected_revision:0,project}),/皮肤不存在/);
});
test('malformed projects and wrong body versions are rejected before any mutation',async()=>{
 const f=await fixture(),before=f.read();
 for(const patch of [{template_id:'unknown'},{frames:['f']},{colors:['', '#ffffff']},{evil:'field'}]){
   const bad={...newDrawing(),...patch};assert.throws(()=>validateDrawing(bad),/无效/);await assert.rejects(f.service.api(path,'PATCH',{expected_revision:0,project:bad}),/无效/);
 }
 assert.deepEqual(f.read(),before);
});
