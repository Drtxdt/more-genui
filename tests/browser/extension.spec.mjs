import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
let context, page;
const source = (await readFile('examples/wave.html', 'utf8')).trim();
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main id="messages" class="ds-message"><div class="ds-assistant-message-main-content"></div></main><textarea placeholder="给 DeepSeek 发送消息 " aria-label="输入"></textarea><button data-testid="send-button">发送</button><script>document.querySelector('button').onclick=async()=>{const input=document.querySelector('textarea');const prompt=input.value;input.value='';const response=await fetch(new Request('/api/v0/chat/completion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,chat_session_id:'fixture'})}));await response.text();};</script></body></html>`;
test.beforeEach(async ({}, info) => {
  const path = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(
    await mkdtemp(resolve(tmpdir(), 'more-genui-test-')),
    {
      channel: info.project.name === 'Edge' ? 'msedge' : 'chromium',
      headless: true,
      timeout: 15000,
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    },
  );
  await context.route('https://chat.deepseek.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  page = await context.newPage();
  await page.goto('https://chat.deepseek.com/a/chat/fixture');
  await expect(page.locator('#more-genui-toggle')).toHaveAttribute('aria-pressed', 'true');
});
test.afterEach(async () => {
  await context?.close();
});
for (const transport of ['fetch', 'xhr'])
  test(transport + ' repairs preserve parameters', async () => {
    if (transport === 'xhr')
      await page.evaluate(() => {
        document.querySelector('[data-testid=send-button]').onclick = () => {
          const input = document.querySelector('textarea');
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/v0/chat/completion');
          xhr.send(JSON.stringify({ prompt: input.value }));
          input.value = '';
        };
      });
    let sent;
    await context.route('**/api/v0/chat/completion', async (route) => {
      sent = route.request().postDataJSON();
      const token = /本次修复标识：([a-f0-9-]+)/.exec(sent.prompt)?.[1];
      const output = token
        ? source.replace('</html>', '<!-- more-genui-repair: ' + token + ' --></html>')
        : source;
      await route.fulfill({
        contentType: 'text/event-stream',
        body:
          'data: ' +
          JSON.stringify({
            p: 'response/content',
            o: 'APPEND',
            v: '```genui-html\n' + output + '\n```\n',
          }) +
          '\n\n',
      });
    });
    await page.getByLabel('输入').fill('解释正弦波');
    await page.getByTestId('send-button').click();
    await expect.poll(() => sent?.prompt).toContain('[More GenUI v1]');
    expect(sent.prompt.match(/\[More GenUI v1\]/g)).toHaveLength(1);
    await page.evaluate((source) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'md-code-block';
      const pre = document.createElement('pre');
      pre.textContent = source;
      wrapper.append(pre);
      document.querySelector('.ds-assistant-message-main-content').append(wrapper);
    }, source);
    const frame = page.frameLocator('.more-genui-surface iframe');
    await expect(frame.getByLabel('振幅')).toBeVisible();
    await frame.getByLabel('振幅').fill('1.8');
    await frame.getByLabel('振幅').dispatchEvent('input');
    await page.waitForTimeout(250);
    await page.locator('#more-genui-toggle').click();
    await expect(page.locator('.more-genui-surface')).toHaveCount(0);
    await page.locator('#more-genui-toggle').click();
    await expect(frame.getByLabel('振幅')).toHaveValue('1.8');
    await page.getByRole('button', { name: '修复', exact: true }).click();
    await expect.poll(() => sent.prompt).toContain('请修复应用');
    const token = /本次修复标识：([a-f0-9-]+)/.exec(sent.prompt)[1];
    await page.evaluate(
      (source) => {
        const pre = document.createElement('pre');
        pre.textContent = source;
        document.querySelector('.ds-assistant-message-main-content').append(pre);
      },
      source.replace('</html>', '<!-- more-genui-repair: ' + token + ' --></html>'),
    );
    await expect(page.locator('.more-genui-surface iframe')).toHaveCount(2);
    await expect(
      page.frameLocator('.more-genui-surface iframe').last().getByLabel('振幅'),
    ).toHaveValue('1.8');
    await page.screenshot({
      path: `test-results/${test.info().project.name}-extension.png`,
      fullPage: true,
    });
  });
test('unfinished streaming documents never execute; plain prose and disabled mode stay ordinary', async () => {
  await page.evaluate((source) => {
    window.postMessage({ type: 'more-genui-start', id: 'test' }, location.origin);
    const pre = document.createElement('pre');
    pre.textContent = source;
    const wrapper = document.createElement('div');
    wrapper.className = 'md-code-block';
    wrapper.append(pre);
    document.querySelector('.ds-assistant-message-main-content').append(wrapper);
  }, source);
  await page.waitForTimeout(250);
  await expect(page.locator('.more-genui-surface')).toHaveCount(0);
  await page.evaluate(() =>
    window.postMessage({ type: 'more-genui-end', id: 'test' }, location.origin),
  );
  await page.waitForTimeout(250);
  await expect(page.locator('.more-genui-surface')).toHaveCount(0);
  await page.evaluate(
    (source) =>
      window.postMessage({ type: 'more-genui-source', id: 'test', source }, location.origin),
    source,
  );
  await expect(page.locator('.more-genui-surface iframe')).toHaveCount(1);
  await page.locator('#more-genui-toggle').click();
  let sent;
  await context.route('**/api/v0/chat/completion', (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ contentType: 'text/plain', body: '普通文字' });
  });
  await page.getByLabel('输入').fill('你好');
  await page.getByTestId('send-button').click();
  await expect.poll(() => sent?.prompt).toBe('你好');
});

test('XHR transport rewrites only known prompt fields and decodes official BATCH events', async () => {
  let sent;
  await context.route('**/api/v0/chat/completion', (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      contentType: 'text/event-stream',
      body:
        'data: ' +
        JSON.stringify({ v: { response: { fragments: [{ type: 'RESPONSE', content: '' }] } } }) +
        '\n\n' +
        'data: ' +
        JSON.stringify({
          p: 'response',
          o: 'BATCH',
          v: [{ p: 'fragments/-1/content', o: 'APPEND', v: '```genui-html\n' + source + '\n```' }],
        }) +
        '\n\n',
    });
  });
  const response = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v0/chat/completion');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = () => resolve(xhr.responseText);
        xhr.onerror = reject;
        xhr.send(JSON.stringify({ prompt: 'XHR example', chat_session_id: 'fixture' }));
      }),
  );
  expect(sent.prompt).toContain('[More GenUI v1]');
  expect(response).toContain('fragments');
  await page.evaluate((source) => {
    const block = document.createElement('div');
    block.className = 'md-code-block';
    const pre = document.createElement('pre');
    pre.textContent = source;
    block.append(pre);
    document.querySelector('.ds-assistant-message-main-content').append(block);
  }, source);
  await expect(page.frameLocator('.more-genui-surface iframe').getByLabel('振幅')).toBeVisible();
  await context.route('**/api/v0/chat/continue', (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
  });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v0/chat/continue');
        xhr.onload = resolve;
        xhr.send(JSON.stringify({ message_id: 7 }));
      }),
  );
  expect(sent).toEqual({ message_id: 7 });
});

