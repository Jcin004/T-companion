import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('shared synthetic evaluation crosses real local commands, reloads storage and sends one enriched request',()=>{
  const stdout=execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/evaluate-local-memory.mjs',import.meta.url))],{encoding:'utf8'});
  const result=JSON.parse(stdout.trim());
  assert.equal(result.provider,'current-local');
  assert.equal(result.chat_calls_during_queries,0);
  for(const name of ['owner-isolation','owner-own-knowledge','story-isolation','absent','reload-from-storage','one-chat-call-with-memory','inactive-excluded']){
    assert.equal(result.cases.find(c=>c.id===name)?.pass,true,name);
  }
  assert.equal(result.cases.filter(c=>!c.probe).every(c=>c.pass),true);
});
