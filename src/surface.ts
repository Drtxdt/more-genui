import { createElement, Maximize, Ellipsis } from 'lucide';
import { parseApp, safeState } from './protocol.mjs';
import { StateRepository } from './state.mjs';
import sandboxHTML from './generated-sandbox';
export interface SurfaceOptions {
  source: string;
  scope: string;
  instance: string;
  repository: StateRepository;
  sandboxUrl?: string;
  theme?: () => 'light' | 'dark';
  draft: (text: string) => void | Promise<void>;
  repair: (text: string) => void | Promise<void>;
}
export function mountSurface(host: HTMLElement, options: SurfaceOptions) {
  const resolvedTheme = () =>
    options.theme?.() ??
    (document.documentElement.dataset.theme === 'light' ||
    getComputedStyle(document.documentElement).colorScheme === 'light'
      ? 'light'
      : undefined) ??
    (document.body.hasAttribute('data-ds-dark-theme') ||
    document.documentElement.classList.contains('dark') ||
    document.documentElement.dataset.theme === 'dark' ||
    getComputedStyle(document.documentElement).colorScheme === 'dark'
      ? 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
  const app = parseApp(options.source);
  let dirty = 0,
    saved = 0,
    stateLoaded = false,
    disposed = false,
    state: Record<string, unknown> = {},
    error = '',
    frame: HTMLIFrameElement | undefined,
    channel: MessageChannel | undefined,
    timeout: ReturnType<typeof setTimeout>,
    generation = 0,
    saveTimer: ReturnType<typeof setTimeout> | undefined;
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{display:block;margin:14px 0;font:14px/1.5 system-ui}*{box-sizing:border-box}section{border:1px solid #8b92a644;border-radius:14px;background:Canvas;color:CanvasText;overflow:hidden}header{padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #8b92a633}strong{margin-right:auto}button{font:inherit;border:1px solid #8b92a655;border-radius:7px;padding:4px 9px;background:Canvas;color:CanvasText;cursor:pointer}button:hover{background:color-mix(in srgb,CanvasText 8%,Canvas)}button:disabled{opacity:.5;cursor:wait}iframe{display:block;width:100%;height:360px;border:0;background:Canvas}section:popover-open{position:fixed;inset:3vh 3vw;width:94vw;height:94vh;max-height:94vh;margin:0;overflow:auto}section:popover-open iframe{min-height:70vh}section::backdrop{background:#0008}pre{white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;padding:12px}output{display:block;padding:0 12px;color:#b45309}details{border-top:1px solid #8883;padding:8px}summary{cursor:pointer}';
  const panel = document.createElement('section'),
    bar = document.createElement('header'),
    title = document.createElement('strong'),
    status = document.createElement('output');
  title.textContent = app.title;
  title.hidden = true;
  bar.append(title);
  const menu = document.createElement('details');
  const menuSummary = document.createElement('summary');
  menuSummary.setAttribute('aria-label', '更多');
  menuSummary.title = '更多';
  menuSummary.append(createElement(Ellipsis));
  menu.append(menuSummary);
  bar.append(menu);
  panel.append(bar, status);
  style.textContent +=
    ':host{margin:12px 0}section{border:0;border-radius:8px}header{justify-content:flex-end;border:0;padding:2px;gap:2px}header svg{width:16px;height:16px}header button,header summary{border:0;background:transparent;padding:6px;border-radius:6px;cursor:pointer}header details{position:relative;border:0;padding:0}header details>summary{list-style:none}header details[open]{border:1px solid #8883;background:Canvas;padding:4px;z-index:2}header details>button{display:block;width:100%;text-align:left}iframe{height:48px}button:focus-visible,summary:focus-visible{outline:2px solid Highlight;outline-offset:2px}';
  root.append(style, panel);
  const keysPromise = options.repository.keys(options.scope, options.instance, app, options.source);
  const setStatus = (text: string) => {
    if (!disposed) status.textContent = text;
  };
  const save = () => {
    if (!stateLoaded || dirty === saved) return Promise.resolve();
    const revision = dirty,
      snapshot = state;
    return keysPromise
      .then((keys) => options.repository.save(keys, snapshot))
      .then(() => {
        saved = revision;
      })
      .catch((e) => setStatus(`保存失败：${e.message}`));
  };
  const button = (label: string, action: () => void | Promise<void>) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.type = 'button';
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await action();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        b.disabled = false;
      }
    };
    if (label === '放大') {
      b.replaceChildren(createElement(Maximize));
      b.setAttribute('aria-label', label);
      b.title = label;
      bar.insertBefore(b, menu);
    } else menu.append(b);
    return b;
  };
  button('放大', () => {
    if (panel.matches(':popover-open')) {
      panel.hidePopover();
      panel.removeAttribute('popover');
    } else {
      panel.setAttribute('popover', 'manual');
      panel.showPopover();
    }
  });
  button('继续询问', () =>
    options.draft(`请进一步解释“${app.title}”。当前参数：\n${JSON.stringify(state)}`),
  );
  button('修复', () =>
    options.repair(
      `请修复应用 ${app.id}（${app.title}），保留完整 genui-html 协议，兼容时保留 stateVersion。\n错误：${error || '请检查交互与计算逻辑'}\n当前参数：${JSON.stringify(state)}\n原源码：\n${options.source}`,
    ),
  );
  const details = document.createElement('details'),
    summary = document.createElement('summary'),
    pre = document.createElement('pre');
  summary.textContent = '查看源码';
  pre.textContent = options.source;
  details.append(summary, pre);
  menu.append(details);
  function start() {
    if (disposed) return;
    const current = ++generation;
    clearTimeout(timeout);
    channel?.port1.close();
    frame?.remove();
    error = '';
    setStatus('启动中…');
    const next = document.createElement('iframe');
    frame = next;
    next.title = app.title;
    next.sandbox.add('allow-scripts');
    next.referrerPolicy = 'no-referrer';
    if (options.sandboxUrl) next.src = options.sandboxUrl;
    else next.srcdoc = sandboxHTML;
    channel = new MessageChannel();
    const connection = channel;
    let loaded = false;
    connection.port1.onmessage = (e) => {
      if (disposed || current !== generation) return;
      const message = e.data;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'state') {
        try {
          const nextState = safeState(message.value);
          if (JSON.stringify(nextState) !== JSON.stringify(state)) {
            state = nextState;
            dirty++;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => void save(), 200);
          }
        } catch (e) {
          setStatus(String(e));
        }
      } else if (
        message.type === 'resize' &&
        typeof message.value === 'number' &&
        Number.isFinite(message.value)
      )
        next.style.height = `${Math.min(1000, Math.max(24, message.value))}px`;
      else if (message.type === 'error') {
        clearTimeout(timeout);
        error = String(message.value).slice(0, 2000);
        setStatus(`运行错误：${error}`);
        const fix = document.createElement('button');
        fix.textContent = '修复';
        fix.onclick = () => {
          menu.open = true;
          const action = [...menu.querySelectorAll('button')].find((b) => b.textContent === '修复');
          action?.click();
        };
        status.append(fix);
      } else if (message.type === 'ready') {
        clearTimeout(timeout);
        if (!error) setStatus('');
      }
    };
    next.onload = () => {
      if (loaded) {
        setStatus('应用发生了不支持的导航，已停止');
        next.remove();
        connection.port1.close();
        return;
      }
      loaded = true;
      next.contentWindow?.postMessage(
        { type: 'more-genui-init', html: app.html, state, theme: resolvedTheme() },
        '*',
        [connection.port2],
      );
    };
    panel.append(next);
    timeout = setTimeout(() => setStatus('启动超时，可点击重新运行或修复'), 8000);
  }
  button('重置', async () => {
    clearTimeout(saveTimer);
    state = {};
    await options.repository.reset(await keysPromise);
    start();
  });
  button('重新运行', () => start());
  button('停止', () => {
    clearTimeout(timeout);
    channel?.port1.close();
    frame?.remove();
    frame = undefined;
    setStatus('已停止，参数已保留');
    void save();
  });
  const media = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => {
    panel.style.colorScheme = resolvedTheme();
    channel?.port1.postMessage({ type: 'theme', value: resolvedTheme() });
  };
  media.addEventListener('change', theme);
  const themeObserver = new MutationObserver(theme);
  for (const element of [document.documentElement, document.body])
    themeObserver.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-ds-dark-theme'],
    });
  theme();
  keysPromise
    .then((keys) => options.repository.load(keys))
    .then((value) => {
      if (!disposed) {
        state = value;
        stateLoaded = true;
        start();
      }
    })
    .catch((e) => setStatus(`读取状态失败：${e.message}`));
  return {
    theme,
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(timeout);
      clearTimeout(saveTimer);
      themeObserver.disconnect();
      media.removeEventListener('change', theme);
      channel?.port1.close();
      frame?.remove();
      void save();
      root.replaceChildren();
    },
  };
}