test('navigation duplicates are never folded or modified', async () => {
  const { GUIDE } = await import('../../src/protocol.mjs');
  await page.evaluate((guide) => {
    const text = '解释波形\n' + guide;
    const user = document.createElement('div');
    user.className = 'ds-message';
    user.innerHTML = '<div class="user-body"></div>';
    user.firstChild.textContent = text;
    document.querySelector('main').after(user);
    const nav = document.createElement('aside');
    nav.id = 'official-nav';
    nav.innerHTML = '<div class="_72b6158"></div><div class="_8fcd755"></div>';
    for (const el of nav.children) el.textContent = text;
    document.body.append(nav);
  }, GUIDE);
  await expect(page.locator('.more-genui-guidance')).toHaveCount(1);
  await expect(page.locator('#official-nav .more-genui-guidance')).toHaveCount(0);
  await expect(page.locator('#official-nav ._72b6158')).toBeVisible();
  await page.locator('#more-genui-toggle').click();
  await expect(page.locator('.more-genui-guidance')).toHaveCount(0);
  await expect(page.locator('.user-body')).toBeVisible();
});

test('cancelled output requires current-source approval and old-route events cannot run it', async () => {
  await page.evaluate((source) => {
    window.postMessage(
      { type: 'more-genui-start', id: 'cancel', route: location.pathname },
      location.origin,
    );
    setTimeout(() => {
      const pre = document.createElement('pre');
      pre.id = 'cancelled';
      pre.textContent = source;
      document.querySelector('.ds-assistant-message-main-content').append(pre);
    }, 20);
  }, source);
  await page.waitForTimeout(180);
  await page.evaluate(() =>
    window.postMessage(
      { type: 'more-genui-end', id: 'cancel', status: 'cancelled', route: location.pathname },
      location.origin,
    ),
  );
  const run = page.getByRole('button', { name: '未确认输出边界 · 运行此应用' });
  await expect(run).toBeVisible();
  await page.evaluate(
    () =>
      (document.querySelector('#cancelled').textContent = document
        .querySelector('#cancelled')
        .textContent.replace('</html>', '')),
  );
  await expect(run).toHaveCount(0);
  await expect(page.locator('.more-genui-surface')).toHaveCount(0);
  await page.evaluate(
    (source) => (document.querySelector('#cancelled').textContent = source),
    source,
  );
  await expect(run).toBeVisible();
  await run.click();
  await expect(page.locator('.more-genui-surface iframe')).toHaveCount(1);
  await page.evaluate((source) => {
    document.querySelector('.ds-assistant-message-main-content').replaceChildren();
    history.pushState({}, '', '/a/chat/other');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.postMessage(
      { type: 'more-genui-start', id: 'new', route: location.pathname },
      location.origin,
    );
    setTimeout(() => {
      const pre = document.createElement('pre');
      pre.textContent = source;
      document.querySelector('.ds-assistant-message-main-content').append(pre);
      window.postMessage(
        { type: 'more-genui-source', id: 'cancel', route: '/a/chat/fixture', source },
        location.origin,
      );
    }, 30);
  }, source);
  await page.waitForTimeout(200);
  await expect(page.locator('.more-genui-surface')).toHaveCount(0);
});

