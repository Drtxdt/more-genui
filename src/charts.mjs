const ns = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}
export function plot(lines, { bars = false, labels, xLabel = '', yLabel = '' } = {}) {
  const svg = svgNode('svg', {
    viewBox: '0 0 540 220',
    role: 'img',
    'aria-label': [xLabel, yLabel, ...lines.map((l) => l.name)].filter(Boolean).join(' · '),
  });
  svg.style.cssText = 'display:block;width:100%;max-height:260px;color:inherit';
  const points = lines
    .flatMap((line) => line.points)
    .filter((pair) => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (!points.length) return svg;
  const xs = lines.flatMap((line) => line.points.map((p) => p[0])).filter(Number.isFinite);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(0, ...points.map((p) => p[1])),
    y1 = Math.max(0, ...points.map((p) => p[1]));
  const x = (v) => 60 + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * 445,
    y = (v) => 175 - ((v - y0) / (y1 - y0 || 1)) * 145;
  const label = (px, py, t) =>
    svg.append(svgNode('text', { x: px, y: py, fill: 'currentColor', 'font-size': 11 }, t));
  svg.append(
    svgNode('line', { x1: 42, x2: 525, y1: y(0), y2: y(0), stroke: 'currentColor', opacity: 0.4 }),
  );
  label(2, 18, yLabel);
  label(3, 35, String(y1));
  label(3, 177, String(y0));
  label(255, 215, xLabel);
  for (const [i, line] of lines.entries()) {
    const color = i ? '#d17b30' : '#4275ca';
    let path = '',
      move = true;
    for (const [xx, yy] of line.points) {
      if (!Number.isFinite(yy) || !Number.isFinite(xx)) {
        move = true;
        continue;
      }
      if (bars) {
        const width = Math.min(28, 330 / line.points.length);
        svg.append(
          svgNode('rect', {
            x: x(xx) - width / 2,
            y: Math.min(y(0), y(yy)),
            width,
            height: Math.max(0.8, Math.abs(y(0) - y(yy))),
            fill: color,
          }),
        );
      } else {
        path += (move ? 'M' : 'L') + x(xx) + ' ' + y(yy) + ' ';
        move = false;
        svg.append(svgNode('circle', { cx: x(xx), cy: y(yy), r: 2, fill: color }));
      }
    }
    if (!bars)
      svg.append(
        svgNode('path', {
          d: path,
          stroke: color,
          'stroke-width': 2,
          fill: 'none',
          'stroke-dasharray': i ? '5 3' : 'none',
        }),
      );
  }
  if (labels) {
    const step = Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach((v, i) => {
      if (i % step === 0 || i === labels.length - 1) label(x(i) - 8, 195, v);
    });
  } else {
    label(50, 195, String(x0));
    label(490, 195, String(x1));
  }
  return svg;
}
export function readTable(table) {
  const rows = [...table.rows];
  if (
    rows.length < 2 ||
    rows.length > 2001 ||
    rows[0].cells.length !== 2 ||
    ![...rows[0].cells].every((c) => c.tagName === 'TH' && c.colSpan === 1 && c.rowSpan === 1)
  )
    return;
  const labels = [],
    points = [],
    units = new Set();
  for (const row of rows.slice(1)) {
    const cells = [...row.cells];
    if (cells.length !== 2 || cells.some((c) => c.colSpan !== 1 || c.rowSpan !== 1)) return;
    const [name, raw] = cells.map((c) => c.textContent.trim());
    if (!name) return;
    labels.push(name);
    let value = null;
    if (raw && !['—', '–', 'N/A'].includes(raw)) {
      const match =
        /^([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+))\s*([%°℃\p{L}²³/·]*)$/u.exec(raw);
      if (!match) return;
      value = Number(match[1].replaceAll(',', ''));
      if (!Number.isFinite(value)) return;
      units.add(match[2]);
    }
    points.push([points.length, value]);
  }
  if (units.size !== 1) return;
  return {
    labels,
    points,
    xLabel: rows[0].cells[0].textContent.trim(),
    yLabel: [rows[0].cells[1].textContent.trim(), ...units].filter(Boolean).join(' · '),
  };
}
export class TableCharts {
  entries = new Map();
  render(message) {
    for (const table of message.querySelectorAll('.ds-assistant-message-main-content table')) {
      if (table.closest('aside,pre,.more-genui-surface')) continue;
      const signature = table.innerHTML,
        previous = this.entries.get(table);
      if (previous?.signature === signature && previous.box.isConnected) continue;
      if (previous) this.remove(table);
      const data = readTable(table);
      if (!data) continue;
      const box = document.createElement('aside'),
        chart = document.createElement('div'),
        bar = document.createElement('div');
      const entry = { box, signature, display: table.style.display };
      this.entries.set(table, entry);
      box.className = 'more-genui-table';
      box.append(bar, chart);
      table.before(box);
      for (const type of ['原表', '柱状图', '折线图']) {
        const b = document.createElement('button');
        b.textContent = type;
        b.type = 'button';
        bar.append(b);
        b.setAttribute('aria-pressed', String(type === '原表'));
        b.onclick = () => {
          for (const btn of bar.children) btn.setAttribute('aria-pressed', String(btn === b));
          table.style.display = type === '原表' ? entry.display : 'none';
          chart.replaceChildren();
          if (type !== '原表') {
            chart.append(
              plot([{ name: data.yLabel, points: data.points }], {
                ...data,
                bars: type === '柱状图',
              }),
            );
            const missing = data.labels.filter((_, i) => data.points[i][1] === null);
            if (missing.length) chart.append('缺失：' + missing.join('、'));
          }
        };
      }
    }
    for (const t of this.entries.keys()) if (!t.isConnected) this.remove(t);
  }
  remove(t) {
    const e = this.entries.get(t);
    t.style.display = e.display;
    e.box.remove();
    this.entries.delete(t);
  }
  clear() {
    for (const t of this.entries.keys()) this.remove(t);
  }
}
