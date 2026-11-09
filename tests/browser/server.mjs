import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['tests/browser/fixture.ts'],
  bundle: true,
  write: false,
  format: 'esm',
});
createServer(async (req, res) => {
  try {
    if (req.url === '/fixture.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(bundle.outputFiles[0].text);
    } else if (req.url?.startsWith('/examples/')) {
      res.end(await readFile('.' + req.url));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><html><head><meta charset="utf-8"><title>More GenUI 验收台</title></head><body style="margin:24px auto;max-width:1000px;background:#f5f6fa"><h1>More GenUI · 交互验收</h1><nav><button onclick="show(\'wave\')">正弦波</button><button onclick="show(\'spring\')">弹簧</button><button onclick="show(\'sort\')">排序</button></nav><main id="app"></main><textarea aria-label="草稿" style="width:100%;height:70px"></textarea><script type="module" src="/fixture.js"></script></body></html>',
      );
    }
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(Number(process.env.GENUI_TEST_PORT || 4183), '127.0.0.1');
