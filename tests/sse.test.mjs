import test from 'node:test';
import assert from 'node:assert/strict';
import {createSseJsonParser} from '../frontend/sse-json.js';

test('float parser preserves whitespace across split JSON and ignores SSE comments', () => {
  const parser=createSseJsonParser();
  assert.deepEqual(parser.pushEvent('event: delta\ndata: {"text":"hello '), []);
  assert.deepEqual(parser.pushEvent('data: world"}'), [{text:'hello world'}]);
  assert.deepEqual(parser.pushEvent(': heartbeat\nevent: complete\ndata: {}'), [{}]);
  assert.deepEqual(parser.flush(), []);
});

test('float parser recovers after malformed upstream records', () => {
  const parser=createSseJsonParser();
  parser.pushEvent('data: invalid');
  assert.deepEqual(parser.pushEvent('data: {"text":"你好"}'), [{text:'你好'}]);
  parser.pushEvent('data: {"unfinished":');
  assert.deepEqual(parser.pushEvent('data: [DONE]'), []);
  assert.deepEqual(parser.flush(), []);
});
