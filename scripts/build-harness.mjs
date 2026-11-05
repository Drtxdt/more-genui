import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('packages/harness/lib', { recursive: true });
await build({
  entryPoints: ['packages/harness/src/index.ts'],
  outfile: 'packages/harness/lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['@deepseek-ai/*'],
  minify: false,
});
const result = await build({
  entryPoints: ['packages/harness/src/client.tsx'],
  write: false,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  minify: false,
});
await writeFile(
  'packages/harness/lib/client.js',
  `window.__ModuleLoader__.load({id:'more-genui-harness',factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`,
);