test('same IDs in separate messages stay isolated and stable messages restore after rebuild', async () => {
  await page.evaluate((source) => {
    document.querySelector('#messages').outerHTML = ['a', 'b']
      .map(
        (id) =>
          '<article class="ds-message" data-virtual-list-item-key="' +
          id +
          '"><div class="ds-assistant-message-main-content"><pre></pre></div></article>',
      )
      .join('');
    document.querySelectorAll('pre').forEach((pre) => (pre.textContent = source));
  }, source);
  await expect(page.locator('.more-genui-surface iframe')).toHaveCount(2);
  const a = page.frameLocator('[data-virtual-list-item-key=a] iframe'),
    b = page.frameLocator('[data-virtual-list-item-key=b] iframe');
  await a.getByLabel('振幅').fill('1.8');
  await a.getByLabel('振幅').dispatchEvent('input');
  await expect(b.getByLabel('振幅')).toHaveValue('1');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const old = document.querySelector('[data-virtual-list-item-key=a]');
    const copy = old.cloneNode(true);
    copy.querySelectorAll('.more-genui-surface').forEach((n) => n.remove());
    copy.querySelector('pre').style.display = '';
    old.replaceWith(copy);
  });
  await expect(a.getByLabel('振幅')).toHaveValue('1.8');
});

