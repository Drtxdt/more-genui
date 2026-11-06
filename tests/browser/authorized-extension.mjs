import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// A disposable pre-authorized installation fixture. Never changes the production manifest.
// Production optional permission denial/revocation is tested separately.
export async function authorizedExtension() {
  const dir = await mkdtemp(join(tmpdir(), 'genui-authorized-fixture-'));
  await cp(resolve('.output/chrome-mv3'), dir, { recursive: true });
  const file = join(dir, 'manifest.json'),
    manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.host_permissions = ['https://*/*'];
  await writeFile(file, JSON.stringify(manifest));
  return dir;
}
