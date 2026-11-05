import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('.cache', { recursive: true });
const moduleURL = pathToFileURL(resolve('tests/harness-provider.mjs')).href;
await writeFile(
  '.cache/harness-fixture.patch.yml',
  `- insert:\n    - id: more-genui-offline-fixture\n      name: ${JSON.stringify(moduleURL)}\n`,
);
console.log(resolve('.cache/harness-fixture.patch.yml'));
