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

test('captured first send survives only the expected new-conversation transition', () => {
  const s = new GenerationIntent();
  s.arm({ id: 'new', revision: 1, route: '/', prompt: 'question', kind: '' });
  s.capture('/', 'question');
  s.arm(null);
  assert.equal(s.consume('/a/chat/created', 'question').id, 'new');
  s.arm({ id: 'old', revision: 1, route: '/a/chat/old', prompt: 'question', kind: '' });
  s.capture('/a/chat/old', 'question');
  s.arm(null);
  assert.equal(s.consume('/a/chat/different', 'question'), null);
  s.clear();
  assert.equal(s.submitted, null);
});

test('rapid submissions are consumed by content without erasing a newer explicitly armed draft', () => {
  const s = new GenerationIntent();
  s.arm({ id: 'a', revision: 1, route: '/a', prompt: 'first', kind: 'quiz' });
  s.capture('/a', 'first');
  s.arm(null);
  s.arm({ id: 'b', revision: 1, route: '/a', prompt: 'second', kind: 'diagram' });
  s.capture('/a', 'second');
  s.arm(null);
  s.arm({ id: 'c', revision: 1, route: '/a', prompt: 'third', kind: 'steps' });
  assert.equal(s.consume('/a', 'second').id, 'b');
  assert.equal(s.consume('/a', 'first').id, 'a');
  assert.equal(s.current.id, 'c');
});
