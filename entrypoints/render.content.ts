import { RequestLifecycle } from '../src/request-lifecycle.mjs';
import { createElement, Power } from 'lucide';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { parseApp, splitGuidance, MAX_SOURCE } from '../src/protocol.mjs';
import { StateRepository } from '../src/state.mjs';
import { mountSurface } from '../src/surface';
import { messages, codeBlocks, userLeaves, messageIdentity } from '../src/deepseek-dom.mjs';
import { RepairContexts, memoryRepositoryStorage } from '../src/repair.mjs';
export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  main(ctx) {
    let enabled = false,
      route = location.pathname;
    let settingsReady = false;
    const ledger = new RequestLifecycle(() => scan());
    const { active, requests } = ledger;
    const repairs = new RepairContexts();
    const temporaryRepository = new StateRepository(memoryRepositoryStorage());
    let fullDiscoveries = 0,
      scans = 0,
      incrementalScans = 0;
    const registeredMessages = new Set<HTMLElement>();
    function rebuildMessages() {
      fullDiscoveries++;
      registeredMessages.clear();
      for (const message of messages()) registeredMessages.add(message as HTMLElement);
    }
    function visibleMessages() {
      for (const node of registeredMessages) if (!node.isConnected) registeredMessages.delete(node);
      return [...registeredMessages];
    }
    rebuildMessages();
    const allCodes = () =>
      visibleMessages().flatMap((message: Element) => codeBlocks(message)) as HTMLElement[];
    const dirtyMessages = new Set<HTMLElement>();
    const knownSources = new WeakMap<HTMLElement, string>();
    const repository = new StateRepository({
      get: async (key: string) => (await browser.storage.local.get(key))[key],
      set: async (key: string, value: unknown) => {
        await browser.storage.local.set({ [key]: value });
      },
    });
    const approvals = new WeakMap<HTMLElement, string>();
    const recovery = new Map<HTMLElement, HTMLButtonElement>();
    const mounted = new Map<
      HTMLElement,
      {
        source: string;
        host: HTMLElement;
        container: HTMLElement;
        display: string;
        dispose: () => void;
      }
    >();
    const folded = new Map<HTMLElement, { view: HTMLElement; text: string; display: string }>();
    const control = document.createElement('button');
    control.type = 'button';
    control.id = 'more-genui-toggle';
    Object.assign(control.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      padding: '8px 12px',
      borderRadius: '10px',
      border: '1px solid #8888',
      background: 'Canvas',
      color: 'CanvasText',
    });
    const toggleStyle = document.createElement('style');
    toggleStyle.textContent =
      '#more-genui-toggle{display:grid;place-items:center;width:38px;height:38px;padding:9px!important;border-radius:50%!important;transition:color .2s,background .2s}#more-genui-toggle svg{width:18px;height:18px}#more-genui-toggle[aria-pressed=true]{color:#3569c8}#more-genui-toggle[aria-pressed=true]:after{content:"";position:absolute;right:3px;bottom:3px;width:6px;height:6px;border-radius:50%;background:currentColor}#more-genui-toggle.activating{animation:mg-activate .5s ease-out}@keyframes mg-activate{0%{box-shadow:0 0 0 0 #3569c855;transform:scale(.92)}100%{box-shadow:0 0 0 15px #3569c800;transform:scale(1)}}@media(prefers-reduced-motion:reduce){#more-genui-toggle{animation:none!important;transition:none!important}}';
    document.head.append(toggleStyle);
    control.append(createElement(Power));
    document.body.append(control);
    const publish = () => {
      control.title = `GenUI：${enabled ? '开启' : '关闭'}`;
      control.setAttribute('aria-label', control.title);
      control.setAttribute('aria-pressed', String(enabled));
      window.postMessage({ type: 'more-genui-enabled', enabled }, location.origin);
    };
    const loadSettings = async () => {
      control.disabled = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          browser.storage.local.get('enabled'),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(Error('storage timeout')), 4000);
          }),
        ]);
        settingsReady = true;
        enabled = value.enabled !== false;
        publish();
        scan();
      } catch {
        enabled = false;
        control.title = '读取开关失败，保持关闭；点击重试';
        control.setAttribute('aria-label', control.title);
        control.setAttribute('aria-pressed', 'false');
      } finally {
        clearTimeout(timeout);
        control.disabled = false;
      }
    };
    void loadSettings();
    control.onclick = () => {
      if (!settingsReady) {
        void loadSettings();
        return;
      }
      enabled = !enabled;
      control.classList.remove('activating');
      void control.offsetWidth;
      control.classList.add('activating');
      void browser.storage.local.set({ enabled });
      publish();
      scan();
    };
    control.addEventListener('animationend', () => control.classList.remove('activating'));
    const settingsChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes.enabled) {
        enabled = changes.enabled.newValue === true;
        publish();
        scan();
      }
    };
    browser.storage.onChanged.addListener(settingsChanged);
    const readyListener = (e: MessageEvent) => {
      if (
        e.source === window &&
        e.origin === location.origin &&
        settingsReady &&
        e.data?.type === 'more-genui-ready'
      )
        publish();
    };
    window.addEventListener('message', readyListener);
    function composer() {
      const input = document.querySelector<HTMLTextAreaElement>('textarea');
      if (!input) throw Error('未找到 DeepSeek 输入框');
      return input;
    }
    function setDraft(input: HTMLTextAreaElement, text: string) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        input,
        text,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
    function draft(text: string) {
      const input = composer();
      setDraft(input, input.value + (input.value ? '\n\n' : '') + text);
    }
    async function repair(text: string) {
      if (active.size) throw Error('请等待当前回答结束后再修复');
      const input = composer();
      if (input.value.trim()) throw Error('输入框中已有草稿。请先发送或保存草稿，再点击修复');
      setDraft(input, text);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const send = document.querySelector<HTMLElement>(
        '[data-testid="send-button"],button[aria-label="发送"],button[aria-label="Send"],[role="button"][aria-label="发送"],[role="button"][aria-label="Send"]',
      );
      if (
        send &&
        !(send as HTMLButtonElement).disabled &&
        send.getAttribute('aria-disabled') !== 'true'
      )
        send.click();
      else {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
        );
        input.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (input.value === text)
        throw Error('站点未接受自动发送；修复内容已填入，请按发送。不会重复提交');
    }
    function unfold(element: HTMLElement, value: { view: HTMLElement; display: string }) {
      value.view.remove();
      element.style.display = value.display;
      folded.delete(element);
    }
    function scan(changedOnly = false) {
      if (route !== location.pathname) {
        route = location.pathname;
        rebuildMessages();
        ledger.clear();
        repairs.clear();
        for (const button of recovery.values()) button.remove();
        recovery.clear();
        for (const [element, value] of folded) unfold(element, value);
        changedOnly = false;
        for (const [code, m] of mounted) {
          m.dispose();
          m.host.remove();
          m.container.style.display = m.display;
          mounted.delete(code);
        }
      }
      for (const [code, m] of mounted)
        if (!enabled || !code.isConnected || code.textContent !== m.source) {
          m.dispose();
          m.host.remove();
          m.container.style.display = m.display;
          mounted.delete(code);
        }
      for (const [element, value] of folded)
        if (!enabled || !element.isConnected || element.textContent !== value.text)
          unfold(element, value);
      for (const [code, button] of recovery)
        if (
          !enabled ||
          !code.isConnected ||
          mounted.has(code) ||
          button.dataset.source !== code.textContent
        ) {
          button.remove();
          recovery.delete(code);
        }
      if (!enabled) {
        ledger.clear();
        return;
      }
      const candidates = changedOnly
        ? [...dirtyMessages].filter((node) => node.isConnected)
        : visibleMessages();
      scans++;
      if (changedOnly) incrementalScans++;
      if (document.documentElement.hasAttribute('data-more-genui-profile')) {
        performance.clearMarks('more-genui:counts');
        performance.mark('more-genui:counts', {
          detail: { fullDiscoveries, scans, incrementalScans },
        });
      }
      dirtyMessages.clear();
      for (const code of candidates.flatMap((message: Element) =>
        codeBlocks(message),
      ) as HTMLElement[]) {
        const source = code.textContent || '';
        knownSources.set(code, source);
        if (
          mounted.has(code) ||
          source.length > MAX_SOURCE ||
          !source.trimStart().startsWith('<!-- more-genui:')
        )
          continue;
        const key = code
          .closest('[data-virtual-list-item-key]')
          ?.getAttribute('data-virtual-list-item-key');
        const owner = ledger.owner(code, key, source);
        const requestId = owner?.id;
        if (owner && !ledger.confirmed(code, owner, source) && approvals.get(code) !== source) {
          if (!active.size && !recovery.has(code)) {
            try {
              parseApp(source);
            } catch {
              continue;
            }
            const button = document.createElement('button');
            button.className = 'more-genui-recovery';
            button.dataset.source = source;
            button.textContent = '未确认输出边界 · 运行此应用';
            button.onclick = () => {
              if (code.textContent !== source || !code.isConnected) {
                scan();
                return;
              }
              approvals.set(code, source);
              button.remove();
              recovery.delete(code);
              scan();
            };
            code.closest('pre')?.after(button);
            recovery.set(code, button);
          }
          continue;
        }
        try {
          parseApp(source);
        } catch {
          continue;
        }
        const host = document.createElement('div');
        host.className = 'more-genui-surface';
        const container = (code.closest('.md-code-block') ?? code.closest('pre')) as HTMLElement;
        container?.after(host);
        if (!host.isConnected) continue;
        const display = container.style.display;
        container.style.display = 'none';
        const identity = messageIdentity(code);
        const blocks = codeBlocks(identity.message);
        const appMeta = parseApp(source);
        const sameId = blocks.filter((node: HTMLElement) => {
          try {
            return parseApp(node.textContent || '').id === appMeta.id;
          } catch {
            return false;
          }
        });
        const instance = JSON.stringify([
          'deepseek',
          identity.id,
          appMeta.id,
          sameId.indexOf(code),
          appMeta.stateVersion,
        ]);
        // An explicit repair echo must also belong to its captured request when streaming.
        const token = /<!-- more-genui-repair: ([a-f0-9-]+) -->/.exec(source)?.[1];
        const allowRepair = requestId && token === requests.get(requestId)?.repairToken;
        const surface = mountSurface(host, {
          source,
          scope: 'deepseek:' + route,
          instance,
          repository: identity.persistent ? repository : temporaryRepository,
          initialState: allowRepair ? repairs.consume(route, appMeta, source) : undefined,
          sandboxUrl: chrome.runtime.getURL('sandbox.html'),
          draft,
          repair(text, context) {
            const token = repairs.create(route, context.app, context.state);
            return repair(
              text +
                '\n本次修复标识：' +
                token +
                '\n请在返回的 HTML 内保留注释 <!-- more-genui-repair: ' +
                token +
                ' -->，仅本次修复使用。',
            );
          },
        });
        mounted.set(code, { source, host, container, display, dispose: surface.dispose });
      }
      // Fold only the smallest complete text container; retain the original DOM for framework reconciliation.
      for (const element of candidates.flatMap((message: Element) =>
        userLeaves(message),
      ) as HTMLElement[]) {
        if (folded.has(element)) continue;
        const text = element.textContent || '';
        if (!text.includes('[More GenUI v1]')) continue;
        const parts = splitGuidance(text);
        if (!parts) continue;
        const view = document.createElement('div');
        view.className = 'more-genui-guidance';
        const details = document.createElement('details'),
          summary = document.createElement('summary'),
          body = document.createElement('pre');
        summary.textContent = 'More GenUI 附加指令（点击查看）';
        body.textContent = parts.guide;
        body.style.whiteSpace = 'pre-wrap';
        details.append(summary, body);
        view.append(
          document.createTextNode(parts.before),
          details,
          document.createTextNode(parts.after),
        );
        element.after(view);
        folded.set(element, { view, text, display: element.style.display });
        element.style.display = 'none';
      }
    }
    const streamListener = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin || !enabled) return;
      const m = e.data;
      if (!m || !m.type?.startsWith('more-genui-')) return;
      if (route !== location.pathname) scan();
      if (m.route && m.route !== route) return;
      if (m.type === 'more-genui-start' && typeof m.id === 'string') {
        ledger.start(
          m.id,
          new WeakMap(allCodes().map((code) => [code, knownSources.get(code) ?? ''])),
          m.repairToken,
        );
      } else if (m.type === 'more-genui-identity' && requests.has(m.id)) {
        ledger.identify(m.id, m.key);
      } else if (
        m.type === 'more-genui-source' &&
        requests.has(m.id) &&
        typeof m.source === 'string' &&
        m.source.length <= MAX_SOURCE
      ) {
        ledger.source(m.id, m.source.trim());
      } else if (m.type === 'more-genui-end' && requests.has(m.id)) {
        scan();
        ledger.end(m.id);
      } else if (m.type === 'more-genui-unsupported') {
        control.title = '站点请求格式未识别，保留原始回答；完整应用需手动运行';
      } else return;
      scan();
    };
    window.addEventListener('message', streamListener);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => scan(true), 50);
    };
    const discover = () => {
      for (const message of visibleMessages()) dirtyMessages.add(message as HTMLElement);
      schedule();
    };
    const discovery = new MutationObserver((records) => {
      if (route !== location.pathname) {
        discover();
        return;
      }
      let changed = false;
      for (const r of records) {
        const target = r.target instanceof Element ? r.target : r.target.parentElement;
        if (
          target?.closest(
            '.more-genui-surface,.more-genui-guidance,.more-genui-recovery,.more-genui-preview',
          )
        )
          continue;
        const parent = target?.closest<HTMLElement>('.ds-message');
        if (parent) {
          dirtyMessages.add(parent);
          changed = true;
          continue;
        }
        for (const node of r.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('.ds-message')) {
            registeredMessages.add(node);
            dirtyMessages.add(node);
            changed = true;
          }
          for (const child of messages(node as any)) {
            registeredMessages.add(child as HTMLElement);
            dirtyMessages.add(child as HTMLElement);
            changed = true;
          }
        }
        for (const node of r.removedNodes)
          if (
            node instanceof Element &&
            (node.matches('.ds-message') || node.querySelector('.ds-message'))
          )
            changed = true;
      }
      if (changed) schedule();
    });
    discovery.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.addEventListener('popstate', discover);
    scan();
    ctx.onInvalidated(() => {
      enabled = false;
      publish();
      ledger.clear();
      discovery.disconnect();
      window.removeEventListener('popstate', discover);
      window.removeEventListener('message', readyListener);
      window.removeEventListener('message', streamListener);
      browser.storage.onChanged.removeListener(settingsChanged);
      clearTimeout(timer);
      for (const m of mounted.values()) {
        m.dispose();
        m.host.remove();
        m.container.style.display = m.display;
      }
      for (const [e, v] of folded) unfold(e, v);
      for (const button of recovery.values()) button.remove();
      control.remove();
      toggleStyle.remove();
    });
  },
});
