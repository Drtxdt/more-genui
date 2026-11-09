import { advancePreamble, withPreamble } from '../src/html-preamble.mjs';
import buttonStyles from '../src/extension-buttons.css?inline';
import { rawApplications } from '../src/raw-applications.mjs';
import { stripRequestProof } from '../src/request-proof.mjs';
import { readerIndex } from '../src/reader-index.mjs';
import { GenerationDiagnostics } from '../src/diagnostics.mjs';
import { parseRenderable as parseApp } from '../src/renderable.mjs';
import { RequestLifecycle } from '../src/request-lifecycle.mjs';
import { TableCharts } from '../src/charts.mjs';
import { composerTools } from '../src/composer-tools.mjs';
import { SourceCards } from '../src/source-cards.mjs';
import { PreviewRenderer } from '../src/preview-renderer.mjs';
import { createElement, Power } from 'lucide';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { splitGuidance, MAX_SOURCE } from '../src/protocol.mjs';
import { StateRepository } from '../src/state.mjs';
import { mountSurface } from '../src/surface';
import { messages, codeBlocks, userLeaves, messageIdentity } from '../src/deepseek-dom.mjs';
import { RepairContexts, memoryRepositoryStorage } from '../src/repair.mjs';
function codeLanguage(code: Element) {
  const pre = code.closest('pre');
  const banner = [
    ...(pre?.closest('.md-code-block')?.querySelectorAll('span,button,div') ?? []),
  ].find(
    (el) =>
      !pre?.contains(el) &&
      !el.childElementCount &&
      /^(genui-)?(json|html)$/.test(el.textContent?.trim() ?? ''),
  );
  return (
    [code, pre]
      .map(
        (el) =>
          el?.getAttribute('data-language') ||
          [...(el?.classList ?? [])].find((c) => c.startsWith('language-'))?.slice(9),
      )
      .find(Boolean) ?? banner?.textContent?.trim()
  );
}

