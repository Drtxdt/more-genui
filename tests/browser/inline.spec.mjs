import { test, expect } from '@playwright/test';
test('compact static visual, accessible menu, theme and same-frame enlargement', async ({
  page,
}) => {
  await page.goto('/');
  const source =
    '<!-- more-genui: {"version":1,"id":"compact","title":"关系示意","stateVersion":1} -->\n<html><body><div class="row"><span>输入</span><span>→</span><span>输出</span></div></body></html>';
  await page.evaluate((source) => window.show('compact', source), source);
  const frame = page.frameLocator('#app iframe');
  await expect(frame.getByText('输入', { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await page.locator('#app iframe').boundingBox()).height)
    .toBeLessThan(200);
  await frame.locator('body').evaluate((el) => (el.dataset.instance = 'same'));
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(frame.locator('body')).toHaveAttribute('data-instance', 'same');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续询问', exact: true })).toBeVisible();
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  const toolbar = page.getByRole('group', { name: '应用操作' });
  await expect(toolbar.getByRole('button')).toHaveCount(7);
  expect((await toolbar.boundingBox()).height).toBeLessThan(50);
  await page.getByRole('button', { name: '查看源码', exact: true }).click();
  await expect(page.locator('#app pre')).toBeVisible();
  expect((await toolbar.boundingBox()).height).toBeLessThan(50);
  await page.getByRole('button', { name: '查看源码', exact: true }).click();
  await page.screenshot({ path: 'docs/evidence/v0.2.1-toolbar.png' });
});
