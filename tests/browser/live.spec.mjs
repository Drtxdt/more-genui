import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
for (const file of (await readdir('tests/live/apps')).filter((x) => x.endsWith('.html'))) {
  test(`real DeepSeek output: ${file} runs, changes state and survives recreation`, async ({
    page,
  }) => {
    const source = await readFile('tests/live/apps/' + file, 'utf8');
    await page.goto('/');
    await page.evaluate((source) => window.show('live', source), source);
    const frame = page.frameLocator('#app iframe');
    await expect(frame.locator('body')).toBeVisible();
    await expect(page.locator('#app output')).toHaveText('', { timeout: 10000 });
    const initialState = await frame.locator('body').evaluate(() => window.genui.getState());
    const inputs = frame.locator('input[type=range],input[type=number]');
    let interacted = false;
    if (await inputs.count()) {
      const input = inputs.first();
      const value = await input.inputValue(),
        min = +((await input.getAttribute('min')) ?? '0'),
        max = +((await input.getAttribute('max')) ?? '10'),
        step = +((await input.getAttribute('step')) ?? '1');
      const next = +value + step <= max ? +value + step : Math.max(min, +value - step);
      await input.fill(String(next));
      await input.dispatchEvent('input');
      await input.dispatchEvent('change');
      await expect(input).toHaveValue(String(next));
      interacted = true;
    } else {
      const buttons = frame.getByRole('button').filter({ hasText: /下一步|单步|一步|Step|开始/ });
      if (await buttons.count()) {
        await buttons.first().click();
        interacted = true;
      }
    }
    expect(interacted).toBe(true);
    expect(await frame.locator('body').evaluate(() => window.genui.getState())).not.toEqual(
      initialState,
    );
    await page.waitForTimeout(300);
    await expect(page.locator('#app output')).toHaveText('');
    const persisted = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith('mg:state:'))
        .map(([, v]) => JSON.parse(v)),
    );
    expect(persisted.some((x) => Object.keys(x).length > 0)).toBe(true);
    await page.getByRole('button', { name: '继续询问', exact: true }).click();
    const before = await page.getByLabel('草稿').inputValue();
    await page.evaluate((source) => window.show('live', source), source);
    await expect(page.locator('#app output')).toHaveText('');
    await page.getByLabel('草稿').fill('');
    await page.getByRole('button', { name: '继续询问', exact: true }).click();
    await expect(page.getByLabel('草稿')).toHaveValue(before);
    if (file === 'wave-1.html')
      await page.screenshot({
        path: `test-results/${test.info().project.name}-real-deepseek.png`,
        fullPage: true,
      });
  });
}

test('real examples calculate electrical and geometric results and complete sorting', async ({
  page,
}) => {
  await page.goto('/');
  const show = async (file) => {
    const source = await readFile('tests/live/apps/' + file, 'utf8');
    await page.evaluate((source) => window.show('math', source), source);
  };
  const f = page.frameLocator('#app iframe');
  await show('ohm-1.html');
  await f.getByLabel('电压', { exact: true }).fill('12');
  await f.getByLabel('电压', { exact: true }).dispatchEvent('input');
  await expect(f.locator('#info')).toHaveText('电流 I = U/R = 1.20 A，功率 P = UI = 14.4 W。');
  await show('sort-2.html');
  for (let i = 0; i < 20; i++) await f.getByRole('button', { name: /单步/ }).click();
  await expect(f.locator('#status')).toContainText('排序完成');
  const values = await f.locator('#bars').innerText();
  const numbers = values.trim().split(/\s+/).map(Number);
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
});
