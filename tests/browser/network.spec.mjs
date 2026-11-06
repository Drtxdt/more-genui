import { authorizedExtension } from './authorized-extension.mjs';
import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('source fetch rejects public hostname resolving to loopback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'genui-net-'));
  const openssl =
    process.platform === 'win32'
      ? join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'openssl.exe')
      : 'openssl';
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=source.example.com',
      '-keyout',
      'key.pem',
      '-out',
      'cert.pem',
      '-days',
      '1',
    ],
    { cwd: dir, stdio: 'pipe' },
  );
  const hits = [];
  const server = createServer(
    { key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) },
    (req, res) => {
      hits.push(req.url);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('ok');
    },
  );
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  let ctx;
  try {
    const path = await authorizedExtension();
    ctx = await chromium.launchPersistentContext(join(dir, 'profile'), {
      channel: 'chromium',
      args: [
        '--no-proxy-server',
        '--ignore-certificate-errors',
        '--host-resolver-rules=MAP source.example.com 127.0.0.1:' + server.address().port,
        '--disable-extensions-except=' + path,
        '--load-extension=' + path,
      ],
    });
    const setupWorker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
    await setupWorker.evaluate(() =>
      chrome.storage.local.set({ sourceMode: 'images', previewImages: true }),
    );
    const page = await ctx.newPage();
    await page.goto('https://source.example.com/control');
    expect(hits).toContain('/control');
    await ctx.route('https://chat.deepseek.com/**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<main class="ds-message"><div class="ds-assistant-message-main-content"></div></main>',
      }),
    );
    await page.goto('https://chat.deepseek.com/a/chat/net');
    await expect(page.locator('#more-genui-toggle')).toHaveAttribute('aria-pressed', 'true');
    const worker = ctx.serviceWorkers()[0];
    await worker.evaluate(() => {
      const real = self.fetch;
      self.fetch = async (...args) => {
        try {
          return await real(...args);
        } finally {
          self.finishedURL = String(args[0]);
        }
      };
    });
    await page.evaluate(() => {
      for (const event of [
        { type: 'more-genui-start' },
        { type: 'more-genui-identity', key: '2' },
        { type: 'more-genui-search', sources: [{ url: 'https://source.example.com/probe' }] },
      ])
        window.postMessage({ ...event, id: 'net' }, location.origin);
    });
    await expect.poll(() => worker.evaluate(() => self.finishedURL)).toContain('/probe');
    expect(hits).not.toContain('/probe');
  } finally {
    await ctx?.close();
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  }
});
