import assert from 'node:assert/strict';
import test from 'node:test';
import { fencedSources, parseApp } from '../src/protocol.mjs';

test('only adjacent metadata accompanies an explicit top-level HTML fence', () => {
  const meta = '<!-- more-genui: {"version":1,"id":"sql","title":"SQL","stateVersion":1} -->';
  const proof = '<!-- more-genui-request: 70658388-9f0c-4ee0-9d13-4d0811d193b0 -->';
  const html = '<html></html>';
  const fence = ['```genui-html', html, '```'].join('\n');
  assert.equal(parseApp(fencedSources([meta, proof, '', fence].join('\n'))[0]).id, 'sql');
  assert.equal(fencedSources([meta, proof, fence].join('\n'))[0], [meta, proof, html].join('\n'));
  assert.deepEqual(fencedSources([meta, 'from elsewhere', fence].join('\n')), [html]);
  assert.deepEqual(fencedSources([meta, fence.slice(0, -1)].join('\n')), []);
  assert.deepEqual(fencedSources(['````markdown', meta, fence, '````'].join('\n')), []);
});
