import { createElement, Power } from 'lucide';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { parseApp, splitGuidance, MAX_SOURCE } from '../src/protocol.mjs';
import { StateRepository } from '../src/state.mjs';
import { mountSurface } from '../src/surface';
export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  main(ctx) {
    let enabled = true,
      route = location.pathname;
    const active = new Set<string>(),
      complete = new Set<string>(),
      streamCodes = new WeakSet<HTMLElement>();
    const repository = new StateRepository({
      get: async (key: string) => (await browser.storage.local.get(key))[key],
      set: async (key: string, value: unknown) => {
        await browser.storage.local.set({ [key]: value });
      },
    });
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
    browser.storage.local.get('enabled').then((v) => {
      enabled = v.enabled !== false;
      publish();
      scan();
    });
    control.onclick = () => {
      enabled = !enabled;
      control.classList.remove('activating');
      void control.offsetWidth;
      control.classList.add('activating');
      void browser.storage.local.set({ enabled });
      publish();
      scan();
    };
    control.addEventListener('animationend', () => control.classList.remove('activating'));
    const interval = setInterval(publish, 1000);
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
    function scan() {
      if (route !== location.pathname) {
        route = location.pathname;
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
      if (!enabled) return;
      for (const code of document.querySelectorAll<HTMLElement>(
        '.ds-message .ds-assistant-message-main-content .md-code-block pre, .ds-message .ds-assistant-message-main-content pre code',
      )) {
        const source = code.textContent || '';
        if (
          mounted.has(code) ||
          source.length > MAX_SOURCE ||
          !source.trimStart().startsWith('<!-- more-genui:')
        )
          continue;
        // During a response only the SSE closing fence authorizes execution. History has no active stream.
        if (active.size) streamCodes.add(code);
        if (streamCodes.has(code) && !complete.has(source.trim())) continue;
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
        const instance = String(
          Array.from(document.querySelectorAll('.md-code-block pre, pre code')).indexOf(code),
        );
        const surface = mountSurface(host, {
          source,
          scope: route,
          instance,
          repository,
          sandboxUrl: chrome.runtime.getURL('sandbox.html'),
          draft,
          repair,
        });
        mounted.set(code, { source, host, container, display, dispose: surface.dispose });
      }
      // Fold only the smallest complete text container; retain the original DOM for framework reconciliation.
      for (const element of document.querySelectorAll<HTMLElement>(
        '.ds-message p,.ds-message div',
      )) {
        if (
          element.closest(
            '.more-genui-guidance,.more-genui-surface,.ds-assistant-message-main-content,.ds-think-content',
          ) ||
          folded.has(element) ||
          element.querySelector('textarea,pre') ||
          element.children.length > 0
        )
          continue;
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
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const m = e.data;
      if (!m || (typeof m.id !== 'string' && m.type !== 'more-genui-unsupported')) return;
      if (m.type === 'more-genui-start') active.add(m.id);
      if (m.type === 'more-genui-end') {
        scan();
        active.delete(m.id);
      }
      if (
        m.type === 'more-genui-source' &&
        typeof m.source === 'string' &&
        m.source.length <= MAX_SOURCE
      )
        complete.add(m.source.trim());
      if (m.type === 'more-genui-unsupported')
        control.title = '站点请求格式未识别，已保留原始回答；流式提前渲染可能不可用';
      scan();
    });
    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest('.ds-message')) return true;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches('.ds-message') || node.querySelector('.ds-message')),
        );
      });
      if (!relevant && route === location.pathname) return;
      clearTimeout(timer);
      timer = setTimeout(scan, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    ctx.onInvalidated(() => {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timer);
      for (const m of mounted.values()) {
        m.dispose();
        m.host.remove();
        m.container.style.display = m.display;
      }
      for (const [e, v] of folded) unfold(e, v);
      control.remove();
      toggleStyle.remove();
    });
  },
});
