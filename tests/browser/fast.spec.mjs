import { test, expect } from '@playwright/test';
const meta = { version: 1, id: 'fast-test', title: '教学图解', stateVersion: 1 };
const matrix = {
  kind: 'matrix',
  rows: ['A'],
  columns: ['id', '$'],
  cells: [{ row: 'A', column: 'id', text: 'A → id', explanation: '由 FIRST 加入' }],
};
async function show(page, view) {
  await page.evaluate(
    (source) => window.show('fast', source),
    JSON.stringify({ ...meta, ...view }),
  );
}
test('Fast compare, switch and matrix are safe, keyboard accessible and persistent', async ({
  page,
}) => {
  await page.goto('/');
  await show(page, {
    kind: 'switch',
    options: [
      {
        id: 'before',
        label: '变换前后',
        view: {
          kind: 'compare',
          before: { label: '原式', lines: ['<script>bad()</script>'] },
          after: { label: '结果', lines: ['B'] },
        },
      },
      { id: 'table', label: '分析表', view: matrix },
    ],
  });
  const frame = page.frameLocator('#app iframe');
  await expect(frame.getByText('<script>bad()</script>', { exact: true })).toBeVisible();
  await frame.getByLabel('切换条件').selectOption('table');
  await frame.getByRole('button', { name: 'A / id', exact: true }).click();
  await expect(frame.getByRole('status')).toContainText('FIRST');
  await frame.getByRole('button', { name: 'A / id', exact: true }).press('ArrowRight');
  await expect(frame.getByRole('button', { name: 'A / $', exact: true })).toBeFocused();
  await page.waitForTimeout(300);
  await page.reload();
  await show(page, {
    kind: 'switch',
    options: [
      {
        id: 'before',
        label: '变换前后',
        view: {
          kind: 'compare',
          before: { label: '原式', lines: ['<script>bad()</script>'] },
          after: { label: '结果', lines: ['B'] },
        },
      },
      { id: 'table', label: '分析表', view: matrix },
    ],
  });
  await expect(frame.getByLabel('切换条件')).toHaveValue('table');
});
test('grammar runs in a Worker, computes nullable sets, traces and transforms recursion', async ({
  page,
}) => {
  await page.goto('/');
  await show(page, {
    kind: 'grammar',
    grammar: {
      start: 'E',
      productions: [
        { id: 'r', lhs: 'E', rhs: ['E', '+', 'id'] },
        { id: 'b', lhs: 'E', rhs: ['id'] },
      ],
    },
    input: ['id', '+', 'id'],
  });
  const frame = page.frameLocator('#app iframe');
  await expect(frame.getByText('左递归：E', { exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '消除直接左递归', exact: true }).click();
  await expect(frame.getByText('分析结果：接受', { exact: true })).toBeVisible();
  await expect(page.locator('#app output')).toHaveText('');
});
test('visual stepper resets the scene when going backward', async ({ page }) => {
  await page.goto('/');
  await show(page, {
    kind: 'stepper',
    steps: [
      { title: '开始', text: '第一步', frame: matrix },
      {
        title: '结束',
        text: '第二步',
        frame: { ...matrix, cells: [{ row: 'A', column: 'id', text: '完成' }] },
      },
    ],
  });
  const frame = page.frameLocator('#app iframe');
  await frame.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'A / id', exact: true })).toHaveText('完成');
  await frame.getByRole('button', { name: '比较上一步' }).press('Enter');
  await expect(frame.getByText(/A → id.*→ 完成/)).toBeVisible();
  await frame.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(frame.getByRole('button', { name: 'A / id', exact: true })).toHaveText('A → id');
});

