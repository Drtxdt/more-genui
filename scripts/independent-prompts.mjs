import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { GUIDE } from '../src/protocol.mjs';
const tasks = JSON.parse(await readFile('tests/live/tasks.json', 'utf8'));
await mkdir('tests/live/independent', { recursive: true });
const manifest = [];
for (let run = 1; run <= 2; run++)
  for (const [topic, label] of tasks) {
    const id = `final-${topic}-${run}`;
    const query = `请解释“${label}”，给一个能够操作控件、实时观察结果的独立交互实验，并写清假设。应用id请使用 ${id}。本次只需这个应用，不要参考之前题目的状态。`;
    const item = { index: manifest.length, id, topic, run, query, prompt: query + '\n\n' + GUIDE };
    manifest.push(item);
    await writeFile(`tests/live/independent/${id}.prompt.txt`, item.prompt);
  }
await writeFile('tests/live/independent/tasks.json', JSON.stringify(manifest, null, 2));
