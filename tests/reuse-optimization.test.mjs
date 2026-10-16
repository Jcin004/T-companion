import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseModelObject} from '../frontend/model-json.js';
import {MemoryLexicalIndex,rankedMemories} from '../frontend/memory-lexical.js';
import {updateError} from '../frontend/app-update.js';
const event=(id,title,content,quote='')=>({id,title,content,evidence:[{message_id:1,quote}],owner_id:'a',active:true,updated_at:'2026-01-01T00:00:00Z'});

test('float wrappers and jsonrepair accept model narration/fences/syntax errors without altering source typography',()=>{
 const source='他说：“山间，真好。” <think>这是原话</think>';
 const raw=JSON.stringify({summary:source});assert.deepEqual(parseModelObject(raw),{value:{summary:source},mode:'raw'});
 const wrapped='<think>{"summary":"不应读取思考"}</think>\n```json\n'+raw+'\n```';assert.deepEqual(parseModelObject(wrapped),{value:{summary:source},mode:'wrapped'});
 const repaired='结果如下：\n{summary: '+JSON.stringify(source)+',}';assert.deepEqual(parseModelObject(repaired),{value:{summary:source},mode:'repaired'});
});
test('structure recovery rejects arrays, multiple objects and missing response tails',()=>{
 for(const input of ['[{"summary":"not an object"}]','{"summary":"one"}{"summary":"two"}','{"memories":[{"title":"unfinished"}','{"summary":"unterminated','{}','null']){
  if(input==='{}')assert.deepEqual(parseModelObject(input).value,{});else assert.throws(()=>parseModelObject(input));
 }
 assert.throws(()=>parseModelObject('x'.repeat(100001)),/过大/);
});
test('vendored jsonrepair browser files exactly match the pinned ISC dependency and recorded digests',async()=>{
 const provenance=JSON.parse(await readFile('frontend/vendor/jsonrepair/provenance.json','utf8'));assert.equal(provenance.version,'3.15.0');assert.equal(provenance.license,'ISC');
 for(const [file,hash] of Object.entries(provenance.sha256)){const local=await readFile('frontend/vendor/jsonrepair/'+file),installed=await readFile('node_modules/jsonrepair/lib/esm/'+file);assert.deepEqual(local,installed);assert.equal(createHash('sha256').update(local).digest('hex'),hash);}
});
test('Serein BM25 port recalls a single English content term and Chinese source quote, with explainable matches',()=>{
 const rows=[event('a','日常偏好','用户提到一种活动','我喜欢山间散步'),event('b','饮品','User prefers tea')];const index=new MemoryLexicalIndex(rows);
 assert.equal(index.search('tea')[0].e.id,'b');const match=index.search('山间散步')[0];assert.equal(match.e.id,'a');assert.ok(match.score>0);assert.ok(match.matched_terms.includes('散步'));assert.equal(index.search('不存在的羽毛球').length,0);
});
test('common phrases alone do not recall every event in a larger collection; a specific term admits only its event',()=>{
 const rows=Array.from({length:12},(_,i)=>event(String(i),'日常','今天聊天 '+(i===0?'樱花':'普通'))),index=new MemoryLexicalIndex(rows);
 assert.deepEqual(index.search('今天'),[]);assert.deepEqual(index.search('今天樱花').map(r=>r.e.id),['0']);
});
test('cached lexical index refreshes on edit/pause/delete and isolates role statistics',()=>{
 const a=event('a','园艺','orchid'),b={...event('b','园艺','orchid'),owner_id:'b'},memory={events:[a,b]};
 assert.deepEqual(rankedMemories(memory,'a','orchid').map(r=>r.e.id),['a']);a.content='jasmine';assert.deepEqual(rankedMemories(memory,'a','orchid'),[]);assert.equal(rankedMemories(memory,'a','jasmine').length,1);a.active=false;assert.equal(rankedMemories(memory,'a','jasmine').length,0);memory.events=[];assert.equal(rankedMemories(memory,'b','orchid').length,0);
});
test('update network failures are explained in Chinese and never reported as up to date',()=>{
 assert.match(updateError('Unable to resolve host "api.github.com": No address associated with hostname'),/无法解析.*未完成更新检查/);assert.match(updateError('Socket timed out'),/超时.*未完成更新检查/);assert.match(updateError('SSL handshake error'),/安全连接/);assert.equal(updateError('下载中断'),'下载中断');
});
