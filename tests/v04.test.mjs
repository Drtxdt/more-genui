import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FenceScanner } from '../src/fences.mjs';
import { RequestLifecycle } from '../src/request-lifecycle.mjs';
test('tail receipts require newline or successful finish', () => {
  const raw = '~~~genui-html\n<html></html>\n~~~';
  for (let i = 0; i <= raw.length; i++) {
    const found = [];
    const scan = new FenceScanner((s) => found.push(s));
    scan.update(raw.slice(0, i));
    scan.update(raw);
    assert.equal(found.length, 0);
    scan.update(raw + 'suffix\n');
    scan.finish();
    assert.equal(found.length, 0);
  }
  const found = [];
  const scan = new FenceScanner((s) => found.push(s));
  scan.update(raw);
  scan.finish();
  scan.finish();
  assert.equal(found.length, 1);
});
test('rebuilding history A after B completed keeps A ownership', () => {
  const l = new RequestLifecycle(() => {});
  for (const id of ['a', 'b']) {
    l.start(id, new WeakMap());
    l.identify(id, id);
    l.source(id, id);
    l.end(id);
  }
  assert.equal(l.owner({}, 'a', 'a').id, 'a');
  assert.equal(l.owner({}, 'old', 'old'), undefined);
  l.clear();
});
