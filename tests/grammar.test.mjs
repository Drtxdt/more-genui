import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGrammar, traceGrammar, eliminateDirectLeftRecursion } from '../src/grammar.mjs';
const grammar = {
  start: 'S',
  productions: [
    { id: 's', lhs: 'S', rhs: ['A', 'B'] },
    { id: 'a', lhs: 'A', rhs: ['id'] },
    { id: 'ae', lhs: 'A', rhs: [] },
    { id: 'b', lhs: 'B', rhs: ['b'] },
    { id: 'be', lhs: 'B', rhs: [] },
  ],
};
test('nullable sequences propagate FIRST and FOLLOW without splitting id', () => {
  const a = analyzeGrammar(grammar);
  assert.deepEqual(new Set(a.first.S), new Set(['id', 'b', 'ε']));
  assert.deepEqual(new Set(a.follow.A), new Set(['b', '$']));
  assert.equal(a.conflicts.length, 0);
  assert.equal(traceGrammar(grammar, ['id', 'b']).status, 'accepted');
  assert.equal(traceGrammar(grammar, []).status, 'accepted');
  assert.equal(traceGrammar(grammar, ['b', 'id']).status, 'rejected');
});
test('FIRST/FOLLOW conflicts retain all provenance and refuse deterministic parsing', () => {
  const g = {
    start: 'S',
    productions: [
      { id: 's', lhs: 'S', rhs: ['A', 'a'] },
      { id: 'a', lhs: 'A', rhs: ['a'] },
      { id: 'e', lhs: 'A', rhs: [] },
    ],
  };
  const a = analyzeGrammar(g);
  assert.equal(a.conflicts.length, 1);
  assert.deepEqual(
    a.table.A.a.map((e) => e.reasons[0]),
    ['FIRST', 'FOLLOW'],
  );
  assert.equal(traceGrammar(g, ['a']).status, 'not-ll1');
});
test('direct transformation preserves base and indirect cycles are detected', () => {
  const g = {
    start: 'E',
    productions: [
      { id: 'r', lhs: 'E', rhs: ['E', '+', 'id'] },
      { id: 'b', lhs: 'E', rhs: ['id'] },
    ],
  };
  assert.deepEqual(analyzeGrammar(g).leftRecursive, ['E']);
  const transformed = eliminateDirectLeftRecursion(g);
  assert.equal(traceGrammar(transformed, ['id', '+', 'id']).status, 'accepted');
  assert.deepEqual(analyzeGrammar(transformed).leftRecursive, []);
  assert.throws(() =>
    eliminateDirectLeftRecursion({ start: 'A', productions: [{ id: 'a', lhs: 'A', rhs: ['A'] }] }),
  );
  assert.equal(
    analyzeGrammar({
      start: 'A',
      productions: [
        { id: 'a', lhs: 'A', rhs: ['B'] },
        { id: 'b', lhs: 'B', rhs: ['A'] },
      ],
    }).leftRecursive.length,
    2,
  );
});
test('symbol names cannot collide with Object prototype and duplicate productions fail', () => {
  assert.deepEqual(
    analyzeGrammar({ start: 'S', productions: [{ id: 's', lhs: 'S', rhs: ['toString'] }] }).first.S,
    ['toString'],
  );
  assert.throws(() =>
    analyzeGrammar({ ...grammar, productions: [...grammar.productions, grammar.productions[0]] }),
  );
});
