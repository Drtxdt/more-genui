import { performance } from 'node:perf_hooks';
import { writeFile, readFile } from 'node:fs/promises';
import { FenceScanner } from '../src/fences.mjs';
import { fencedSources } from '../src/protocol.mjs';
const source = (await readFile('examples/data-exploration.html', 'utf8')).trim();
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
for (const count of [1, 10]) {
  const reply = ('explanation line\n'.repeat(1500) + '```genui-html\n' + source + '\n```\n').repeat(
    count,
  );
  const times = { baseline: [], incremental: [] };
  for (let repeat = 0; repeat < 7; repeat++)
    for (const name of Object.keys(times)) {
      const scanner = new FenceScanner(() => {}),
        start = performance.now();
      for (let end = 512; end < reply.length + 512; end += 512) {
        const text = reply.slice(0, end);
        if (name === 'baseline') fencedSources(text);
        else scanner.update(text, true);
      }
      times[name].push(performance.now() - start);
    }
  rows.push({
    apps: count,
    characters: reply.length,
    chunkSize: 512,
    baselineMedianMs: median(times.baseline),
    incrementalMedianMs: median(times.incremental),
  });
}
await writeFile(
  'docs/evidence/v0.3-parser-benchmark.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      node: process.version,
      scope:
        'Parser-only, fixed synthetic reply, seven runs; excludes model/network/DOM/iframe cost.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(rows);
