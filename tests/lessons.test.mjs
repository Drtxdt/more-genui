import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parseFast } from '../src/fast-schema.mjs';
import { determinize } from '../src/automata.mjs';

test('course templates validate and epsilon cycles produce finite equivalent subsets', async () => {
  for (const name of await readdir('examples/lessons')) {
    const { spec } = parseFast(await readFile('examples/lessons/' + name, 'utf8'));
    if (spec.kind !== 'automaton') continue;
    const { subsets, moves } = determinize(spec);
    assert.deepEqual(
      subsets.map((s) => s.members),
      [['q0', 'q1'], ['q2'], []],
    );
    for (const word of ['', 'a', 'aa', 'aaa']) {
      let state = 'D0';
      for (const symbol of word)
        state = moves.find((m) => m.from === state && m.symbol === symbol).to;
      assert.equal(subsets.find((s) => s.id === state).accepting, word === 'a');
    }
  }
});
