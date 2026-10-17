import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUpdateSources} from '../frontend/app-update.js';

test('update channels accept bounded public HTTPS manifests without credentials or query secrets',()=>{
  assert.deepEqual(normalizeUpdateSources('  https://updates.example/latest.json\r\n\nhttps://backup.example/latest.json  '),['https://updates.example/latest.json','https://backup.example/latest.json']);
  assert.deepEqual(normalizeUpdateSources(''),[]);
  assert.deepEqual(normalizeUpdateSources('https://updates.example/latest.json\nhttps://updates.example/latest.json'),['https://updates.example/latest.json']);
  for(const value of ['http://updates.example/x','https://key@updates.example/x','https://updates.example/x?token=secret','https://updates.example/x#fragment','not a URL','https://updates.example/'+ 'x'.repeat(2048)])assert.throws(()=>normalizeUpdateSources(value),/HTTPS/);
  assert.throws(()=>normalizeUpdateSources('https://a.example\nhttps://b.example\nhttps://c.example\nhttps://d.example'),/3/);
});
