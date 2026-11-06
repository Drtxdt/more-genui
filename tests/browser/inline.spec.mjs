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
  await expect(toolbar.getByRole('button')).toHaveCount(8);
  expect((await toolbar.boundingBox()).height).toBeLessThan(50);
  await page.getByRole('button', { name: '查看源码', exact: true }).click();
  await expect(page.locator('#app pre')).toBeVisible();
  expect((await toolbar.boundingBox()).height).toBeLessThan(50);
  await page.getByRole('button', { name: '查看源码', exact: true }).click();
  await page.screenshot({ path: 'test-results/inline-toolbar.png' });
});

test('local forms survive and long content expands without remounting', async ({ page }) => {
  await page.goto('/');
  const source =
    '<!-- more-genui: {"version":1,"id":"form-long","title":"本地表单","stateVersion":1} --><html><body><form id="f"><label>数值<input id="n" type="number" value="2"></label><button>计算</button><output id="answer"></output></form><div style="height:1600px">长内容</div><script>document.getElementById("f").onsubmit=e=>{e.preventDefault();document.getElementById("answer").textContent=Number(document.getElementById("n").value)*2}</script></body></html>';
  await page.evaluate((source) => window.show('form-long', source), source);
  const frame = page.frameLocator('#app iframe');
  await frame.getByRole('button', { name: '计算' }).click();
  await expect(frame.locator('#answer')).toHaveText('4');
  await frame.locator('body').evaluate((el) => (el.dataset.identity = 'original'));
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await expect(frame.locator('body')).toHaveAttribute('data-identity', 'original');
  await expect(page.getByRole('button', { name: '收起', exact: true })).toBeVisible();
});
