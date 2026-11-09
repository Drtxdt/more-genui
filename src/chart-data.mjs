import { z } from 'zod';

const number = z.number().finite().min(-1e15).max(1e15);
const label = z.string().min(1).max(128);
const point = z
  .object({
    x: number,
    y: number,
    low: number.optional(),
    high: number.optional(),
    group: label.optional(),
  })
  .strict()
  .refine(
    (p) => (p.low === undefined && p.high === undefined) || (p.low <= p.y && p.y <= p.high),
    '区间须含有中心值和两个边界',
  );
export const chartSchema = z
  .object({
    kind: z.literal('chart'),
    style: z.enum(['line', 'bar', 'scatter', 'histogram']),
    xLabel: label,
    yLabel: label,
    points: z.array(point).min(1).max(2000).optional(),
    sample: z
      .object({
        seed: z.number().int().min(0).max(4294967295),
        count: z.number().int().min(1).max(2000),
        meanOf: z.number().int().min(1).max(128),
      })
      .strict()
      .optional(),
    bins: z.number().int().min(1).max(64).optional(),
  })
  .strict()
  .refine((s) => !!s.points !== !!s.sample, '选择一份数据或一个均匀抽样实验');

export function sampleMeans(sample, seed) {
  let state = seed >>> 0;
  return Array.from({ length: sample.count }, (_, i) => {
    let sum = 0;
    for (let j = 0; j < sample.meanOf; j++) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      sum += state / 4294967296;
    }
    return { x: i + 1, y: sum / sample.meanOf };
  });
}

export function chartRows(points, { group, aggregation = 'raw', bins = 10, histogram = false }) {
  const rows = group ? points.filter((p) => p.group === group) : points;
  if (!rows.length) return [];
  if (histogram) {
    const values = rows.map((p) => p.y),
      min = Math.min(...values),
      max = Math.max(...values);
    if (min === max) return [{ x: min, y: rows.length, end: max }];
    const width = (max - min) / bins;
    const buckets = Array.from({ length: bins }, (_, i) => ({
      x: min + i * width,
      end: i === bins - 1 ? max : min + (i + 1) * width,
      y: 0,
    }));
    for (const v of values) buckets[Math.min(bins - 1, Math.floor((v - min) / width))].y++;
    return buckets;
  }
  if (aggregation === 'raw') return rows;
  const groups = new Map();
  for (const p of rows) {
    const agg = groups.get(p.x) ?? { sum: 0, count: 0 };
    agg.sum += p.y;
    agg.count++;
    groups.set(p.x, agg);
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([x, v]) => ({ x, y: aggregation === 'sum' ? v.sum : v.sum / v.count }));
}
