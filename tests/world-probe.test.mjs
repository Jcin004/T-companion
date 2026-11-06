import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const bundle=await build({entryPoints:['frontend/world-probe-core.js'],bundle:true,write:false,format:'iife',globalName:'WorldProbe',platform:'neutral',target:'es2019'});
const rules=runInNewContext(bundle.outputFiles[0].text+';WorldProbe');
const plain=value=>JSON.parse(JSON.stringify(value));
test('original SullyOS threads deliver between characters, preserve history and retry receipts',()=>{
 const original=rules.fixture(),a=rules.advance(original,{requestId:'probe-a'});
 assert.equal(original.world.threads.length,0);
 assert.match(rules.snapshot(a.data).received,/林：今晚一起看书吗？/);
 assert.deepEqual(plain(rules.advance(a.data,{requestId:'probe-a'}).data),plain(a.data));
 assert.throws(()=>rules.advance(a.data,{requestId:'probe-a',text:'changed'}),/内容已改变/);
 const b=rules.advance(JSON.parse(JSON.stringify(a.data)),{requestId:'probe-b',sender:'probe-b',text:'好，我带一本书过去。'});
 const view=rules.snapshot(b.data);assert.equal(view.threads[0].messages.length,2);assert.equal(view.worldVersion,2);
 assert.equal(view.threads[0].messages[1].fromId,'probe-b');
});
test('A-Life clock/GOAP run without browser, network or model, including restore and multi-day adapter',()=>{
 const result=rules.ruleCompatibility();assert.ok(Object.values(result.checks).every(Boolean));
 assert.equal(result.raw48HourCallbacks,0);assert.equal(result.expected48HourCallbacks,48);
 assert.equal(result.adapted49HourCallbacks,49);assert.equal(result.modelRequests,0);
 const d=rules.catchUp(rules.fixture(),3600000);assert.throws(()=>rules.catchUp(d,0),/区间无效/);
});
test('vendor bytes match pinned upstream Git blobs; no edited vendor algorithm',async()=>{
 const provenance=JSON.parse(await readFile('config/world-probe-sources.json','utf8'));
 for(const file of provenance.files){const bytes=await readFile(file.local);const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert.equal(hash,file.blob,file.local);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.local);}
});
test('neighborhood Schedule and actual phone excerpts remain unedited at recorded versions',async()=>{
 const provenance=JSON.parse(await readFile('config/neighborhood-sources.json','utf8'));
 for(const file of provenance.files){const bytes=await readFile(file.local);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.local);if(file.retained.startsWith('entire'))assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),file.blob);}
});
