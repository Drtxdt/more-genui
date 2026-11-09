import { readFile, readdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
const directory = 'examples/community';
for (const filename of await readdir(directory)) {
  const name = filename.split('.')[0],
    source = await readFile(directory + '/' + filename, 'utf8');
  test('community example ' + name, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(([name, source]) => window.show(name, source), [name, source]);
    const f = page.frameLocator('#app iframe'),
      btn = (label) => f.getByRole('button', { name: label, exact: true });
    switch (name) {
      case 'bike':
        await btn('刹车').press('Enter');
        await expect(f.getByRole('paragraph').last()).toContainText('减速');
        break;
      case 'road-trip':
        await btn('3. 午餐停靠').click();
        await expect(f.getByText(/位置待定/)).toBeVisible();
        break;
      case 'wardrobe':
        await f.getByRole('combobox').selectOption('weekend');
        await expect(f.getByLabel(/白 T 恤/)).toBeVisible();
        break;
      case 'roast':
        await f.getByRole('combobox').selectOption('n6');
        await f.getByLabel(/羊排.*1500/).check();
        await expect(f.getByLabel(/羊排.*1500/)).toBeChecked();
        break;
      case 'gdp':
        await f.getByText('计入', { exact: true }).first().click();
        await btn('提交').click();
        await expect(f.getByText(/当期国内最终产品计入/)).toBeVisible();
        break;
      case 'monty':
        await btn('门 1').click();
        await btn('换门').click();
        await expect(btn('重放本局')).toBeVisible();
        await btn('重放本局').click();
        await expect(btn('留下')).toBeVisible();
        break;
      case 'clt':
        await f.getByLabel('每组样本量').fill('100');
        await expect(f.locator('output')).toContainText('0.0289');
        break;
      case 'drone':
        await f.getByLabel(/高度/).fill('200');
        await expect(f.locator('output')).toContainText('230.94');
        break;
      case 'bill':
        await expect(f.locator('output')).toContainText('乙 30.72');
        await f.locator('fieldset').nth(1).getByLabel('甲').check();
        await expect(f.locator('output')).toContainText('乙 19.84');
        break;
      case 'savings':
        await f.getByLabel(/收益率/).fill('0');
        await expect(f.locator('output')).toContainText('增长 0.00，总额 180000.00');
        break;
      case 'arcade':
        for (const game of ['贪吃蛇', '打砖块', 'Pong']) {
          await f.getByRole('combobox').selectOption({ label: game });
          await btn('开始 / 暂停').click();
          await expect(f.locator('output')).toContainText('进行中');
          await btn('重新开始').click();
          await expect(f.locator('output')).toContainText('已暂停');
        }
        break;
    }
  });
}
