import { plot } from './charts.mjs';
function el(tag, text) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
}
function download(name, blob) {
  const url = URL.createObjectURL(blob),
    a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? '');
          if (typeof value === 'string' && /^\s*[=+@-]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
}
export function appParams(state) {
  const { __moreGenuiQuizV1, __moreGenuiSteps, ...params } = state;
  return params;
}
export function experimentPanel({ app, repository, keysPromise, state, restore, png, status }) {
  const panel = el('div'),
    name = el('input'),
    list = el('select'),
    tools = el('div'),
    comparison = el('div');
  panel.hidden = true;
  panel.style.cssText = 'padding:8px 12px';
  tools.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  name.placeholder = '快照名称';
  name.setAttribute('aria-label', '快照名称');
  list.setAttribute('aria-label', '已存快照');
  let snapshots = [],
    data = {},
    locked = null,
    loaded = false;
  const params = () => appParams(state());
  const key = async () => 'mg:snapshots:' + (await keysPromise).latest;
  const renderList = () => {
    list.replaceChildren(...snapshots.map((s) => new Option(s.name, s.id)));
  };
  async function load() {
    if (!loaded) {
      snapshots = (await repository.storage.get(await key())) ?? [];
      renderList();
      loaded = true;
    }
  }
  async function persist(change) {
    const storageKey = await key();
    await navigator.locks.request(storageKey, async () => {
      const next = change((await repository.storage.get(storageKey)) ?? []);
      await repository.storage.set(storageKey, next);
      snapshots = next;
      renderList();
    });
  }
  function button(text, fn) {
    const b = el('button', text);
    b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      try {
        await load();
        await fn();
      } catch (e) {
        status(String(e.message ?? e));
      } finally {
        b.disabled = false;
      }
    };
    tools.append(b);
    return b;
  }
  tools.append(name);
  button('保存快照', async () => {
    const title = name.value.trim();
    if (!title) throw Error('请填写快照名称');
    const id = crypto.randomUUID();
    const snapshot = {
      id,
      name: title.slice(0, 80),
      params: params(),
      metrics: data.metrics ?? [],
      series: data.series ?? [],
    };
    await persist((saved) => {
      if (saved.length >= 24) throw Error('当前应用最多保存 24 个快照');
      return [...saved, snapshot];
    });
    list.value = id;
    name.value = '';
  });
  tools.append(list);
  const selected = () => {
    const s = snapshots.find((s) => s.id === list.value);
    if (!s) throw Error('请选择快照');
    return s;
  };
  button('恢复', () => restore(selected().params));
  button('删除', () => {
    const id = selected().id;
    return persist((saved) => saved.filter((s) => s.id !== id));
  });
  button('复制参数', () => navigator.clipboard.writeText(JSON.stringify(params(), null, 2)));
  button('导出 JSON', () =>
    download(
      app.id + '.json',
      new Blob([JSON.stringify(params(), null, 2)], { type: 'application/json' }),
    ),
  );
  const rows = () => {
    if (!Array.isArray(data.rows) || !data.rows.length || !data.rows.every(Array.isArray))
      throw Error('应用尚未登记表格');
    return csv(data.rows);
  };
  const copyCsv = button('复制 CSV', () => navigator.clipboard.writeText(rows()));
  const csvButton = button('导出 CSV', () =>
    download(app.id + '.csv', new Blob(['\ufeff', rows()], { type: 'text/csv;charset=utf-8' })),
  );
  const pngButton = button('导出 PNG', async () => download(app.id + '.png', await png()));
  const copyPng = button('复制 PNG', () =>
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]),
  );
  const lock = button('锁定 A', () => {
    locked = {
      params: params(),
      metrics: structuredClone(data.metrics ?? []),
      series: structuredClone(data.series ?? []),
    };
    compare();
  });
  const unlock = button('解除对照', () => {
    locked = null;
    compare();
  });
  const presets = el('select');
  presets.setAttribute('aria-label', '预设场景');
  tools.append(presets);
  const applyPreset = button('应用预设', () => {
    const preset = data.presets?.[Number(presets.value)];
    if (preset) return restore(preset.params);
  });
  function compare() {
    comparison.replaceChildren();
    unlock.hidden = !locked;
    if (!locked) return;
    const lines = [['参数', 'A', 'B', 'B−A']];
    const current = params();
    for (const key of new Set([...Object.keys(locked.params), ...Object.keys(current)])) {
      const a = locked.params[key],
        b = current[key];
      lines.push([
        key,
        JSON.stringify(a) ?? '—',
        JSON.stringify(b) ?? '—',
        Number.isFinite(a) && Number.isFinite(b) ? String(Number((b - a).toPrecision(10))) : '—',
      ]);
    }
    for (const a of locked.metrics) {
      const b = data.metrics?.find((m) => m.name === a.name && m.unit === a.unit);
      lines.push([
        a.name + ' ' + (a.unit ?? ''),
        a.value,
        b?.value ?? '—',
        b ? Number((b.value - a.value).toPrecision(10)) : '—',
      ]);
    }
    const table = el('table');
    for (const [i, line] of lines.entries()) {
      const tr = table.insertRow();
      for (const value of line) tr.append(el(i ? 'td' : 'th', value));
    }
    comparison.append(table);
    for (const a of locked.series) {
      const b = data.series?.find(
        (s) =>
          s.name === a.name &&
          s.xLabel === a.xLabel &&
          s.yLabel === a.yLabel &&
          s.xUnit === a.xUnit &&
          s.yUnit === a.yUnit,
      );
      if (b) {
        comparison.append(
          el('small', a.name + ' · A 实线 / B 虚线'),
          plot(
            [
              { name: 'A', points: a.points },
              { name: 'B', points: b.points },
            ],
            { xLabel: a.xLabel + ' ' + a.xUnit, yLabel: a.yLabel + ' ' + a.yUnit },
          ),
        );
      }
    }
  }
  function validSeries(s) {
    return (
      s &&
      ['name', 'xLabel', 'yLabel', 'xUnit', 'yUnit'].every((k) => typeof s[k] === 'string') &&
      Array.isArray(s.points) &&
      s.points.length <= 2000 &&
      s.points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          Number.isFinite(p[0]) &&
          (Number.isFinite(p[1]) || p[1] === null),
      )
    );
  }
  panel.append(tools, comparison);
  function display() {
    copyCsv.hidden = csvButton.hidden = !data.rows?.length;
    copyPng.hidden = pngButton.hidden = !data.hasFigure;
  }
  display();
  return {
    panel,
    async toggle() {
      await load();
      panel.hidden = !panel.hidden;
    },
    update(value) {
      data = {
        ...value,
        metrics: Array.isArray(value.metrics)
          ? value.metrics.filter((m) => m && typeof m.name === 'string' && Number.isFinite(m.value))
          : [],
        series: Array.isArray(value.series) ? value.series.filter(validSeries) : [],
        presets: Array.isArray(value.presets)
          ? value.presets.filter(
              (p) =>
                p &&
                typeof p.name === 'string' &&
                p.params &&
                typeof p.params === 'object' &&
                !Array.isArray(p.params),
            )
          : [],
      };
      presets.replaceChildren(...data.presets.map((p, i) => new Option(p.name, i)));
      presets.hidden = applyPreset.hidden = !data.presets.length;
      display();
      compare();
    },
    changed() {
      compare();
    },
    dispose() {},
  };
}
