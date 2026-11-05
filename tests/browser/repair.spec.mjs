import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('./http-cache-quiz.html', import.meta.url), 'utf8');
test('user repair with leading comment renders and advances through all quiz questions', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate((source) => window.show('cache-quiz', source), source);
  const frame = page.frameLocator('#app iframe');
  await expect(frame.locator('#q')).toContainText('第 1/3 题');
  await expect(frame.locator('#next')).toBeDisabled();
  for (let i = 0; i < 3; i++) {
    await expect(frame.locator('#q')).toContainText(`第 ${i + 1}/3 题`);
    await frame.locator('#opts button').nth(i).click();
    await expect(frame.locator('#step')).toContainText('回答正确');
    if (i < 2) await frame.locator('#next').click();
  }
  await expect(frame.locator('#next')).toBeHidden();
  await frame.locator('#reset').click();
  await expect(frame.locator('#q')).toContainText('第 1/3 题');
  await expect(frame.locator('#next')).toBeVisible();
  await expect(frame.locator('#next')).toBeDisabled();
});