function adjacentComments(code: Element) {
  const block = code.closest('.md-code-block');
  if (!block?.parentElement?.matches('.ds-assistant-message-main-content')) return [];
  const nodes: HTMLElement[] = [];
  for (
    let sibling = block.previousSibling;
    sibling && nodes.length < 2;
    sibling = sibling.previousSibling
  ) {
    if (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()) continue;
    if (
      !(sibling instanceof HTMLElement) ||
      !sibling.matches('span.ds-markdown-html') ||
      sibling.childElementCount
    )
      break;
    nodes.unshift(sibling);
  }
  return nodes;
}
function effectiveSource(code: Element) {
  const source = code.textContent || '';
  if (!/^\s*(?:<!doctype html>|<html[\s>])/i.test(source)) return source;
  const lines = adjacentComments(code).reduce<string[]>(
    (lines, node) => advancePreamble(lines, node.textContent || ''),
    [],
  );
  return withPreamble(source, codeLanguage(code), lines);
}
export default defineContentScript({
  matches: ['https://chat.deepseek.com/*'],
  main(ctx) {
    let enabled = false,
      route = location.pathname;
    const reader = readerIndex();
    const raw = rawApplications();
    const diagnostics = new GenerationDiagnostics();
    const diagnosticPanel = document.createElement('aside');
    diagnosticPanel.className = 'more-genui-diagnostics';
    diagnosticPanel.hidden = true;
    diagnosticPanel.style.cssText =
      'position:fixed;right:12px;bottom:64px;max-width:340px;max-height:40vh;overflow:auto;z-index:2147483646;background:Canvas;color:CanvasText;padding:12px;border:1px solid GrayText;font:12px system-ui';
    document.body.append(diagnosticPanel);
    const stageNames: Record<string, string> = {
      recognized: '识别请求',
      policy: '发送策略',
      skipped: '未附加规范',
      enhanced: '已附加规范',
      text: '首段响应内容',
      'visible-text': '首段正文已显示',
      'ui-output': '围栏完整',
      mounted: '已挂载',
      ready: '可用',
      interaction: '首次操作',
      feedback: '反馈',
      'no-ui': '正文未含应用围栏',
      'sandbox-boot': '沙箱握手成功',
      'sandbox-fallback': '尝试内嵌沙箱',
      'preview-candidate': '普通代码含应用标记',
      'response-bytes': '正文字节数',
      'invalid-protocol': '协议无效',
      'execution-error': '运行失败',
      ambiguous: '归属未明',
      'insufficient-evidence': '证据不足',
      complete: '响应结束',
      cancelled: '已取消',
    };
    function diagnostic(event: any) {
      const record = diagnostics.update(event);
      if (!record) return;
      diagnosticPanel.replaceChildren();
      for (const row of [...diagnostics.records.values()].slice(-8)) {
        const line = document.createElement('p');
        line.textContent =
          row.id.slice(0, 8) +
          ' · ' +
          row.events
            .map(
              (e: any) =>
                (stageNames[e.stage] ?? e.stage) +
                (e.policyHash ? ' ' + e.policyHash.slice(0, 12) : '') +
                ' ' +
                Math.round(e.ms) +
                'ms',
            )
            .join(' → ');
        const copy = document.createElement('button');
        copy.textContent = '复制本次验收记录';
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(
              JSON.stringify({ version: 1, events: row.events }, null, 2),
            );
            copy.textContent = '已复制';
          } catch {
            copy.textContent = '复制失败，请重试';
          }
        };
        line.append(copy);
        diagnosticPanel.append(line);
      }
      const retry = document.createElement('button');
      retry.textContent = '追加可视化提问';
      retry.onclick = () =>
        draft('请将上一条回答中适合观察变化、关系或冲突的部分生成一块紧凑可视化。');
      diagnosticPanel.append(retry);
    }
    const tables = new TableCharts();
    const cards = new SourceCards((m: any) => browser.runtime.sendMessage(m));
    let showCards = true;
    let previewImages = false;
    let generationMode = 'auto',
      labPolicy = 'A';
    let learning = false,
      preferred = '';
    const composition = composerTools({
      async remember(answerId: string, kind: string) {
        if (!learning) return;
        const hash = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([route, answerId])),
        );
        const answer = Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        await navigator.locks.request('more-genui-learning', async () => {
          const data = await browser.storage.local.get(['learning', 'choices']);
          if (!data.learning) return;
          const choices = (data.choices ?? {}) as Record<string, string[]>;
          choices[kind] = [...new Set([...(choices[kind] ?? []), answer])].slice(-3);
          await browser.storage.local.set({ choices });
        });
      },
      settings: () => ({ enabled, mode: generationMode }),
      setDraft,
      arm: (ticket: unknown) =>
        document.dispatchEvent(
          new CustomEvent('more-genui-intent', { detail: JSON.stringify(ticket) }),
        ),
    });
    let settingsReady = false;
    const ledger = new RequestLifecycle(() => scan());
    const { active, requests } = ledger;
    const previews = new PreviewRenderer((m: any) => browser.runtime.sendMessage({ ...m, route }));
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
    let approvals = new WeakMap<HTMLElement, string>();
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
    const visualizeActions = new Map<HTMLElement, HTMLButtonElement>();
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
    toggleStyle.textContent += buttonStyles;
    document.head.append(toggleStyle);
    control.append(createElement(Power));
    document.body.append(control);
    const publish = () => {
      control.title = `GenUI：${enabled ? '开启' : '关闭'}`;
      if (!enabled) reader.clear();
      control.setAttribute('aria-label', control.title);
      control.setAttribute('aria-pressed', String(enabled));
      window.postMessage(
        {
          type: 'more-genui-enabled',
          enabled,
          mode: generationMode,
          diagnostics: diagnostics.enabled,
          policy: labPolicy,
          preferred: learning && !diagnostics.enabled ? preferred : '',
        },
        location.origin,
      );
    };
    const loadSettings = async () => {
      control.disabled = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const value = await Promise.race([
          browser.storage.local.get([
            'enabled',
            'previewImages',
            'sourceMode',
            'generationMode',
            'diagnostics',
            'labPolicy',
            'learning',
            'preferred',
          ]),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(Error('storage timeout')), 4000);
          }),
        ]);
        labPolicy = value.labPolicy === 'C' ? 'C' : value.labPolicy === 'B' ? 'B' : 'A';
        learning = value.learning === true;
        preferred = String(value.preferred ?? '');
        diagnostics.configure(value.diagnostics);
        diagnosticPanel.hidden = !diagnostics.enabled;
        settingsReady = true;
        generationMode = String(value.generationMode ?? 'auto');
        showCards = value.sourceMode !== 'off';
        previewImages = value.previewImages === true;
        enabled = value.enabled !== false;
        publish();
        scan();
      } catch {
        enabled = false;
        control.title = '读取开关失败，保持关闭；点击重试';
        if (!enabled) reader.clear();
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
      if (area === 'local' && (changes.learning || changes.preferred)) {
        if (changes.learning) learning = changes.learning.newValue === true;
        if (changes.preferred) preferred = String(changes.preferred.newValue ?? '');
        publish();
      }
      if (area === 'local' && changes.labPolicy) {
        labPolicy =
          changes.labPolicy.newValue === 'C' ? 'C' : changes.labPolicy.newValue === 'B' ? 'B' : 'A';
        publish();
      }
      if (area === 'local' && changes.diagnostics) {
        diagnostics.configure(changes.diagnostics.newValue);
        diagnosticPanel.hidden = !diagnostics.enabled;
        publish();
      }
      if (area === 'local' && changes.generationMode) {
        generationMode = String(changes.generationMode.newValue);
        composition.reset();
        publish();
        scan();
      }
      if (area === 'local' && changes.sourceMode) {
        showCards = changes.sourceMode.newValue !== 'off';
        if (!showCards) cards.clear();
        scan();
      }
      if (area === 'local' && changes.previewImages) {
        previewImages = changes.previewImages.newValue !== false;
        if (!previewImages) previews.clear();
        scan();
      }
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
    function repair(text: string) {
      if (active.size) throw Error('请等待当前回答结束后再修复');
      const input = composer();
      if (input.value.trim()) throw Error('输入框中已有草稿。请先发送或保存草稿，再点击修复');
      setDraft(input, text);
    }
    function unfold(element: HTMLElement, value: { view: HTMLElement; display: string }) {
      value.view.remove();
      element.style.display = value.display;
      folded.delete(element);
    }
    function clearVisualizeActions() {
      for (const action of visualizeActions.values()) action.remove();
      visualizeActions.clear();
    }
    function scan(changedOnly = false) {
      if (!enabled || route !== location.pathname) raw.clear();
      raw.prune();
      if (route !== location.pathname) {
        clearVisualizeActions();
        route = location.pathname;
        reader.clear();
        composition.reset();
        rebuildMessages();
        ledger.clear();
        approvals = new WeakMap();
        tables.clear();
        cards.clear();
        previews.clear();
        repairs.clear();
        for (const button of recovery.values()) button.remove();
        recovery.clear();
        for (const [element, value] of folded) unfold(element, value);
        changedOnly = false;
        for (const [code, m] of mounted) {
          m.dispose();
          reader.detach(m.host);
          m.host.remove();
          m.container.style.display = m.display;
          mounted.delete(code);
        }
      }
      for (const [code, m] of mounted)
        if (!enabled || !code.isConnected || effectiveSource(code) !== m.source) {
          m.dispose();
          reader.detach(m.host);
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
          button.dataset.source !== effectiveSource(code)
        ) {
          button.remove();
          recovery.delete(code);
        }
      composition.update();
      if (!enabled) {
        clearVisualizeActions();
        approvals = new WeakMap();
        ledger.clear();
        tables.clear();
        cards.clear();
        previews.clear();
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
      for (const [message, action] of visualizeActions)
        if (!message.isConnected || !enabled) {
          action.remove();
          visualizeActions.delete(message);
        }
      for (const message of candidates) {
        const body = message.querySelector('.ds-assistant-message-main-content');
        if (body && !active.size && !body.closest('aside,nav,.ds-think-content,[role=tooltip]'))
          raw.refresh(body);
        if (body && diagnostics.enabled) {
          const key = message
            .closest('[data-virtual-list-item-key]')
            ?.getAttribute('data-virtual-list-item-key');
          const request =
            key && [...requests.values()].find((r) => r.key === key && !r.visibleText);
          if (
            request &&
            [...body.querySelectorAll('p,li,h2,h3')].some(
              (el) =>
                !el.closest('aside,pre,.ds-think-content,.more-genui-surface') &&
                el.textContent?.trim() &&
                el.getClientRects().length,
            )
          ) {
            request.visibleText = true;
            diagnostic({ id: request.id, stage: 'visible-text' });
          }
        }
        if (body && visualizeActions.get(message as HTMLElement)?.previousElementSibling !== body) {
          visualizeActions.get(message as HTMLElement)?.remove();
          while (body.nextElementSibling?.matches('button.more-genui-visualize'))
            body.nextElementSibling.remove();
          const action = document.createElement('button');
          action.className = 'more-genui-visualize';
          action.textContent = '请求可视化';
          action.onclick = () => {
            const excerpt = [...body.querySelectorAll<HTMLElement>('p,li,h2,h3')]
              .filter(
                (el) =>
                  el.getClientRects().length &&
                  !el.closest('aside,pre,.ds-think-content,.more-genui-surface'),
              )
              .map((el) => el.innerText.trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 180);
            draft(
              '请用一块图解解释这条回答中的变化、关系或冲突。' +
                (excerpt ? '\n回答摘录：“' + excerpt + '”' : ''),
            );
          };
          body.after(action);
          visualizeActions.set(message as HTMLElement, action);
        }
      }
      for (const message of candidates) tables.render(message);
      if (showCards) for (const message of candidates) cards.render(message);
      if (previewImages) for (const message of candidates) previews.render(message);
      for (const code of candidates.flatMap((message: Element) =>
        codeBlocks(message),
      ) as HTMLElement[]) {
        const source = effectiveSource(code);
        if (approvals.has(code) && approvals.get(code) !== source) approvals.delete(code);
        knownSources.set(code, source);
        if (
          mounted.has(code) ||
          source.length > MAX_SOURCE ||
          !(source.trimStart().startsWith('<!-- more-genui:') || source.trimStart().startsWith('{'))
        )
          continue;
        const key = code
          .closest('[data-virtual-list-item-key]')
          ?.getAttribute('data-virtual-list-item-key');
        const pre = code.closest('pre');
        const language = codeLanguage(code);
        const expected = source.trimStart().startsWith('{') ? 'json' : 'html';
        if (language && language !== expected && language !== 'genui-' + expected) continue;
        const message = code.closest('.ds-message')!;
        const ordinal = codeBlocks(message)
          .filter((node) => ['genui-json', 'genui-html'].includes(codeLanguage(node) ?? ''))
          .indexOf(code);
        const origin = ledger.classify(code, key, source, language, ordinal);
        const owner = origin.owner;
        const confirmed =
          owner &&
          ledger.confirmed(code, owner, source, language, ordinal >= 0 ? ordinal : undefined);
        const manual = language === expected || (!language && !confirmed);
        if (origin.kind === 'unknown')
          for (const id of active) diagnostic({ id, stage: 'ambiguous' });
        const requestId = owner?.id;
        if (
          (manual || (origin.kind !== 'history' && !confirmed)) &&
          approvals.get(code) !== source
        ) {
          if (!active.size && !recovery.has(code)) {
            try {
              parseApp(source);
            } catch {
              continue;
            }
            const button = document.createElement('button');
            button.className = 'more-genui-recovery';
            button.dataset.source = source;
            button.textContent = manual && language ? '点击预览' : '未确认输出边界 · 运行此应用';
            button.onclick = () => {
              if (effectiveSource(code) !== source || !code.isConnected || !raw.current(code)) {
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
          if (requestId) diagnostic({ id: requestId, stage: 'invalid-protocol' });
          continue;
        }
        const host = document.createElement('div');
        host.className = 'more-genui-surface';
        const container = (code.closest('.md-code-block') ?? code.closest('pre')) as HTMLElement;
        container?.after(host);
        if (!host.isConnected) continue;
        const display = container.style.display;
        if (!manual) container.style.display = 'none';
        const identity = messageIdentity(code);
        const blocks = codeBlocks(identity.message);
        const appMeta = parseApp(source);
        const sameId = blocks.filter((node: HTMLElement) => {
          try {
            return parseApp(effectiveSource(node)).id === appMeta.id;
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
        const allowRepair = confirmed && token && token === owner?.repairToken;
        reader.register(instance, appMeta.title, host);
        const surface = mountSurface(host, {
          source: stripRequestProof(source),
          diagnostic: (stage: string) => {
            if (requestId) diagnostic({ id: requestId, stage });
          },
          answerId: identity.id,
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
        if (requestId) diagnostic({ id: requestId, stage: 'mounted' });
        const comments =
          source !== code.textContent
            ? adjacentComments(code).filter(
                (node) =>
                  source.startsWith(node.textContent!.trim()) ||
                  source.split('\n')[1] === node.textContent!.trim(),
              )
            : [];
        const restore = comments.map((node) => [node, node.hidden] as const);
        for (const node of comments) node.hidden = true;
        mounted.set(code, {
          source,
          host,
          container,
          display,
          dispose() {
            surface.dispose();
            for (const [node, hidden] of restore) node.hidden = hidden;
          },
        });
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
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.type === 'more-genui-diagnostic') {
        diagnostic(e.data);
        return;
      }
      if (!enabled) return;
      const m = e.data;
      if (m?.type === 'more-genui-consumed') {
        composition.reset(m);
        return;
      }
      if (!m || !m.type?.startsWith('more-genui-')) return;
      if (route !== location.pathname) scan();
      if (m.route && m.route !== route) return;
      if (m.type === 'more-genui-start' && typeof m.id === 'string') {
        ledger.start(
          m.id,
          new WeakMap(allCodes().map((code) => [code, knownSources.get(code) ?? ''])),
          m.repairToken,
          m.proof,
        );
      } else if (m.type === 'more-genui-identity' && requests.has(m.id)) {
        ledger.identify(m.id, m.key);
        if (showCards) cards.update(m.id, { key: m.key });
        if (previewImages) previews.identify(m.id, m.key);
      } else if (m.type === 'more-genui-search' && requests.has(m.id)) {
        if (showCards) cards.update(m.id, { sources: m.sources });
        if (previewImages) previews.sources(m.id, m.sources);
      } else if (
        m.type === 'more-genui-source' &&
        requests.has(m.id) &&
        typeof m.source === 'string' &&
        m.source.length <= MAX_SOURCE
      ) {
        try {
          parseApp(
            m.source,
            m.language === 'genui-json' ? 'fast' : m.language === 'genui-html' ? 'html' : undefined,
          );
        } catch {
          diagnostic({ id: m.id, stage: 'invalid-protocol' });
          return;
        }
        ledger.source(m.id, m.source.trim(), m.language);
      } else if (m.type === 'more-genui-end' && requests.has(m.id)) {
        scan();
        ledger.end(m.id);
        cards.requests.delete(m.id);
        if (previewImages) previews.end(m.id);
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
            '.more-genui-surface,.more-genui-guidance,.more-genui-recovery,.more-genui-preview,.more-genui-sources,.more-genui-table',
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
      raw.clear();
      enabled = false;
      publish();
      ledger.clear();
      previews.clear();
      for (const action of visualizeActions.values()) action.remove();
      visualizeActions.clear();
      diagnosticPanel.remove();
      diagnostics.clear();
      reader.clear();
      composition.dispose();
      cards.clear();
      tables.clear();
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
