import '../tests/browser/environment.mjs';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const rows = await page.evaluate(() => {
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return [1, 10].map((apps) => {
    document.body.innerHTML = Array.from(
      { length: 100 },
      (_, i) =>
        '<article class="ds-message"><div class="ds-assistant-message-main-content">' +
        ('<p>' + 'explanation '.repeat(100) + '</p>').repeat(10) +
        (i >= 100 - apps ? '<pre>&lt;!-- more-genui: {} --&gt;</pre>' : '') +
        '</div></article>',
    ).join('');
    const changed = document.querySelector('.ds-message:last-child');
    const times = { full: [], changed: [] };
    let visited = {};
    for (let repeat = 0; repeat < 11; repeat++)
      for (const mode of Object.keys(times)) {
        const start = performance.now();
        let count = 0;
        for (let i = 0; i < 200; i++) {
          const roots = mode === 'full' ? document.querySelectorAll('.ds-message') : [changed];
          for (const root of roots) {
            for (const el of root.querySelectorAll('pre,p,div')) {
              void el.textContent;
              count++;
            }
          }
        }
        times[mode].push((performance.now() - start) / 200);
        visited[mode] = count / 200;
      }
    return {
      apps,
      messages: 100,
      fullMedianMs: median(times.full),
      changedMedianMs: median(times.changed),
      nodesVisited: visited,
    };
  });
});
await browser.close();
await writeFile(
  'docs/evidence/v0.3-dom-benchmark.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      scope:
        'Synthetic DOM text scans only; full conversation versus one changed message; excludes discovery, rendering, network and model latency.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(rows);
