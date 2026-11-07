(() => {
  'use strict';
  let initialized = false;
  addEventListener('message', (event) => {
    if (
      initialized ||
      event.source !== parent ||
      event.data?.type !== 'more-genui-init' ||
      event.ports.length !== 1
    )
      return;
    initialized = true;
    const port = event.ports[0],
      config = event.data;
    const send = (type, value) => port.postMessage({ type, value });
    let state = config.state || {},
      failed = false;
    const report = (message) => {
      failed = true;
      send('error', String(message).slice(0, 2000));
    };
    const theme = (value) => {
      document.documentElement.dataset.theme = value === 'dark' ? 'dark' : 'light';
    };
    for (const event of ['click', 'input'])
      document.addEventListener(
        event,
        (e) => {
          if (e.isTrusted) send('interaction', true);
        },
        true,
      );
    let fastRenderer;
    const quizKey = '__moreGenuiQuizV1';
    function commit(value) {
      if (!value || Array.isArray(value) || typeof value !== 'object')
        throw Error('State must be a JSON object');
      const raw = JSON.stringify(value);
      if (new TextEncoder().encode(raw).length > 65536) throw Error('State exceeds 64 KiB');
      state = JSON.parse(raw);
      send('state', state);
    }
    const experiment = createExperimentAPI(send);
    const stepsKey = '__moreGenuiSteps';
    const stepper = createStepperAPI(
      (id) => state[stepsKey]?.[id],
      (id, v) => commit({ ...state, [stepsKey]: { ...state[stepsKey], [id]: v } }),
      report,
    );
    const quiz = createQuizAPI(
      (id) => state[quizKey]?.[id],
      (id, value) => commit({ ...state, [quizKey]: { ...state[quizKey], [id]: value } }),
      report,
    );
    Object.defineProperty(window, 'genui', {
      value: Object.freeze({
        quiz,
        stepper,
        experiment: experiment.api,
        capabilities: Object.freeze({
          quiz: 2,
          stepper: 2,
          fast: 1,
          grammar: 1,
          experiment: 1,
          state: 1,
          export: 1,
        }),
        getState() {
          const result = structuredClone(state);
          delete result[quizKey];
          delete result[stepsKey];
          return result;
        },
        setState(value) {
          if (!value || Array.isArray(value) || typeof value !== 'object')
            throw Error('State must be a JSON object');
          const next = { ...value };
          delete next[quizKey];
          delete next[stepsKey];
          if (state[stepsKey]) next[stepsKey] = state[stepsKey];
          if (state[quizKey]) next[quizKey] = state[quizKey];
          commit(next);
        },
      }),
      writable: false,
      configurable: false,
    });
    addEventListener('error', (e) => report(e.message));
    addEventListener('unhandledrejection', (e) => report(e.reason));
    port.onmessage = (e) => {
      if (e.data?.type === 'png') {
        const id = e.data.id;
        (config.spec ? fastRenderer.png() : experiment.png()).then(
          (blob) => send('png', { id, blob }),
          (e) => send('png', { id, error: String(e.message) }),
        );
      }
      if (e.data?.type === 'visibility')
        document.dispatchEvent(new CustomEvent('genui-visibility', { detail: e.data.visible }));
      if (e.data?.type === 'theme') theme(e.data.value);
    };
    if (config.spec) {
      theme(config.theme);
      document.addEventListener('genui-grammar-edit', e => send('grammar-edit', e.detail));
      fastRenderer = createFastRenderer(document.body, config.spec, () => state, commit, report);
      let height = 0;
      new ResizeObserver(() => {
        const next = Math.ceil(document.body.getBoundingClientRect().height + 32);
        if (height !== next) {
          height = next;
          send('resize', next);
        }
      }).observe(document.body);
      if (!failed) send('ready', true);
      return;
    }
    const leadingComments = /^\s*(?:<!--[^]*?-->\s*)*/.exec(config.html)[0];
    const requirement = [...leadingComments.matchAll(/<!--([^]*?)-->/g)]
      .map((match) => /^\s*more-genui-requires:\s*([^]*)$/.exec(match[1]))
      .find(Boolean);
    if (requirement) {
      try {
        const needs = JSON.parse(requirement[1]);
        if (!needs || typeof needs !== 'object' || Array.isArray(needs))
          throw Error('能力声明须为对象');
        for (const [name, min] of Object.entries(needs)) {
          if (
            !Number.isSafeInteger(min) ||
            min < 1 ||
            !Object.hasOwn(genui.capabilities, name) ||
            genui.capabilities[name] < min
          )
            throw Error('此应用需要 ' + name + '@' + min + '，请更新 More GenUI');
        }
      } catch (e) {
        report(e.message);
        return;
      }
    }
    const doc = new DOMParser().parseFromString(config.html, 'text/html');
    const scripts = [...doc.querySelectorAll('script')].map((s) => ({
      code: s.textContent,
      external: s.hasAttribute('src'),
      type: s.type,
    }));
    doc
      .querySelectorAll('script,iframe,frame,object,embed,base,meta,link')
      .forEach((n) => n.remove());
    for (const element of doc.querySelectorAll('*'))
      for (const attribute of [...element.attributes]) {
        if (
          ['href', 'srcset', 'action', 'formaction', 'target', 'ping', 'download'].includes(
            attribute.name,
          )
        )
          element.removeAttribute(attribute.name);
        if (attribute.name === 'src' && !attribute.value.startsWith('data:'))
          element.removeAttribute('src');
      }
    const style = document.createElement('style');
    style.textContent =
      ':root{--bg:#fff;--fg:#202124;--accent:#526de0;color-scheme:light}html[data-theme=dark]{--bg:#202124;--fg:#eee;color-scheme:dark}body{margin:16px;font:15px/1.5 system-ui;background:var(--bg);color:var(--fg)}input,select,button{font:inherit}svg,canvas{max-width:100%}*{box-sizing:border-box}';
    style.textContent +=
      ':root{--muted:#687078;--surface:#f5f6f7;--border:#e4e7eb;--accent:#3569c8;--chart-1:#3569c8;--chart-2:#218477;--chart-3:#b57927}html[data-theme=dark]{--muted:#a4aab2;--surface:#292c30;--border:#41454b;--accent:#8cb4ff;--chart-1:#8cb4ff;--chart-2:#65c7b3;--chart-3:#e5b26b}body{margin:0;padding:16px;font:14px/1.6 system-ui}h1,h2,h3{font-size:1rem;font-weight:600;margin:0 0 10px}p{margin:6px 0}button,select,input[type=number]{border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--fg);padding:5px 9px}input{accent-color:var(--accent)}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}label{display:block;color:var(--muted)}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.stack{display:grid;gap:12px}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.muted,figcaption{color:var(--muted);font-size:12px}.panel{background:var(--surface);padding:12px;border-radius:8px}output{font-variant-numeric:tabular-nums}';
    document.head.append(style, ...doc.head.childNodes);
    document.body.replaceChildren(...doc.body.childNodes);
    for (const a of doc.body.attributes) document.body.setAttribute(a.name, a.value);
    theme(config.theme);
    addEventListener(
      'click',
      (e) => {
        if (e.target instanceof Element && e.target.closest('a')) e.preventDefault();
      },
      true,
    );
    addEventListener('submit', (e) => e.preventDefault(), true);
    const submitLocal = (form, submitter = null) => {
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }));
    };
    addEventListener(
      'click',
      (e) => {
        const button =
          e.target instanceof Element ? e.target.closest('button,input[type=submit]') : null;
        if (button && button.type === 'submit' && button.form && !button.disabled) {
          e.preventDefault();
          queueMicrotask(() => submitLocal(button.form, button));
        }
      },
      true,
    );
    addEventListener(
      'keydown',
      (e) => {
        const input = e.target;
        if (e.key === 'Enter' && input instanceof HTMLInputElement && input.form) {
          e.preventDefault();
          submitLocal(input.form);
        }
      },
      true,
    );
    HTMLFormElement.prototype.requestSubmit = function (submitter) {
      submitLocal(this, submitter ?? null);
    };

    const content = document.createElement('div');
    content.style.display = 'flow-root';
    content.id = 'genui-content';
    content.append(...document.body.childNodes);
    document.body.append(content);
    let lastHeight = 0;
    new ResizeObserver(() => {
      const height = Math.max(24, content.getBoundingClientRect().height + 32);
      if (height !== lastHeight) {
        lastHeight = height;
        send('resize', height);
      }
    }).observe(content);
    for (const script of scripts) {
      if (script.external) {
        report('External scripts are not supported');
        continue;
      }
      if (
        script.type &&
        script.type !== 'text/javascript' &&
        script.type !== 'application/javascript'
      ) {
        report('Only classic JavaScript is supported');
        continue;
      }
      const element = document.createElement('script');
      element.textContent = script.code;
      document.body.append(element);
    }
    document.dispatchEvent(new Event('DOMContentLoaded'));
    if (!failed) send('ready', true);
  });
})();
