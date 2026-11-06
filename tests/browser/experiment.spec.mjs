import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('lock A, apply preset to B, export actual results and restore snapshot', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.show('perimeter'));
  const frame = page.frameLocator('#app iframe');
  await expect(frame.locator('output')).toContainText('25');
  if (!await page.getByRole('button', {name:'实验工具',exact:true}).first().isVisible()) await page.getByRole('button', {name:'更多',exact:true}).first().click();
  await page.getByRole('button', { name: '实验工具' }).click();
  await page.getByLabel('快照名称').fill('正方形');
  await page.getByText('保存快照', { exact: true }).click();
  await page.getByText('锁定 A', { exact: true }).click();
  await page.getByText('应用预设', { exact: true }).click();
  await expect(frame.locator('output')).toContainText('21');
  const row = page.getByRole('row').filter({ hasText: '面积 cm²' });
  await expect(row.getByRole('cell')).toHaveText(['面积 cm²', '25', '21', '-4']);
  for (const [label, expected] of [
    ['JSON', '"width": 7'],
    ['CSV', '"7","3","21"'],
    ['PNG', 'PNG'],
  ]) {
    const download = page.waitForEvent('download');
    await page.getByText('导出 ' + label, { exact: true }).click();
    const file = await download;
    expect(
      (await readFile(await file.path())).toString(label === 'PNG' ? 'latin1' : 'utf8'),
    ).toContain(expected);
  }
  await page.reload();
  await page.evaluate(() => window.show('perimeter'));
  await expect(frame.locator('output')).toContainText('21');
  if (!await page.getByRole('button', {name:'实验工具',exact:true}).first().isVisible()) await page.getByRole('button', {name:'更多',exact:true}).first().click();
  await page.getByRole('button', { name: '实验工具' }).click();
  await page.getByText('恢复', { exact: true }).click();
  await expect(frame.locator('output')).toContainText('25');
});
