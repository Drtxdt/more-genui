import { test, expect } from '@playwright/test';
test('prediction exercises resume feedback, retry, reveal, advance and finish', async ({
  page,
}) => {
  await page.goto('/');
  const show = (name) => page.evaluate((name) => window.show(name), name);
  await show('cache-prediction');
  const frame = page.frameLocator('#app iframe'),
    btn = (name) => frame.getByRole('button', { name, exact: true }),
    choose = (text) => frame.getByRole('radio', { name: text, exact: true }).check();
  await expect(btn('提交')).toBeDisabled();
  await choose('发送条件请求');
  await btn('提交').click();
  await expect(frame.getByRole('status')).toContainText('先比较');
  await expect
    .poll(() =>
      page.evaluate(() => Object.values(localStorage).some((v) => v.includes('"phase":"hint"'))),
    )
    .toBe(true);
  await page.reload();
  await show('cache-prediction');
  await expect(frame.getByRole('status')).toContainText('先比较');
  await btn('再试一次').click();
  await expect(btn('提交')).toBeDisabled();
  await choose('直接用缓存');
  await btn('提交').click();
  await btn('下一题').click();
  await choose('一定返回 304');
  await btn('提交').click();
  await btn('查看解析').click();
  await expect(frame.getByRole('status')).toContainText('If-None-Match');
  await btn('下一题').click();
  await choose('200 和新的响应体');
  await btn('提交').click();
  await expect(frame.getByRole('status')).toContainText('已完成');
  await btn('重新开始').click();
  await expect(frame.locator('legend')).toContainText('第 1/3 题');
  await show('binary-prediction');
  await choose('[3, 4]');
  await btn('提交').click();
  await expect(btn('重新开始')).toBeVisible();
  const source = await (await page.request.get('/examples/binary-prediction.html')).text();
  await page.evaluate(
    (s) => window.show('bad', s.replace('"correct": "right"', '"correct": "missing"')),
    source,
  );
  await expect(frame.getByText(/第 1 题.*正确答案必须/)).toBeVisible();
  await expect(page.locator('#app output').getByRole('button', { name: '修复' })).toBeVisible();
});
