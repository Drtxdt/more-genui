function mountDataChart(container, spec, restored, save) {
  const dom = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const fmt = (n) =>
    Number(n.toPrecision(6)).toLocaleString('zh-CN', { maximumSignificantDigits: 6 });
  const tools = dom('div'),
    visual = dom('div'),
    table = dom('table'),
    details = dom('details'),
    status = dom('p');
  status.setAttribute('role', 'status');
  details.append(dom('summary', '核对数据'), table);
  tools.className = 'row';
  const state = { ...restored };
  const options = (name, key, items, initial) => {
    const select = dom('select');
    select.setAttribute('aria-label', name);
    for (const [value, label] of items) select.add(new Option(label, value));
    select.value = items.some(([v]) => v === state[key]) ? state[key] : initial;
    state[key] = select.value;
    select.onchange = () => {
      state[key] = select.value;
      draw();
      save({ ...state });
    };
    const label = dom('label', name);
    label.append(select);
    tools.append(label);
    return select;
  };
  options(
    '图形',
    'style',
    [
      ['line', '折线'],
      ['bar', '柱状'],
      ['scatter', '散点'],
      ['histogram', '直方图'],
    ],
    spec.style,
  );
  const groups = [...new Set(spec.points?.map((p) => p.group).filter(Boolean))];
  if (groups.length) options('筛选', 'group', [['', '全部'], ...groups.map((s) => [s, s])], '');
  const aggregate = options(
    '同一横坐标',
    'aggregation',
    [
      ['raw', '原值'],
      ['mean', '均值'],
      ['sum', '合计'],
    ],
    'raw',
  );
  if (spec.sample) {
    const seed = dom('input');
    seed.type = 'number';
    seed.min = '0';
    seed.max = '4294967295';
    seed.step = '1';
    state.seed =
      Number.isInteger(state.seed) && state.seed >= 0 && state.seed <= 4294967295
        ? state.seed
        : spec.sample.seed;
    seed.value = String(state.seed);
    const label = dom('label', '随机种子');
    label.append(seed);
    tools.append(label);
    seed.oninput = () => {
      if (!seed.value || !seed.validity.valid) {
        status.textContent = '请输入 0–4294967295 的整数';
        return;
      }
      state.seed = seed.valueAsNumber;
      draw();
      save({ ...state });
    };
  }
  container.append(tools, visual, details, status);
  function draw() {
    const points = spec.points ?? FastValidation.sampleMeans(spec.sample, state.seed);
    const histogram = state.style === 'histogram';
    aggregate.disabled = histogram;
    const rows = FastValidation.chartRows(points, { ...state, bins: spec.bins, histogram });
    visual.replaceChildren();
    table.replaceChildren();
    const xLabel = histogram ? spec.yLabel : spec.xLabel,
      yLabel = histogram ? '频数' : spec.yLabel;
    const tr = table.insertRow();
    for (const v of [xLabel, yLabel, '区间', '分组']) tr.append(dom('th', v));
    for (const p of rows) {
      const row = table.insertRow();
      for (const cell of [
        p.end === undefined ? fmt(p.x) : fmt(p.x) + ' – ' + fmt(p.end),
        fmt(p.y),
        p.low === undefined ? '—' : fmt(p.low) + ' – ' + fmt(p.high),
        p.group ?? '—',
      ])
        row.insertCell().textContent = cell;
    }
    status.textContent = rows.length + ' 条图表数据';
    if (!rows.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 480 210');
    svg.style.cssText = 'width:100%;max-height:280px';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', xLabel + ' / ' + yLabel);
    const mark = (name, attributes) => {
      const n = document.createElementNS(svg.namespaceURI, name);
      for (const [k, v] of Object.entries(attributes)) n.setAttribute(k, String(v));
      svg.append(n);
      return n;
    };
    const bars = histogram || state.style === 'bar',
      xs = rows.map((p) => p.x);
    const xmin = Math.min(...xs),
      xmax = Math.max(...rows.map((p) => p.end ?? p.x));
    const ymin = Math.min(...rows.map((p) => p.low ?? p.y), bars ? 0 : Infinity),
      ymax = Math.max(...rows.map((p) => p.high ?? p.y), bars ? 0 : -Infinity);
    const x = (v) => (xmin === xmax ? 258 : 56 + (404 * (v - xmin)) / (xmax - xmin));
    const y = (v) => (ymin === ymax ? 98 : 174 - (152 * (v - ymin)) / (ymax - ymin));
    const line = (x1, y1, x2, y2, color = 'currentColor') =>
      mark('line', { x1, y1, x2, y2, stroke: color });
    const caption = (v, xx, yy, anchor = 'start') => {
      mark('text', {
        x: xx,
        y: yy,
        fill: 'currentColor',
        'font-size': 11,
        'text-anchor': anchor,
      }).textContent = v;
    };
    line(52, 174, 468, 174);
    line(52, 16, 52, 174);
    caption(fmt(ymax), 48, 22, 'end');
    caption(fmt(ymin), 48, 174, 'end');
    caption(fmt(xmin), 53, 188);
    caption(fmt(xmax), 463, 188, 'end');
    caption(yLabel, 6, 12);
    caption(xLabel, 258, 206, 'middle');
    const sorted = [...rows].sort((a, b) => a.x - b.x);
    if (state.style === 'line') {
      const series = new Map();
      for (const p of sorted) {
        const g = p.group ?? '';
        if (!series.has(g)) series.set(g, []);
        series.get(g).push(p);
      }
      for (const values of series.values())
        mark('polyline', {
          points: values.map((p) => x(p.x) + ',' + y(p.y)).join(' '),
          stroke: 'var(--accent)',
          'stroke-width': 2,
          fill: 'none',
        });
    }
    for (const p of rows) {
      const xx = x(p.x),
        yy = y(p.y);
      if (bars) {
        const w =
          histogram && p.end !== p.x
            ? Math.max(0.3, x(p.end) - xx - 1)
            : Math.min(16, 320 / rows.length);
        mark('rect', {
          x: histogram ? xx : xx - w / 2,
          y: Math.min(y(0), yy),
          width: w,
          height: Math.max(0.4, Math.abs(y(0) - yy)),
          fill: 'var(--accent)',
        });
      } else mark('circle', { cx: xx, cy: yy, r: 3, fill: 'var(--accent)' });
      if (p.low !== undefined) {
        line(xx, y(p.low), xx, y(p.high));
        line(xx - 3, y(p.low), xx + 3, y(p.low));
        line(xx - 3, y(p.high), xx + 3, y(p.high));
      }
    }
    visual.append(svg);
  }
  draw();
}
