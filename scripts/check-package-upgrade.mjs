import '../tests/browser/environment.mjs';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, readFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const [oldDir, newDir, channel = 'chromium'] = process.argv.slice(2);
const root = await mkdtemp(join(tmpdir(), 'genui-upgrade-'));
const ext = join(root, 'extension'),
  profile = join(root, 'profile');
const source = await readFile('examples/wave.html', 'utf8');
for (const [i, dir] of [oldDir, newDir].entries()) {
  await cp(resolve(dir), ext, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel,
    headless: true,
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext],
  });
  try {
    await context.route('https://chat.deepseek.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main class="ds-message" data-virtual-list-item-key="7"><div class="ds-assistant-message-main-content"></div></main><textarea placeholder="给 DeepSeek 发送消息 "></textarea>',
      }),
    );
    const page = await context.newPage();
    await page.goto('https://chat.deepseek.com/a/chat/fixture');
    await expect(page.locator('#more-genui-toggle')).toBeVisible();
    await page.evaluate((source) => {
      const pre = document.createElement('pre');
      pre.dataset.language = 'genui-html';
      pre.textContent = source;
      document.querySelector('.ds-assistant-message-main-content').append(pre);
    }, source);
    const slider = page.frameLocator('.more-genui-surface iframe').getByLabel('振幅');
    if (!i) {
      await slider.fill('1.8');
      await slider.dispatchEvent('input');
      await page.waitForTimeout(500);
    }
    await expect(slider).toHaveValue('1.8');
    console.log(channel, i ? 'upgraded: amplitude 1.8' : 'installed: amplitude 1.8');
  } finally {
    await context.close();
  }
}
