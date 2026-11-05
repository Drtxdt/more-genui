import { readFile, writeFile } from 'node:fs/promises';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const browser = await read('test-results/results.json');
const protocol = await read('tests/live/independent/results.json');
const specs = [];
function visit(suite) {
  specs.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) visit(child);
}
visit(browser);
const samples = protocol.map((sample) => {
  const matches = specs.filter((spec) => spec.title.includes(`${sample.id}.html `));
  const tests = matches.flatMap((spec) => spec.tests);
  const projects = ['Chromium', 'Edge'].map((project) => ({
    project,
    passed: tests.some(
      (test) =>
        test.projectName === project &&
        test.status === 'expected' &&
        test.results.length === 1 &&
        test.results[0].status === 'passed',
    ),
  }));
  return {
    ...sample,
    projects,
    usable: sample.status === 'protocol-pass' && projects.every((x) => x.passed),
  };
});
const plain = [];
for (let index = 1; index <= 5; index++) {
  const capture = await read(`tests/live/plain-${index}.json`);
  plain.push({
    query: capture.query,
    codeBlocks: capture.codeBlocks,
    passed: capture.codeBlocks === 0,
  });
}
const report = {
  generatedAt: new Date().toISOString(),
  method:
    '20 individual requests, ten topics repeated in two conversations, frozen final prompt, no repairs or generation retries. Unmodified captured HTML tested in Chromium and Edge.',
  samples,
  plain,
  firstUsable: samples.filter((sample) => sample.usable).length,
  total: samples.length,
  threshold: 18,
  passed:
    samples.length === 20 &&
    samples.filter((sample) => sample.usable).length >= 18 &&
    plain.every((x) => x.passed),
  browserStats: browser.stats,
  harness: await read('docs/evidence/harness-e2e.json'),
};
await writeFile('docs/evidence/acceptance.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    firstUsable: report.firstUsable,
    total: report.total,
    plain: plain.filter((x) => x.passed).length,
    passed: report.passed,
    browserStats: report.browserStats,
  }),
);
if (!report.passed) process.exitCode = 1;
