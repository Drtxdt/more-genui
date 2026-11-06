import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenerationIntent } from '../src/generation-intent.mjs';
test('intent normalizes only edges and line endings and consumes the matching request once', () => {
  const state = new GenerationIntent();
  const intent = { id: 'one', revision: 2, route: '/a', prompt: ' 中文\r\n草稿 ', kind: 'diagram' };
  assert.equal(state.arm(intent), true);
  assert.equal(state.consume('/b', '中文\n草稿'), null);
  assert.equal(state.consume('/a', '中文 草稿'), null);
  assert.equal(state.consume('/a', '中文\n草稿').id, 'one');
  assert.equal(state.consume('/a', '中文\n草稿'), null);
  state.arm(intent);
  assert.equal(state.arm({ revision: 3 }), false);
  assert.equal(state.consume('/a', '中文\n草稿').revision, 2);
  state.arm(intent);
  state.arm(null);
  assert.equal(state.consume('/a', intent.prompt), null);
});
