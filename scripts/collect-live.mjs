import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseApp } from '../src/protocol.mjs';
await mkdir('tests/live/apps', { recursive: true });
const manifest = new Map();
for (const file of (await readdir('tests/live')).filter((f) => /^capture-.*json$/.test(f))) {
  const { sources } = JSON.parse(await readFile('tests/live/' + file, 'utf8'));
  for (const source of sources) {
    try {
      const app = parseApp(source);
      await writeFile('tests/live/apps/' + app.id + '.html', source);
      manifest.set(app.id, {
        id: app.id,
        title: app.title,
        characters: source.length,
        capture: file,
      });
    } catch (error) {
      console.error(file, error.message);
    }
  }
}
await writeFile('tests/live/manifest.json', JSON.stringify([...manifest.values()], null, 2));
console.log([...manifest.keys()].join(', '));
