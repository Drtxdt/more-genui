import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseApp,
  augment,
  completeApps,
  safeState,
  splitGuidance,
  GUIDE,
} from '../src/protocol.mjs';
import { SSEDecoder, ReplyAccumulator } from '../src/stream.mjs';
import { StateRepository } from '../src/state.mjs';
import { appDefinition, appFromEvent } from '../packages/harness/src/events.mjs';
const source = await readFile(new URL('../examples/wave.html', import.meta.url), 'utf8');
test('complete document and strict metadata validation', () => {
  assert.equal(parseApp(source).id, 'sine-wave');
  for (const bad of [
    source.replace('"version":1', '"version":2'),
    source.replace('</html>', ''),
    source + 'x'.repeat(262144),
    source.replace('"stateVersion":1', '"stateVersion":0'),
  ])
    assert.throws(() => parseApp(bad));
});
test('injection is idempotent, optional and transparently foldable', () => {
  assert.equal(augment(augment('hello')), augment('hello'));
  assert.equal(augment('hello', false), 'hello');
  assert.equal(splitGuidance(augment('hello')).guide, GUIDE);
});
test('closed fences only, multiple documents, varied fence lengths', () => {
  assert.equal(completeApps('```genui-html\n' + source).length, 0);
  assert.equal(completeApps('````genui-html\n' + source + '\n```').length, 0);
  assert.equal(
    completeApps('~~~genui-html\n' + source + '\n~~~\ntext\n```genui-html\n' + source + '\n```')
      .length,
    2,
  );
});
test('state validates object, serialization and UTF8 byte cap', () => {
  assert.deepEqual(safeState({ a: [1, true] }), { a: [1, true] });
  for (const bad of [null, [], { text: '测'.repeat(30000) }, 1, undefined])
    assert.throws(() => safeState(bad));
  const cyclic = {};
  cyclic.x = cyclic;
  assert.throws(() => safeState(cyclic));
});
test('SSE arbitrary splits and DeepSeek fragment deltas emit once at close', () => {
  const found = [];
  const reply = new ReplyAccumulator((s) => found.push(s));
  const sse = new SSEDecoder((e) => reply.accept(e));
  const events = [
    {
      v: {
        response: {
          fragments: [
            { type: 'THINK', content: 'hidden' },
            { type: 'RESPONSE', content: '' },
          ],
        },
      },
    },
    { p: 'response/fragments/-1/content', o: 'APPEND', v: '```genui-html\n' + source },
    { v: '\n```\n' },
    { v: 'more explanation' },
  ];
  const wire = events.map((e) => 'data: ' + JSON.stringify(e) + '\r\n\r\n').join('');
  for (let i = 0; i < wire.length; i += 7) sse.push(wire.slice(i, i + 7));
  assert.deepEqual(found, [source.trimEnd()]);
  assert.ok(!reply.text.includes('hidden'));
});
test('OpenAI delta shape and invalid SSE records do not break completion', () => {
  const found = [];
  const sse = new SSEDecoder((e) => new ReplyAccumulator((s) => found.push(s)).accept(e));
  sse.push(
    'data: nope\n\ndata: ' +
      JSON.stringify({ choices: [{ delta: { content: '```genui-html\n' + source + '\n```' } }] }) +
      '\n\ndata: [DONE]\n\n',
  );
  assert.equal(found.length, 1);
});
test('state survives updates, separates conversations and schema versions, serializes writes', async () => {
  const memory = new Map();
  const repository = new StateRepository({
    async get(k) {
      return memory.get(k);
    },
    async set(k, v) {
      memory.set(k, v);
    },
  });
  const app = parseApp(source),
    first = await repository.keys('sessionA', 'call1', app, source);
  await repository.save(first, { amplitude: 2 });
  const revision = await repository.keys('sessionA', 'call1', app, source + ' ');
  assert.deepEqual(await repository.load(revision), { amplitude: 2 });
  assert.deepEqual(
    await repository.load(await repository.keys('sessionA', 'call2', app, source)),
    {},
  );
  assert.deepEqual(
    await repository.load(await repository.keys('sessionB', 'call2', app, source)),
    {},
  );
  assert.deepEqual(
    await repository.load(
      await repository.keys('sessionA', 'call2', { ...app, stateVersion: 2 }, source + '2'),
    ),
    {},
  );
  await Promise.all([repository.save(first, { x: 1 }), repository.save(first, { x: 2 })]);
  assert.deepEqual(await repository.load(first), { x: 2 });
});
test('Harness root and nested results replay with stable call identity and turn placement', () => {
  for (const type of ['tool/result', 'tool/ptc-dispatch']) {
    const event = {
      type,
      seq: 7,
      data: {
        message: { toolCallId: 'root' },
        subCallId: 'child',
        meta: { kind: 'more-genui-app', source },
      },
    };
    const match = appDefinition.match(event);
    assert.equal(match.id, type === 'tool/result' ? 'root' : 'child');
    const start = { event, location: { kind: 'unresolved' } };
    const state = appDefinition.start({}, start);
    const node = appDefinition.buildViewNode({ key: match.id, id: match.id, start, state });
    assert.equal(node.groupTree, 'turn');
    assert.equal(node.data.source, source);
    assert.equal(appFromEvent({ ...event, data: { ...event.data, isError: true } }), null);
  }
});

