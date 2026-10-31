import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDrawing,refineDrawing,drawingSize,validateDrawing} from '../frontend/clothing-project.js';
import {PaintSession,paintLine,fillPixels,compositePixels} from '../frontend/pixel-paint.js';
test('refinement preserves every old pixel as four subpixels in all poses',()=>{
 const original=newDrawing(),fine=refineDrawing(original);validateDrawing(fine);assert.deepEqual(drawingSize(fine),{width:128,height:192,scale:2});
 for(let n=0;n<12;n++)for(let y=0;y<96;y++)for(let x=0;x<64;x++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)assert.equal(fine.frames[n][(y*2+j)*128+x*2+k],original.frames[n][y*64+x]);
 const old=compositePixels(original,1),next=compositePixels(fine,1);for(let y=0;y<96;y++)for(let x=0;x<64;x++)assert.deepEqual(next.slice(((y*2)*128+x*2)*4,((y*2)*128+x*2)*4+4),old.slice((y*64+x)*4,(y*64+x)*4+4));
 assert.equal(original.pixel_scale,undefined);assert.throws(()=>validateDrawing({...fine,pixel_scale:3}));assert.throws(()=>validateDrawing({...fine,frames:original.frames}));
});
test('fine pen, mirrored eraser, fill and history retain independent subpixel detail',()=>{
 const p=refineDrawing(newDrawing());p.frames.fill('0'.repeat(128*192));const s=new PaintSession(p);s.begin(1);paintLine(s.stroke.pixels,[100,150],[100,150],{color:15,width:128,height:192,mirror:true});s.finish();assert.equal(s.project.frames[1][150*128+100],'f');assert.equal(s.project.frames[1][150*128+27],'f');assert.equal(s.project.frames[1][150*128+101],'0');
 s.undo();assert.equal(s.project.frames[1][150*128+100],'0');s.redo();assert.equal(s.project.frames[1][150*128+100],'f');
 const pixels=new Uint8Array(128*192);fillPixels(pixels,127,191,2,{width:128,height:192});assert.ok(pixels.every(n=>n===2));
 const old=new PaintSession(newDrawing());assert.ok(old.refine());assert.equal(drawingSize(old.project).scale,2);old.undo();assert.equal(drawingSize(old.project).scale,1);old.redo();assert.equal(drawingSize(old.project).scale,2);
});
