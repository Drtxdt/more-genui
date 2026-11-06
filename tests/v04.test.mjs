import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FenceScanner } from '../src/fences.mjs';
import { RequestLifecycle } from '../src/request-lifecycle.mjs';
import { searchSources, publicURL, representativeImage } from '../src/search-sources.mjs';
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
test('only search results qualify; page metadata must resolve to an allowed HTTPS URL', () => {
  assert.deepEqual(
    searchSources([{ type: 'RESPONSE', results: [{ url: 'https://example.com' }] }]),
    [],
  );
  for (const url of [
    'file:///x',
    'https://127.1',
    'https://[::1]',
    'https://user@example.com',
    'https://x.local',
  ])
    assert.equal(publicURL(url), null);
  assert.equal(
    representativeImage(
      '<meta content="/cover.png" property="og:image">',
      'https://example.com/post',
    ),
    'https://example.com/cover.png',
  );
});

test('overlap cannot turn anonymous output into history on cancellation or rebuild', () => {
  const ledger = new RequestLifecycle(() => {});
  assert.equal(ledger.classify({}, 'old', 'saved').kind, 'history');
  ledger.start('a', new WeakMap());
  ledger.start('b', new WeakMap());
  for (const id of ['a', 'b']) {
    assert.equal(ledger.classify({}, null, 'new').kind, 'unknown');
    ledger.end(id);
  }
  assert.equal(ledger.classify({}, null, 'new').kind, 'unknown');
  assert.equal(ledger.classify({}, 'old', 'saved').kind, 'history');
  ledger.clear();
});
