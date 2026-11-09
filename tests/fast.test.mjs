import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFast } from '../src/fast-schema.mjs';
import { FenceScanner } from '../src/fences.mjs';
const spec = {
  version: 1,
  id: 'test',
  title: '对照',
  stateVersion: 1,
  kind: 'compare',
  before: { label: '前', lines: ['A'] },
  after: { label: '后', lines: ['B'] },
};
test('strict declarative protocol rejects code, invalid references and oversized graphs', () => {
  assert.equal(parseFast(JSON.stringify(spec)).spec.kind, 'compare');
  assert.throws(() => parseFast(JSON.stringify({ ...spec, script: 'alert(1)' })));
  assert.throws(() =>
    parseFast(
      JSON.stringify({
        ...spec,
        kind: 'matrix',
        before: undefined,
        after: undefined,
        rows: ['r'],
        columns: ['c'],
        cells: [{ row: 'missing', column: 'c', text: 'x' }],
      }),
    ),
  );
  assert.throws(() => parseFast(JSON.stringify({ ...spec, version: 2 })));
});
test('Fast fences retain the same incremental execution boundary', () => {
  const wire = '```genui-json\n' + JSON.stringify(spec) + '\n```\n';
  for (let split = 0; split < wire.length; split++) {
    const found = [],
      scanner = new FenceScanner((s) => found.push(s));
    scanner.update(wire.slice(0, split));
    scanner.update(wire);
    assert.equal(found.length, 1);
  }
  const found = [],
    s = new FenceScanner((v) => found.push(v));
  s.update(wire.slice(0, -4));
  assert.equal(found.length, 0);
});

test('all published declarative examples satisfy the same strict renderer schema', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  for (const name of await readdir('examples'))
    if (name.startsWith('fast-') && name.endsWith('.json'))
      assert.ok(parseFast(await readFile('examples/' + name, 'utf8')).spec);
});

test('tutorial fences suppress nested apps and retain the declared language', () => {
  const seen = [];
  const scan = new FenceScanner((source, language) => seen.push([language, source]));
  const tick = String.fromCharCode(96).repeat(3);
  scan.update([tick + '~', 'ignored', tick, tick + 'genui-json', '{}', tick, ''].join('\n'));
  assert.deepEqual(seen, [['genui-json', '{}']]);
  const outer = new FenceScanner(() => assert.fail('nested example emitted'));
  outer.update([tick + '`markdown', tick + 'genui-json', '{}', tick, tick + '`', ''].join('\n'));
});

test('Prompt Lab rejects JSON labeled as HTML and ignores a Markdown tutorial', async () => {
  const { inspectCapture } = await import('../scripts/lab-record.mjs');
  const tick = String.fromCharCode(96).repeat(3);
  const { readFile } = await import('node:fs/promises');
  const src = await readFile('examples/fast-compare.json', 'utf8');
  const inspect = (lines) =>
    inspectCapture({ text: lines.join('\n'), observation: { status: 'complete' } });
  assert.equal(inspect([tick + 'genui-html', src, tick]).valid, false);
  assert.equal(inspect([tick + 'genui-json', src, tick]).valid, true);
  assert.equal(inspect([tick + '~', tick + 'genui-json', src, tick, tick]).ui, false);
});
