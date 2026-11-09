import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFast } from '../src/fast-schema.mjs';
import { calculateModel } from '../src/numeric-model.mjs';

async function example(name) {
  return parseFast(await readFile('examples/models/' + name + '.json', 'utf8')).spec;
}
test('six numerical tasks calculate in their declared units', async () => {
  assert.deepEqual(calculateModel(await example('roast'), { people: 6 }), {
    meat: 1500,
    veg: 1200,
  });
  const bill = await example('bill');
  const split = calculateModel(bill);
  assert.deepEqual([split.a, split.b, split.total], [8.96, 30.72, 39.68]);
  assert.equal(calculateModel(bill, { tip: 0 }).total, 33.48);
  for (let cents = 1; cents < 150; cents++) {
    const result = calculateModel(bill, { pizza: cents / 100 });
    assert.equal(
      Math.round(result.a * 100) + Math.round(result.b * 100),
      Math.round(result.total * 100),
    );
  }
  assert.equal(calculateModel(await example('savings'), { rate: 0 }).total, 180000);
  assert.equal(calculateModel(await example('area')).area, 1);
  assert.equal(calculateModel(await example('budget')).left, 90);
  const ohm = await example('ohm');
  assert.equal(calculateModel(ohm).current, 1.5);
  assert.throws(() => calculateModel(ohm, { resistance: 0 }), /零/);
  assert.throws(() => calculateModel(ohm, { voltage: 241 }), /范围/);
  for (const [args, unit] of [
    [['missing', 'resistance'], 'A'],
    [['current', 'resistance'], 'A'],
    [['voltage', 'resistance'], 'g'],
  ]) {
    assert.throws(() => calculateModel({ ...ohm, outputs: [{ ...ohm.outputs[0], args, unit }] }));
  }
});