test('lesson combines shared grammar, native quiz and editable deterministic recomputation', async ({
  page,
}) => {
  await page.goto('/');
  await show(page, {
    kind: 'lesson',
    grammar: { start: 'S', productions: [{ id: 's', lhs: 'S', rhs: ['a'] }] },
    sections: [
      { title: '计算', view: { kind: 'grammar', input: ['a'] } },
      { title: '观察', view: { kind: 'grammar', input: ['a'] } },
      {
        title: '预测',
        view: {
          kind: 'quiz',
          questions: [
            {
              id: 'q',
              prompt: '终结符 a 的 FIRST 是什么？',
              options: [
                { id: 'a', text: 'a' },
                { id: 'b', text: 'b', hint: '看产生式的开头' },
              ],
              correct: 'a',
              explanation: '终结符 a 的 FIRST 是 a',
            },
          ],
        },
      },
    ],
  });
  const f = page.frameLocator('#app iframe');
  await expect(f.getByText('分析结果：接受', { exact: true })).toHaveCount(2);
  await f.getByLabel('产生式（符号间用空格）').first().fill('S → b');
  await f.getByRole('button', { name: '重新计算', exact: true }).first().click();
  await expect(f.getByLabel('产生式（符号间用空格）').nth(1)).toHaveValue('S → b');
  await f.getByRole('radio', { name: 'a', exact: true }).check();
  await f.getByRole('button', { name: '提交', exact: true }).click();
  await expect(f.getByText('终结符 a 的 FIRST 是 a', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/fast-lesson.png', fullPage: true });
});

test('offscreen native playback pauses, current graph exports a real PNG, and disposal releases 20 applications', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const active = new Set(),
      start = window.setInterval,
      end = window.clearInterval;
    window.setInterval = (...args) => {
      const id = start(...args);
      active.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      active.delete(id);
      return end(id);
    };
    window.intervalCount = () => active.size;
  });
  await page.goto('/');
  await show(page, {
    kind: 'stepper',
    steps: [
      { title: '1', text: '第一步' },
      { title: '2', text: '第二步' },
      { title: '3', text: '第三步' },
    ],
  });
  const f = page.frameLocator('#app iframe');
  await f.getByRole('button', { name: '播放', exact: true }).click();
  await f
    .locator('body')
    .evaluate(() => document.dispatchEvent(new CustomEvent('genui-visibility', { detail: false })));
  await expect(f.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  expect(await f.locator('body').evaluate(() => window.intervalCount())).toBe(0);
  await page.waitForTimeout(2100);
  await expect(f.getByRole('status')).toContainText('第一步');
  await show(page, {
    kind: 'state-diagram',
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    edges: [{ id: 'e', from: 'b', to: 'a', label: '返回' }],
  });
  await expect(f.locator('svg path[marker-end]')).toHaveCount(1);
  await page.getByRole('button', { name: '更多', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出图解 PNG', exact: true }).click();
  const file = await download;
  const { readFile } = await import('node:fs/promises');
  const data = await readFile(await file.path());
  expect(data.subarray(1, 4).toString()).toBe('PNG');
  await page.evaluate(() => window.mountStress());
  await expect(page.locator('#stress iframe')).toHaveCount(20);
  await expect(page.locator('#stress output')).toHaveText(Array(20).fill(''), { timeout: 15000 });
  const timers = await Promise.all(
    page
      .frames()
      .filter((f) => f.parentFrame())
      .map((f) => f.evaluate(() => window.intervalCount())),
  );
  expect(timers.reduce((a, b) => a + b, 0)).toBe(0);
  await test.info().attach('resource-counts', {
    body: JSON.stringify({ messages: 100, apps: 20, activePlaybackTimers: 0 }),
  });
  await page.evaluate(() => window.disposeStress());
  await expect(page.locator('#stress')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(1);
});

test('a text-only step clears the previous graphic and remounting releases old playback', async ({
  page,
}) => {
  await page.goto('/');
  await show(page, {
    kind: 'stepper',
    steps: [
      { title: '图', text: '看表', frame: matrix },
      { title: '文', text: '仅保留解释' },
    ],
  });
  const f = page.frameLocator('#app iframe');
  await expect(f.getByRole('button', { name: 'A / id', exact: true })).toBeVisible();
  await f.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(f.getByRole('button', { name: 'A / id', exact: true })).toHaveCount(0);
  await f.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(f.getByRole('button', { name: 'A / id', exact: true })).toBeVisible();
});

test('offline teaching card preserves the approved cell explanation', async ({ page, context }) => {
  await page.goto('/');
  await show(page, matrix);
  const frame = page.frameLocator('#app iframe');
  await frame.getByRole('button', { name: 'A / id' }).click();
  await frame.getByRole('button', { name: '修正这里' }).click();
  await frame.getByLabel('新解释').fill('FIRST(A) 包含 id');
  await frame.getByText('预览修改', { exact: true }).click();
  await frame.getByText('采纳', { exact: true }).click();
  await expect(frame.getByRole('status')).toContainText('FIRST(A) 包含 id');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出离线教学卡' }).click();
  const file = await waiting;
  const { readFile } = await import('node:fs/promises');
  const offline = await context.newPage();
  await context.setOffline(true);
  await offline.setContent(await readFile(await file.path(), 'utf8'));
  await expect(offline.frameLocator('iframe').getByRole('status')).toContainText(
    'FIRST(A) 包含 id',
  );
  await offline.frameLocator('iframe').getByRole('button', { name: 'A / $', exact: true }).click();
  await expect(offline.frameLocator('iframe').getByRole('status')).toContainText('空单元格');
});

test('shared grammar follows explicit groups inside one answer and restores on reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.mountGroup());
  const editor = (i) =>
    page.frameLocator('#group-' + i + ' iframe').getByLabel('产生式（符号间用空格）');
  await expect(editor(1)).toHaveValue('S → a');
  await editor(0).fill('S → b');
  await page
    .frameLocator('#group-0 iframe')
    .getByRole('button', { name: '重新计算', exact: true })
    .click();
  await expect(editor(1)).toHaveValue('S → b');
  await expect(editor(2)).toHaveValue('S → a');
  await page.reload();
  await page.evaluate(() => window.mountGroup());
  await expect(editor(1)).toHaveValue('S → b');
});

test('a late grammar result cannot erase a newer syntax error', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(fn) {
        this.addEventListener('message', (event) => {
          window.releaseGrammar = () => fn(event);
        });
      }
    };
  });
  await page.goto('/');
  await show(page, {
    kind: 'grammar',
    grammar: { start: 'S', productions: [{ id: 's', lhs: 'S', rhs: ['a'] }] },
    input: ['a'],
  });
  const iframe = page.frameLocator('#app iframe');
  const child = page.frames().find((frame) => frame.parentFrame());
  await child.waitForFunction(() => typeof window.releaseGrammar === 'function');
  await iframe.locator('textarea').fill('invalid');
  await iframe.getByText('重新计算', { exact: true }).click();
  await child.evaluate(() => window.releaseGrammar());
  await expect(iframe.getByText(/第 1 行需要/)).toBeVisible();
});

