import './environment.mjs';
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(process.env.DSH_TEST_URL, { waitUntil: 'networkidle' });
  if (await page.getByText('请选择模型', { exact: true }).count()) {
    await page.getByText('请选择模型', { exact: true }).click();
    await page.getByText('More GenUI fixture (no network)', { exact: true }).click();
  }
  await page
    .getByRole('textbox', { name: '描述你想要构建的内容, / 调用指令, @ 文件或对话' })
    .fill('Render the offline GenUI acceptance fixture.');
  await page
    .getByRole('textbox', { name: '描述你想要构建的内容, / 调用指令, @ 文件或对话' })
    .press('Enter');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByLabel('振幅')).toBeVisible({ timeout: 20000 });
  await frame.locator('body').evaluate((el) => (el.dataset.testInstance = 'same'));
  await frame.getByLabel('振幅').fill('1.6');
  await frame.getByLabel('振幅').dispatchEvent('input');
  await expect(
    page.getByText('Fixture complete: local tool result rendered.', { exact: true }),
  ).toBeVisible();
  await expect(frame.locator('body')).toHaveAttribute('data-test-instance', 'same');
  await expect(frame.getByLabel('振幅')).toHaveValue('1.6');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(frame.getByLabel('振幅')).toHaveValue('1.6');
  await page.screenshot({ path: 'docs/evidence/harness-e2e.png', fullPage: true });
  await writeFile(
    'docs/evidence/harness-e2e.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          'tool execution',
          'client node rendering',
          'same instance across turn close',
          'state restore after refresh',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Harness end-to-end passed');
} catch (error) {
  await page.screenshot({ path: 'docs/evidence/harness-e2e-failure.png', fullPage: true });
  console.log(
    JSON.stringify({
      error: error.message,
      errors,
      text: (await page.locator('body').innerText()).slice(-5000),
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
