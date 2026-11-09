import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSchema, chartRows, sampleMeans } from '../src/chart-data.mjs';

test('sampling is reproducible and histogram bins conserve the full sample', () => {
  const spec = { count: 100, meanOf: 3 };
  const rows = sampleMeans(spec, 42);
  assert.deepEqual(rows, sampleMeans(spec, 42));
  assert.notDeepEqual(rows, sampleMeans(spec, 41));
  const bins = chartRows(rows, { histogram: true, bins: 8 });
  assert.equal(
    bins.reduce((n, b) => n + b.y, 0),
    100,
  );
  assert.equal(bins.at(-1).end, Math.max(...rows.map((p) => p.y)));
});
test('filtering precedes aggregation and intervals must bracket the value', () => {
  const rows = [
    { x: 1, y: 2, group: 'A' },
    { x: 1, y: 4, group: 'A' },
    { x: 1, y: 30, group: 'B' },
  ];
  assert.deepEqual(chartRows(rows, { group: 'A', aggregation: 'mean' }), [{ x: 1, y: 3 }]);
  assert.throws(() =>
    chartSchema.parse({
      kind: 'chart',
      style: 'scatter',
      xLabel: 'x',
      yLabel: 'y',
      points: [{ x: 1, y: 2, low: 3, high: 4 }],
    }),
  );
});
