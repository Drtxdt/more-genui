import { parseRenderable as parseApp } from './renderable.mjs';
import {
  createElement,
  Maximize,
  SlidersHorizontal,
  MessageCircle,
  Wrench,
  Code,
  RotateCcw,
  RefreshCw,
  Square,
  MoreHorizontal,
  Bookmark,
  Undo2, Redo2, Accessibility,
} from 'lucide';
import { safeState } from './protocol.mjs';
import { StateRepository } from './state.mjs';
import { appParams, experimentPanel } from './experiment-panel.mjs';
import sandboxHTML from './generated-sandbox';
const groupEvents = new EventTarget();
export interface SurfaceOptions {
  bookmark?: (state: Record<string,unknown>) => Promise<void>;
  refreshDataset?: (id: string) => Promise<unknown>;
  answerId?: string;
  source: string;
  format?: 'html' | 'fast';
  diagnostic?: (stage: string) => void;
  initialState?: Record<string, unknown>;
  scope: string;
  instance: string;
  repository: StateRepository;
  sandboxUrl?: string;
  theme?: () => 'light' | 'dark';
  draft: (text: string) => void | Promise<void>;
  repair: (
    text: string,
    context: { app: ReturnType<typeof parseApp>; state: Record<string, unknown> },
  ) => void | Promise<void>;
}
export function mountSurface(host: HTMLElement, options: SurfaceOptions) {
  const parsedGroup = parseApp(options.source, options.format);
  const parameter =
    parsedGroup.spec?.kind === 'switch'
      ? 'choice'
      : ['grammar', 'lesson'].includes(parsedGroup.spec?.kind)
        ? 'grammar'
        : '';
  const groupKey =
    parameter && parsedGroup.group && options.answerId
      ? 'mg:group:' +
        JSON.stringify([options.scope, options.answerId, parsedGroup.group, parameter])
      : '';
  const grammarPath = parsedGroup.spec?.kind === 'lesson' ? '__fast/grammar' : '__fast';
  function applyShared(value: Record<string, unknown>) {
    if (parameter === 'choice') {
      if (parsedGroup.spec.options.some((o: { id: string }) => o.id === value.choice))
        state = safeState({ ...state, __fast: value.choice });
      return;
    }
    const grammar = value.grammar;
    state = safeState({
      ...state,
      [grammarPath]: { ...(state[grammarPath] as Record<string, unknown>), grammar },
    });
  }
  function receiveGrammar(event: Event) {
    const update = (event as CustomEvent).detail;
    if (update.sender === host || disposed || !stateLoaded) return;
    applyShared(update.value);
    dirty++;
    start();
    void save();
  }
  if (groupKey) groupEvents.addEventListener(groupKey, receiveGrammar);
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
  const app = parseApp(options.source, options.format);
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
  style.textContent = `
:host{display:block;margin:12px 0;font:14px/1.5 system-ui}*{box-sizing:border-box}
section{border:0;border-radius:8px;background:Canvas;color:CanvasText;overflow:hidden}
header{display:flex;align-items:center;justify-content:safe flex-end;gap:2px;height:36px;padding:2px;overflow-x:auto}
button{font:inherit;border:1px solid #8b92a655;border-radius:7px;padding:4px 9px;background:Canvas;color:CanvasText;cursor:pointer}
button:hover{background:color-mix(in srgb,CanvasText 8%,Canvas)}button:disabled{opacity:.5;cursor:wait}
button:focus-visible{outline:2px solid Highlight;outline-offset:2px}
header button{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;padding:6px;border:0;border-radius:6px;background:transparent}
header svg{width:16px;height:16px}iframe{display:block;width:100%;height:48px;border:0;background:Canvas}
section:popover-open{position:fixed;inset:3vh 3vw;width:94vw;height:94vh;max-height:94vh;margin:0;overflow:auto}
[hidden]{display:none!important}section::backdrop{background:#0008}pre{white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;padding:12px}
pre[hidden]{display:none}output{display:block;padding:0 12px;color:#b45309}
`;
  const panel = document.createElement('section'),
    bar = document.createElement('header'),
    title = document.createElement('strong'),
    status = document.createElement('output');
  title.textContent = app.title;
  title.hidden = true;
  bar.append(title);
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '应用操作');
  panel.append(bar, status);
  const viewport = document.createElement('div');
  viewport.style.overflow = 'hidden';
  const expand = document.createElement('button');
  expand.textContent = '展开全部';
  expand.hidden = true;
  let expanded = false;
  expand.onclick = () => {
    expanded = !expanded;
    viewport.style.maxHeight = expanded ? '' : '1200px';
    expand.textContent = expanded ? '收起' : '展开全部';
  };
  panel.append(viewport, expand);
  root.append(style, panel);
  let revision = '';
  const keysPromise = options.repository.keys(
    app.spec ? options.scope + ':fast' : options.scope,
    options.instance,
    app,
    options.source,
  );
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
  const overflow = document.createElement('div');
  overflow.hidden = true;
  overflow.setAttribute('role', 'group');
  overflow.setAttribute('aria-label', '更多应用操作');
  overflow.style.cssText = 'display:flex;flex:none;align-items:center;gap:2px';
  panel.insertBefore(overflow, status);
  let actionCount = 0;
  const button = (label: string, icon: typeof Maximize, action: () => void | Promise<void>) => {
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
    b.replaceChildren(createElement(icon));
    b.setAttribute('aria-label', label);
    b.title = label;
    (actionCount++ < 2 ? bar : overflow).append(b);

    return b;
  };
  button('放大', Maximize, () => {
    if (panel.matches(':popover-open')) {
      panel.hidePopover();
      panel.removeAttribute('popover');
    } else {
      panel.setAttribute('popover', 'manual');
      panel.showPopover();
    }
  });
  button('继续询问', MessageCircle, () =>
    options.draft(`请进一步解释“${app.title}”。当前参数：\n${JSON.stringify(state)}`),
  );
  button('修复', Wrench, () =>
    options.repair(
      `请修复应用 ${app.id}（${app.title}），保留完整 genui-html 协议，兼容时保留 stateVersion。\n错误：${error || '请检查交互与计算逻辑'}\n当前参数：${JSON.stringify(state)}\n原源码：\n${options.source}`,
      { app, state: safeState(state) },
    ),
  );
  const pre = document.createElement('pre');
  const past:Record<string,unknown>[] = [], future:Record<string,unknown>[] = [];
  let accessible=false;
  const travel=(back:boolean)=>{
    const target=(back?past:future).pop();
    if(!target){setStatus(back?'没有可撤销的编辑':'没有可重做的编辑');return;}
    (back?future:past).push(state);
    state=target;dirty++;
    if(groupKey){
      const data=parameter==='choice'?{choice:state.__fast??app.spec.options[0].id}:
        {grammar:(state[grammarPath] as any)?.grammar??app.spec.grammar};
      if(Object.values(data).every(v=>v!==undefined)){
        void options.repository.storage.set(groupKey,data);
        groupEvents.dispatchEvent(new CustomEvent(groupKey,{detail:{sender:host,value:data}}));
      }
    }
    void save();start();
  };
  if(app.spec) {
    button('撤销编辑',Undo2,()=>travel(true));
    button('重做编辑',Redo2,()=>travel(false));
  }
  const access=button('易读模式',Accessibility,()=>{
    accessible=!accessible;
    access.setAttribute('aria-pressed',String(accessible));
    channel?.port1.postMessage({type:'accessible',value:accessible});
  });
  access.setAttribute('aria-pressed','false');
  if (options.bookmark) button('收藏此卡和当前进度', Bookmark, async () => {
    await options.bookmark!(safeState(state));
    setStatus('已收藏，可在扩展的「我的卡片」中打开');
  });
  if (app.spec?.kind === 'dataset' && options.refreshDataset) {
    button('刷新 USGS 快照', RefreshCw, async () => {
      const current = generation;
      const snapshot = await options.refreshDataset!(app.spec.dataset);
      if (disposed || current !== generation) return;
      state = safeState({...state, __dataset:snapshot});
      dirty++;
      await save();
      if (!disposed && current === generation) start();
    });
  }
  pre.id = 'source';
  pre.hidden = true;
  pre.textContent = options.source;
  panel.append(pre);
  const sourceButton = button('查看源码', Code, () => {
    pre.hidden = !pre.hidden;
    sourceButton.setAttribute('aria-expanded', String(!pre.hidden));
  });
  sourceButton.setAttribute('aria-expanded', 'false');
  sourceButton.setAttribute('aria-controls', 'source');
  let pngRequest:
    { id: string; resolve: (b: Blob) => void; reject: (e: Error) => void } | undefined;
  const experiments = experimentPanel({
    app,
    repository: options.repository,
    keysPromise,
    state: () => state,
    status: setStatus,
    restore: async (params: Record<string, unknown>) => {
      state = safeState({
        ...appParams(params),
        ...Object.fromEntries(
          Object.entries(state).filter(([k]) =>
            ['__moreGenuiQuizV1', '__moreGenuiSteps'].includes(k),
          ),
        ),
      });
      dirty++;
      await save();
      start();
    },
    png: () =>
      new Promise<Blob>((resolve, reject) => {
        if (!channel || !frame) return reject(Error('应用未运行'));
        const id = crypto.randomUUID();
        pngRequest?.reject(Error('新的导出已开始'));
        pngRequest = { id, resolve, reject };
        channel.port1.postMessage({ type: 'png', id });
        setTimeout(() => {
          if (pngRequest?.id === id) {
            pngRequest = undefined;
            reject(Error('PNG 导出超时'));
          }
        }, 5000);
      }),
  });
  panel.insertBefore(experiments.panel, viewport);
  button('实验工具', SlidersHorizontal, () => experiments.toggle());
  let probe: MessagePort | undefined;
  function start(inline = !options.sandboxUrl) {
    probe?.close();
    if (disposed) return;
    experiments.update({});
    const current = ++generation;
    clearTimeout(timeout);
    channel?.port1.close();
    frame?.remove();
    error = '';
    setStatus('启动中…');
    const next = document.createElement('iframe');
    frame = next;
    next.title = app.title;
    // Keep layout measurable without exposing controls in the temporary 48px viewport.
    next.style.visibility = 'hidden';
    next.inert = true;
    next.sandbox.add('allow-scripts');
    next.referrerPolicy = 'no-referrer';
    if (!inline && options.sandboxUrl) next.src = options.sandboxUrl;
    else next.srcdoc = sandboxHTML;
    channel = new MessageChannel();
    const connection = channel;
    let interactionPending = false;
    let ready = false, measured = false;
    function reveal() {
      if ((!ready && !error) || !measured || !next.inert) return;
      clearTimeout(timeout);
      next.inert = false;
      next.style.visibility = '';
      if (!error) {
        setStatus(sizeWarning);
        options.diagnostic?.('ready');
      }
    }
    let loaded = false,
      sizeWarning = '';
    connection.port1.onmessage = (e) => {
      if (disposed || current !== generation) return;
      const message = e.data;
      if (!message || typeof message !== 'object') return;
      if (message.type==='history-shortcut' && app.spec) {
        travel(message.value==='undo');return;
      }
      if (message.type === 'interaction') {
        interactionPending = true;
        options.diagnostic?.('interaction');
        return;
      }
      if (message.type === 'experiment') {
        try {
          experiments.update(safeState(message.value));
        } catch (e) {
          setStatus(String(e));
        }
        return;
      }
      if (message.type === 'png' && pngRequest && message.value?.id === pngRequest.id) {
        const r = pngRequest;
        pngRequest = undefined;
        const b = message.value.blob;
        if (b instanceof Blob && b.type === 'image/png' && b.size <= 8388608) r.resolve(b);
        else r.reject(Error(message.value.error || '无效 PNG'));
        return;
      }
      if (groupKey && message.type === parameter + '-edit') {
        const value = safeState({ [parameter]: message.value });
        void options.repository.storage
          .set(groupKey, value)
          .catch((e: Error) => setStatus(e.message));
        groupEvents.dispatchEvent(new CustomEvent(groupKey, { detail: { sender: host, value } }));
        return;
      }
      if (message.type === 'state') {
        try {
          const nextState = safeState(message.value);
          if (JSON.stringify(nextState) !== JSON.stringify(state)) {
            if (interactionPending) {
              if(app.spec){past.push(state);if(past.length>25)past.shift();future.length=0;}
              options.diagnostic?.('feedback');
              interactionPending = false;
            }
            state = nextState;
            experiments.changed();
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
      ) {
        next.style.height = `${Math.min(20000, Math.max(24, message.value))}px`;
        next.setAttribute('scrolling', 'no');
        expand.hidden = message.value <= 1200;
        viewport.style.maxHeight = !expanded && message.value > 1200 ? '1200px' : '';
        sizeWarning = message.value > 20000 ? '内容尺寸超过 20000px 显示上限，超出部分未展示' : '';
        measured = true;
        if (sizeWarning) setStatus(sizeWarning);
        reveal();
      } else if (message.type === 'error') {
        clearTimeout(timeout);
        options.diagnostic?.('execution-error');
        error = String(message.value).slice(0, 2000);
        setStatus(`运行错误：${error}`);
        const fix = document.createElement('button');
        fix.textContent = '修复';
        fix.onclick = () => {
          const action = panel.querySelector<HTMLButtonElement>('button[aria-label="修复"]');
          action?.click();
        };
        status.append(fix);
        reveal();
      } else if (message.type === 'ready') {
        ready = true;
        reveal();
      }
    };
    next.onload = () => {
      if (disposed || frame !== next || generation !== current) return;
      if (loaded) {
        setStatus('应用发生了不支持的导航，已停止');
        next.remove();
        connection.port1.close();
        return;
      }
      loaded = true;
      const handshake = new MessageChannel();
      probe = handshake.port1;
      handshake.port1.onmessage = (event) => {
        if (event.data !== 'booted' || current !== generation || disposed || frame !== next) return;
        handshake.port1.close();
        options.diagnostic?.('sandbox-boot');
        clearTimeout(timeout);
        timeout = setTimeout(() => failedStartup('应用已启动，等待运行结果超时'), 8000);
        next.contentWindow?.postMessage(
          {
            type: 'more-genui-init',
            revision,
            accessible,
            html: app.html,
            spec: app.spec,
            state,
            theme: resolvedTheme(),
          },
          '*',
          [connection.port2],
        );
      };
      next.contentWindow?.postMessage({ type: 'more-genui-connect' }, '*', [handshake.port2]);
    };
    viewport.append(next);
    function failedStartup(reason: string) {
      error = reason;
      options.diagnostic?.('mount-timeout');
      setStatus(reason);
      pre.hidden = false;
      sourceButton.setAttribute('aria-expanded', 'true');
      const saveCard = document.createElement('button');
      saveCard.textContent = '保存离线卡';
      saveCard.onclick = () => exportCard.click();
      status.append(saveCard);
    }
    timeout = setTimeout(() => {
      if (!inline) {
        options.diagnostic?.('sandbox-fallback');
        start(true);
      } else {
        probe?.close();
        failedStartup(loaded ? '隔离页面已加载，启动握手超时' : '隔离页面未完成加载');
      }
    }, 4000);
  }
  button('重置', RotateCcw, async () => {
    clearTimeout(saveTimer);
    state = {};
    await options.repository.reset(await keysPromise);
    start();
  });
  button('重新运行', RefreshCw, () => start());
  button('停止', Square, () => {
    clearTimeout(timeout);
    channel?.port1.close();
    frame?.remove();
    frame = undefined;
    probe?.close();
    setStatus('已停止，参数已保留');
    void save();
  });
  const more = document.createElement('button');
  more.type = 'button';
  more.title = '更多';
  more.setAttribute('aria-label', '更多');
  more.setAttribute('aria-expanded', 'false');
  more.append(createElement(MoreHorizontal));
  more.onclick = () => {
    overflow.hidden = !overflow.hidden;
    more.setAttribute('aria-expanded', String(!overflow.hidden));
  };
  more.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
      overflow.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      overflow.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };
  overflow.onkeydown = (e) => {
    if (e.key === 'Escape') {
      overflow.hidden = true;
      more.setAttribute('aria-expanded', 'false');
      more.focus();
    }
  };
  bar.append(overflow, more);
  let exportCard: HTMLButtonElement;
  {
    const download = (name: string, blob: Blob) => {
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    exportCard = button('导出离线教学卡', Code, () => {
      const payload = JSON.stringify({
        type: 'more-genui-init',
        revision,
        spec: app.spec,
        html: app.html,
        state,
        theme: resolvedTheme(),
      }).replaceAll('<', '\\u003c');
      const template = JSON.stringify(sandboxHTML).replaceAll('<', '\\u003c');
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>More GenUI</title><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style>
<iframe sandbox="allow-scripts" title="教学卡"></iframe>
<script>
const frame = document.querySelector("iframe");
frame.onload = () => {
  frame.onload = null;
  const probe = new MessageChannel();
  probe.port1.onmessage = event => {
    if (event.data !== "booted") return;
    probe.port1.close();
    const channel = new MessageChannel();
    frame.contentWindow.postMessage(${payload}, "*", [channel.port2]);
    channel.port1.start();
  };
  frame.contentWindow.postMessage({type:"more-genui-connect"}, "*", [probe.port2]);
};
frame.srcdoc = ${template};
<\/script>`;
      download(app.id + '.html', new Blob([html], { type: 'text/html;charset=utf-8' }));
    });
    if (app.spec)
      button('导出图解 JSON', Code, () =>
        download(
          app.id + '.json',
          new Blob([JSON.stringify({ spec: JSON.parse(options.source), state }, null, 2)], {
            type: 'application/json',
          }),
        ),
      );
    if (app.spec)
      button('导出图解 PNG', Code, async () =>
        download(
          app.id + '.png',
          await new Promise<Blob>((resolve, reject) => {
            if (!channel) return reject(Error('应用未运行'));
            const id = crypto.randomUUID();
            pngRequest = { id, resolve, reject };
            channel.port1.postMessage({ type: 'png', id });
            setTimeout(() => {
              if (pngRequest?.id === id) {
                pngRequest = undefined;
                reject(Error('PNG 导出超时'));
              }
            }, 5000);
          }),
        ),
      );
  }
  const visibility = new IntersectionObserver((entries) => {
    channel?.port1.postMessage({
      type: 'visibility',
      visible: entries.some((e) => e.isIntersecting) && !document.hidden,
    });
  });
  visibility.observe(host);
  const flushProgress = () => {
    clearTimeout(saveTimer);
    void save();
  };
  const tabVisibility = () => {
    if (document.hidden) {
      flushProgress();
      channel?.port1.postMessage({ type: 'visibility', visible: false });
    }
  };
  window.addEventListener('pagehide', flushProgress);
  document.addEventListener('visibilitychange', tabVisibility);
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
    .then((keys) => {
      revision = keys.exact;
      return options.repository.load(keys);
    })
    .then(async (value) => {
      const shared = groupKey ? await options.repository.storage.get(groupKey) : undefined;
      if (!disposed) {
        state = options.initialState ?? value;
        if (options.initialState) dirty++;
        if (shared) applyShared(shared);
        stateLoaded = true;
        start();
        void save();
      }
    })
    .catch((e) => setStatus(`读取状态失败：${e.message}`));
  return {
    theme,
    dispose() {
      if (groupKey) groupEvents.removeEventListener(groupKey, receiveGrammar);
      visibility.disconnect();
      window.removeEventListener('pagehide', flushProgress);
      document.removeEventListener('visibilitychange', tabVisibility);
      experiments.dispose();
      pngRequest?.reject(Error('应用已关闭'));
      pngRequest = undefined;
      disposed = true;
      generation++;
      clearTimeout(timeout);
      probe?.close();
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
