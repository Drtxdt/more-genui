import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewPool } from '../src/preview-pool.mjs';
test('shared downloads survive one subscriber leaving and respect both concurrency limits', async () => {
  const pending = new Map();
  const pool = new PreviewPool(
    (source, signal) => new Promise((resolve) => pending.set(source.url, { resolve, signal })),
  );
  const first = new AbortController(),
    second = new AbortController();
  const get = (tab, url, c = second) => pool.get(tab, { url, image: null }, c.signal);
  const cancelled = get(1, 'shared', first);
  const waiting = [
    get(2, 'shared'),
    get(1, 'a'),
    get(1, 'b'),
    get(2, 'c'),
    get(2, 'd'),
    get(3, 'e'),
  ];
  await Promise.resolve();
  assert.deepEqual([...pending.keys()], ['shared', 'a', 'c', 'd']);
  first.abort();
  assert.equal(await cancelled, null);
  assert.equal(pending.get('shared').signal.aborted, false);
  for (const { resolve } of pending.values()) resolve('image');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(pending.has('e') && pending.has('b'));
  for (const { resolve } of pending.values()) resolve('image');
  assert.deepEqual(await Promise.all(waiting), Array(6).fill('image'));
});
