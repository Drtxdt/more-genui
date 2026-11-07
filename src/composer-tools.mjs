export function composerTools({ settings, setDraft, arm, remember }) {
  const once = document.createElement('button');
  once.type = 'button';
  once.textContent = '仅增强本条';
  once.className = 'more-genui-once';
  let armed = false,
    kind = '',
    input;
  let intentId = crypto.randomUUID(),
    revision = 0;
  const acknowledge = (event) => {
    try {
      const value = JSON.parse(event.detail);
      if (value?.id === intentId && value.revision === revision) once.dataset.ready = 'true';
    } catch {}
  };
  document.addEventListener('more-genui-intent-ack', acknowledge);
  function sync() {
    once.dataset.ready = 'false';
    once.setAttribute('aria-pressed', String(armed));
    arm(
      armed && input
        ? {
            id: intentId,
            revision: ++revision,
            route: location.pathname,
            prompt: input.value,
            kind,
          }
        : null,
    );
  }
  function reset(receipt) {
    if (receipt && (receipt.intentId !== intentId || receipt.revision !== revision)) return;
    intentId = crypto.randomUUID();
    armed = false;
    kind = '';
    sync();
  }
  const consumed = (event) => {
    try {
      reset(JSON.parse(event.detail));
    } catch {}
  };
  document.addEventListener('more-genui-intent-consumed', consumed);
  document.addEventListener('more-genui-intent-submitted', consumed);
  once.onclick = () => {
    armed = !armed;
    sync();
    input?.focus();
  };
  function onInput(e) {
    if (e.target === input && armed) sync();
  }
  document.addEventListener('input', onInput, true);
  const panel = document.createElement('aside');
  panel.className = 'more-genui-selection';
  panel.style.cssText =
    'position:fixed;z-index:9999;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:8px;padding:5px;max-width:95vw';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '选区用途');
  const prompts = {
    diagram: '用可交互图解释这段内容',
    quiz: '根据这段内容出一道预测题',
    steps: '将这段内容拆成分步演示',
  };
  for (const [value, label] of Object.entries({
    diagram: '交互图解',
    quiz: '预测题',
    steps: '分步演示',
  }))
    select.add(new Option(label, value));
  let selected = '',
    answerId = '';
  const prompt = () => prompts[select.value] + '：\n' + selected;
  const add = document.createElement('button'),
    copy = document.createElement('button');
  add.onclick = () => {
    if (!input) return;
    setDraft(input, input.value + (input.value ? '\n\n' : '') + prompt());
    armed = true;
    kind = select.value;
    if (answerId) void remember?.(answerId, kind);
    sync();
    panel.remove();
  };
  copy.textContent = '复制提问';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(prompt());
      panel.remove();
    } catch {
      copy.textContent = '复制失败，点击重试';
    }
  };
  panel.append(select, add, copy);
  function selection(e) {
    if (panel.contains(e.target)) return;
    panel.remove();
    const sel = getSelection();
    if (!settings().enabled || !sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0),
      el = range.commonAncestorContainer;
    const parent = el.nodeType === 1 ? el : el.parentElement;
    if (
      !parent?.closest('.ds-assistant-message-main-content') ||
      parent.closest('aside,nav,.more-genui-surface')
    )
      return;
    answerId = parent.closest('[data-virtual-list-item-key]')?.dataset.virtualListItemKey ?? '';
    selected = sel.toString().trim();
    if (!selected) return;
    const rect = range.getBoundingClientRect();
    add.textContent = input?.value ? '追加到草稿' : '填入提问';
    document.body.append(panel);
    panel.style.left = Math.max(2, Math.min(rect.left, innerWidth - panel.offsetWidth - 4)) + 'px';
    panel.style.top =
      Math.max(2, Math.min(rect.bottom + 4, innerHeight - panel.offsetHeight - 4)) + 'px';
  }
  document.addEventListener('mouseup', selection);
  document.addEventListener('keyup', selection);
  return {
    reset,
    update() {
      input = document.querySelector('textarea');
      if (!settings().enabled) {
        once.remove();
        panel.remove();
        reset();
        return;
      }
      if (input && settings().mode === 'demand') {
        if (once.previousElementSibling !== input) input.after(once);
      } else once.remove();
    },
    dispose() {
      document.removeEventListener('more-genui-intent-ack', acknowledge);
      document.removeEventListener('more-genui-intent-consumed', consumed);
      document.removeEventListener('more-genui-intent-submitted', consumed);
      once.remove();
      panel.remove();
      document.removeEventListener('mouseup', selection);
      document.removeEventListener('keyup', selection);
      document.removeEventListener('input', onInput, true);
    },
  };
}