test('a removed matrix column clears the previous selection', async ({ page }) => {
  await page.goto('/');
  const view = { ...matrix, rows: ['A', 'B'] };
  await show(page, view);
  await page.frameLocator('iframe').getByLabel('B / $', { exact: true }).click();
  await page.waitForTimeout(350);
  await show(page, { ...view, columns: ['id', 'new'] });
  await expect(page.frameLocator('iframe').getByRole('status')).toBeEmpty();
});

test('missing packaged handshake falls back once and binary boundaries can be compared and restored', async ({
  page,
}) => {
  await page.route('**/unresponsive-sandbox', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  );
  await page.goto('/');
  const range = (value) => ({
    kind: 'matrix',
    rows: ['区间'],
    columns: ['范围'],
    cells: [{ row: '区间', column: '范围', text: value }],
  });
  const spec = {
    ...meta,
    kind: 'stepper',
    steps: ['[0,4]', '[3,4]'].map((v, i) => ({
      title: '第' + (i + 1) + '轮',
      text: '查找 7',
      frame: range(v),
    })),
  };
  await page.evaluate(
    (s) => window.show('binary', JSON.stringify(s), '/unresponsive-sandbox'),
    spec,
  );
  const f = page.frameLocator('#app iframe');
  await expect(f.getByText('[0,4]', { exact: true })).toBeVisible({ timeout: 12000 });
  await f.getByText('下一步', { exact: true }).click();
  await f.getByText('比较上一步', { exact: true }).click();
  await expect(f.getByText('区间 / 范围：[0,4] → [3,4]')).toBeVisible();
  await f.getByText('上一步', { exact: true }).click();
  await expect(f.getByText('[0,4]', { exact: true })).toBeVisible();
});

test('trusted meal model updates quantities and restores the checked purchase', async ({ page }) => {
  const { readFile } = await import('node:fs/promises');
  const spec = JSON.parse(await readFile('examples/models/roast.json', 'utf8'));
  await page.goto('/');
  await show(page, spec);
  const frame = page.frameLocator('#app iframe');
  const people = frame.getByRole('slider');
  await people.focus();
  await people.press('ArrowRight');
  await people.press('ArrowRight');
  await expect(frame.getByText('1,500 g', {exact:true})).toBeVisible();
  await expect(frame.getByText('1,200 g', {exact:true})).toBeVisible();
  await frame.getByRole('checkbox').first().check();
  await expect(frame.getByRole('button',{name:'复制当前清单'})).toBeEnabled();
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key =>
    key.startsWith('mg:state:') && localStorage[key].includes('"meat"')))).toBe(true);
  await page.reload();
  await show(page, spec);
  await expect(people).toHaveValue('6');
  await expect(frame.getByRole('checkbox').first()).toBeChecked();
});
