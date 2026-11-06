import { test, expect } from '@playwright/test';
test('multiple, number and ordering retain first attempts and review only mistakes', async ({
  page,
}) => {
  await page.goto('/');
  const config = {
    id: 'test',
    questions: [
      {
        id: 'm',
        type: 'multiple',
        prompt: '偶数',
        options: [
          { id: 'a', text: '2' },
          { id: 'b', text: '4' },
        ],
        correct: ['a', 'b'],
        hint: '两个都是偶数',
        explanation: '均可整除二',
      },
      {
        id: 'n',
        type: 'number',
        prompt: '面积',
        correct: 21,
        tolerance: 0.1,
        unit: 'm²',
        hint: '乘两边长',
        explanation: '7×3',
      },
      {
        id: 'o',
        type: 'order',
        prompt: '升序',
        options: [
          { id: 'a', text: '大' },
          { id: 'b', text: '小' },
        ],
        correct: ['b', 'a'],
        hint: '小的在前',
        explanation: '由小到大',
      },
    ],
  };
  const html =
    '<!-- more-genui: {"version":1,"id":"mix","title":"练习","stateVersion":1} -->\n<html><body><main></main><script>genui.quiz.mount(document.querySelector("main"),' +
    JSON.stringify(config) +
    ')</script></body></html>';
  await page.evaluate((s) => window.show('mix', s), html);
  const f = page.frameLocator('#app iframe'),
    btn = (name) => f.getByRole('button', { name, exact: true });
  await f.getByLabel('2', { exact: true }).check();
  await btn('提交').click();
  await expect(f.getByRole('status')).toContainText('两个都是偶数');
  await btn('查看解析').click();
  await btn('下一题').click();
  await f.getByRole('spinbutton').fill('21.05');
  await btn('提交').click();
  await btn('下一题').click();
  await btn('上移').nth(1).click();
  await btn('提交').click();
  await expect(f.getByRole('status')).toContainText('首答正确 2/3');
  await btn('只练错题').click();
  await expect(f.locator('legend')).toContainText('偶数');
  const steps = html.replace(
    /genui.quiz.mount[^]*?<\/script>/,
    'genui.stepper.mount(document.querySelector("main"),{id:"binary",steps:[{title:"检查中点",text:"5 < 7"},{title:"收缩区间",text:"[3,4]"}]})</script>',
  );
  await page.evaluate((s) => window.show('steps', s), steps);
  await btn('下一步').click();
  await expect(f.getByRole('status')).toContainText('[3,4]');
  await expect
    .poll(() =>
      page.evaluate(() => Object.values(localStorage).some((v) => v.includes('__moreGenuiSteps'))),
    )
    .toBe(true);
  await page.reload();
  await page.evaluate((s) => window.show('steps', s), steps);
  await expect(f.getByRole('status')).toContainText('[3,4]');
});

test('repair metadata preserves the capability gate before any app script runs', async ({ page }) => {
  await page.goto('/');
  const html = '<!-- more-genui: {"version":1,"id":"gate","title":"Gate","stateVersion":1} -->'
    + '<!-- more-genui-repair: abc --><!-- more-genui-requires: {"quiz":99} -->'
    + '<html><body><script>document.body.textContent="unexpected execution"</script></body></html>';
  await page.evaluate((s) => window.show('gate', s), html);
  await expect(page.locator('#app output')).toContainText('quiz@99');
  await expect(page.frameLocator('#app iframe').locator('body')).not.toContainText('unexpected execution');
});