test('official BATCH deltas inherit operation and child paths without exposing THINK', () => {
  const found = [],
    reply = new ReplyAccumulator((s) => found.push(s));
  reply.accept({
    v: {
      response: {
        fragments: [
          { type: 'THINK', content: 'secret reasoning' },
          { type: 'RESPONSE', content: '' },
        ],
      },
    },
  });
  reply.accept({
    p: 'response',
    o: 'BATCH',
    v: [
      {
        p: 'fragments/-1',
        o: 'BATCH',
        v: [{ p: 'content', o: 'APPEND', v: '```genui-html\n' + source }, { v: '\n```\n' }],
      },
    ],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0], source.trimEnd());
  assert.ok(!reply.text.includes('secret reasoning'));
  reply.accept({ p: 'response/fragments/-1/content', o: 'SET', v: 'first' });
  reply.accept({ v: 'replacement' });
  assert.equal(reply.text, 'replacement');
});

import { RepairContexts } from '../src/repair.mjs';
import { FenceScanner } from '../src/fences.mjs';
test('repair handoff is explicit, scoped, compatible, snapshotted and single-use', () => {
  const repairs = new RepairContexts(),
    app = parseApp(source),
    state = { x: 2 };
  const token = repairs.create('A', app, state);
  state.x = 99;
  const repaired = source.replace('</html>', `<!-- more-genui-repair: ${token} --></html>`);
  assert.equal(repairs.consume('A', app, source), undefined);
  assert.equal(repairs.consume('B', app, repaired), undefined);
  assert.equal(repairs.consume('A', { ...app, stateVersion: 2 }, repaired), undefined);
  assert.deepEqual(repairs.consume('A', app, repaired), { x: 2 });
  assert.equal(repairs.consume('A', app, repaired), undefined);
});
test('incremental fence scan handles arbitrary splits and SET replacements', () => {
  const found = new Set(),
    scanner = new FenceScanner((s) => found.add(s));
  const text = 'intro\n```genui-html\n' + source.trim() + '\n```\nend';
  for (let i = 1; i <= text.length; i++) scanner.update(text.slice(0, i));
  assert.deepEqual([...found], [source.trim()]);
  scanner.update('replacement\n~~~genui-html\n' + source.trim() + '\n~~~\n');
  assert.equal(found.size, 1);
});

test('repair comments before html are accepted without allowing incomplete documents or prose', () => {
  const marker = '<!-- more-genui-repair: e2735f9b-7ec8-4b1f-a58d-8725b6fdf502 -->';
  const repaired = source.replace('<html>', marker + '\n<html>');
  assert.equal(parseApp(repaired).id, parseApp(source).id);
  assert.ok(parseApp(repaired).html.startsWith(marker));
  assert.throws(() => parseApp(repaired.replace('</html>', '')));
  assert.throws(() => parseApp(source.replace('<html>', 'not html\n<html>')));
  assert.throws(() => parseApp(source.replace('<html>', '<!-- unclosed\n<html>')));
  const contexts = new RepairContexts(),
    app = parseApp(source),
    token = contexts.create('test', app, { qi: 1, chosen: -1 });
  const response = source.replace('<html>', `<!-- more-genui-repair: ${token} -->\n<html>`);
  assert.deepEqual(contexts.consume('test', parseApp(response), response), { qi: 1, chosen: -1 });
});
