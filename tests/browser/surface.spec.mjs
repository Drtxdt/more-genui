import { test, expect } from '@playwright/test';
const frame = (page) => page.frameLocator('#app iframe');
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(frame(page).getByLabel('振幅')).toBeVisible();
});
test('slider persists after refresh, enlargement keeps same running document', async ({ page }) => {
  const slider = frame(page).getByLabel('振幅');
  await slider.fill('1.7');
  await slider.dispatchEvent('input');
  await expect(frame(page).locator('#a')).toHaveText('1.7');
  await frame(page)
    .locator('body')
    .evaluate((el) => (el.dataset.instance = 'original'));
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect(frame(page).locator('body')).toHaveAttribute('data-instance', 'original');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(frame(page).getByLabel('振幅')).toHaveValue('1.7');
  await page.getByRole('button', { name: '继续询问' }).click();
  await expect(page.getByLabel('草稿')).toContainText('');
  await expect(page.getByLabel('草稿')).toHaveValue(/"amplitude":1.7/);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-wave.png`,
    fullPage: true,
  });
});
test('spring mathematics and bubble sorting execute with native event handlers', async ({
  page,
}) => {
  await page.getByRole('button', { name: '弹簧', exact: true }).click();
  await expect(frame(page).locator('#value')).toHaveText('位移 x = 1.000 m');
  await frame(page).getByLabel('时间').fill('1.55');
  await frame(page).getByLabel('时间').dispatchEvent('input');
  await expect(frame(page).locator('#value')).toHaveText(/-0.999/);
  await page.getByRole('button', { name: '排序', exact: true }).click();
  for (let i = 0; i < 28; i++) await frame(page).getByRole('button', { name: '下一步' }).click();
  await expect(frame(page).locator('#status')).toHaveText('排序完成：1, 2, 3, 4, 5, 6, 7, 8');
});
test('sandbox blocks parent access and fetch, errors are actionable, reset and stop work', async ({
  page,
}) => {
  const source =
    '<!-- more-genui: {"version":1,"id":"security","title":"Security","stateVersion":1} -->\n<html><body><output id="result"></output><script>let isolated=false;try{parent.document.body}catch{isolated=true}fetch("https://example.com/private").then(()=>document.getElementById("result").textContent="leaked").catch(()=>document.getElementById("result").textContent=isolated?"blocked":"parent leaked");</script></body></html>';
  await page.evaluate((source) => window.show('security', source), source);
  await expect(frame(page).locator('#result')).toHaveText('blocked');
  await page.evaluate(() =>
    window.show(
      'error',
      '<!-- more-genui: {"version":1,"id":"error","title":"Error","stateVersion":1} --><html><body><script>throw Error("broken example")</script></body></html>',
    ),
  );
  await expect(page.locator('#app output')).toHaveText(/broken example/);
  await page.locator('#app output').getByRole('button', { name: '修复', exact: true }).click();
  await expect(page.getByLabel('草稿')).toHaveValue(/broken example/);
  if (!await page.getByRole('button', {name:'停止',exact:true}).first().isVisible()) await page.getByRole('button', {name:'更多',exact:true}).first().click();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.locator('#app iframe')).toHaveCount(0);
});

test('reset, schema change, theme and source updates remain isolated', async ({ page }) => {
  await frame(page).getByLabel('振幅').fill('1.9');
  await frame(page).getByLabel('振幅').dispatchEvent('input');
  await page.waitForTimeout(250);
  if (!await page.getByRole('button', {name:'重置',exact:true}).first().isVisible()) await page.getByRole('button', {name:'更多',exact:true}).first().click();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(frame(page).getByLabel('振幅')).toHaveValue('1');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect(frame(page).locator('html')).toHaveAttribute('data-theme', 'dark');
  await frame(page).getByLabel('振幅').fill('1.5');
  await frame(page).getByLabel('振幅').dispatchEvent('input');
  await page.waitForTimeout(250);
  await page.evaluate(async () =>
    window.show(
      'wave',
      (await (await fetch('/examples/wave.html')).text()).replace(
        '"stateVersion":1',
        '"stateVersion":2',
      ),
    ),
  );
  await expect(frame(page).getByLabel('振幅')).toHaveValue('1');
});
test('iframe ignores forged window messages and reports external script requests', async ({
  page,
}) => {
  await page.evaluate(() => window.postMessage({ type: 'state', value: { amplitude: 2 } }, '*'));
  await expect(frame(page).getByLabel('振幅')).toHaveValue('1');
  await page.evaluate(() =>
    window.show(
      'external',
      '<!-- more-genui: {"version":1,"id":"external","title":"External","stateVersion":1} --><html><body><script src="https://example.com/evil.js"></script></body></html>',
    ),
  );
  await expect(page.locator('#app output')).toHaveText(/External scripts/);
});

test('controls become interactive only after the first frame sizing receipt', async ({page}) => {
  await page.route('**/delayed-size', route => route.fulfill({contentType:'text/html',body:
    '<button>0%</button><output>416129</output><script>onmessage=e=>{const port=e.ports[0];if(e.data.type==="more-genui-connect"){port.postMessage("booted");return}window.measure=()=>port.postMessage({type:"resize",value:460});document.querySelector("button").onclick=()=>document.querySelector("output").value="180000";port.postMessage({type:"ready"})}</script>'
  }));
  await page.evaluate(() => window.show('wave', undefined, '/delayed-size'));
  const iframe = page.locator('#app iframe');
  const card = frame(page);
  await expect.poll(() => card.locator('body').evaluate(() => typeof window.measure)).toBe('function');
  await expect(iframe).toBeHidden();
  await card.locator('body').evaluate(() => window.measure());
  await card.getByRole('button',{name:'0%'}).click();
  await expect(card.locator('output')).toHaveText('180000');
});
