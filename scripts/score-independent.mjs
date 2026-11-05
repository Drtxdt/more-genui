import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parseApp } from '../src/protocol.mjs';
const tasks = JSON.parse(await readFile('tests/live/independent/tasks.json', 'utf8')),
  results = [];
for (const task of tasks) {
  let capture;
  try {
    capture = JSON.parse(await readFile('tests/live/independent/' + task.id + '.json', 'utf8'));
  } catch {
    results.push({ id: task.id, status: 'pending' });
    continue;
  }
  try {
    if (capture.sources.length !== 1) throw Error('Expected exactly one application');
    const app = parseApp(capture.sources[0]);
    if (app.id !== task.id) throw Error('Unexpected application identity');
    await writeFile('tests/live/apps/' + task.id + '.html', capture.sources[0]);
    results.push({ id: task.id, status: 'protocol-pass', characters: capture.sources[0].length });
  } catch (error) {
    results.push({ id: task.id, status: 'protocol-fail', error: error.message });
  }
}
await writeFile('tests/live/independent/results.json', JSON.stringify(results, null, 2));
console.log(
  JSON.stringify({
    pass: results.filter((x) => x.status === 'protocol-pass').length,
    fail: results.filter((x) => x.status === 'protocol-fail').length,
    pending: results.filter((x) => x.status === 'pending').length,
  }),
);
