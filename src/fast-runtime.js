function createFastRenderer(root, initial, read, save, report) {
  initial = FastValidation.validateView(initial);
  const resources = new Map();
  function track(container, fn) {
    if (!resources.has(container)) resources.set(container, []);
    resources.get(container).push(fn);
  }
  function cleanup(container) {
    for (const [owner, list] of [...resources])
      if (owner === container || container.contains(owner)) {
        resources.delete(owner);
        for (const fn of list) fn();
      }
  }

  const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const button = (label, fn) => {
    const b = el('button', label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  };
  const style = el('style');
  style.textContent =
    'body{font:14px/1.6 system-ui;margin:0;padding:16px;background:var(--bg,#fff);color:var(--fg,#202124)}*{box-sizing:border-box}button,select,textarea{font:inherit;background:var(--bg,#fff);color:inherit;border:1px solid #8886;border-radius:6px;padding:5px 9px}button{cursor:pointer}button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent,#3569c8)}mark{display:block;white-space:pre-wrap;overflow-wrap:anywhere}input{font:inherit;background:var(--bg,#fff);color:inherit;border:1px solid #8886;border-radius:6px;padding:5px 9px}.fast-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.fast-scroll{overflow:auto;max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #8885;padding:6px;text-align:left}td button{width:100%;border:0;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere}svg{max-width:100%;height:auto}mark,[aria-pressed=true]{background:color-mix(in srgb,var(--accent,#3569c8) 20%,transparent);color:inherit}h2,h3{font-size:1rem}textarea{width:100%;min-height:100px}';
  document.head.append(style);
  function render(container, view, path, context) {
    cleanup(container);
    container.replaceChildren();
    if (view.kind === 'compare') {
      const columns = el('div');
      columns.className = 'fast-columns';
      const old = new Set(view.before.lines),
        next = new Set(view.after.lines);
      for (const [side, other] of [
        [view.before, next],
        [view.after, old],
      ]) {
        const block = el('section');
        block.append(el('h3', side.label));
        for (const line of side.lines) block.append(el(other.has(line) ? 'pre' : 'mark', line));
        columns.append(block);
      }
      container.append(columns);
      if (view.note) container.append(el('p', view.note));
    } else if (view.kind === 'matrix') {
      const scroll = el('div');
      scroll.className = 'fast-scroll';
      const table = el('table'),
        head = el('tr');
      head.append(el('th', ''));
      for (const col of view.columns) head.append(el('th', col));
      table.append(head);
      const detail = el('p');
      detail.setAttribute('role', 'status');
      const cellMap = new Map(view.cells.map((c) => [JSON.stringify([c.row, c.column]), c]));
      const buttons = [];
      for (const row of view.rows) {
        const tr = el('tr'),
          th = el('th', row);
        th.scope = 'row';
        tr.append(th);
        for (const col of view.columns) {
          const cell = cellMap.get(JSON.stringify([row, col])),
            td = el('td');
          const b = button((cell?.conflict ? '⚠ ' : '') + (cell?.text ?? '—'), () => {
            save({ ...read(), [path]: [row, col] });
            detail.textContent =
              row + ' / ' + col + '：' + (cell?.explanation ?? cell?.text ?? '空单元格');
            for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
          });
          b.setAttribute('aria-label', row + ' / ' + col);
          if (view.highlight?.[0] === row && view.highlight?.[1] === col)
            b.style.outline = '2px solid var(--accent,#3569c8)';
          b.tabIndex = buttons.length ? -1 : 0;
          buttons.push(b);
          td.append(b);
          tr.append(td);
        }
        table.append(tr);
      }
      scroll.append(table);
      container.append(scroll, detail);
      buttons.forEach(
        (b, index) =>
          (b.onkeydown = (e) => {
            let next = index;
            if (e.key === 'ArrowRight') next++;
            else if (e.key === 'ArrowLeft') next--;
            else if (e.key === 'ArrowDown') next += view.columns.length;
            else if (e.key === 'ArrowUp') next -= view.columns.length;
            else return;
            e.preventDefault();
            next = Math.max(0, Math.min(buttons.length - 1, next));
            b.tabIndex = -1;
            buttons[next].tabIndex = 0;
            buttons[next].focus();
          }),
      );
      const selected = read()[path];
      if (Array.isArray(selected)) {
        const index =
          view.rows.indexOf(selected[0]) * view.columns.length + view.columns.indexOf(selected[1]);
        if (index >= 0) buttons[index]?.click();
      }
    } else if (view.kind === 'switch') {
      const select = el('select');
      select.setAttribute('aria-label', '切换条件');
      for (const option of view.options) select.add(new Option(option.label, option.id));
      const content = el('div');
      select.value = read()[path] ?? view.options[0].id;
      const update = () => {
        const selected = view.options.find((o) => o.id === select.value) ?? view.options[0];
        save({ ...read(), [path]: selected.id });
        render(content, selected.view, path + '/' + selected.id, context);
      };
      select.onchange = update;
      container.append(select, content);
      update();
    } else if (view.kind === 'state-diagram') {
      const ns = 'http://www.w3.org/2000/svg',
        svg = document.createElementNS(ns, 'svg');
      const height = Math.ceil(view.nodes.length / 4) * 100 + 40;
      svg.setAttribute('viewBox', '0 0 720 ' + height);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', '状态关系图');
      const positions = new Map(
        view.nodes.map((n, i) => [n.id, [90 + (i % 4) * 180, 60 + Math.floor(i / 4) * 100]]),
      );
      const detail = el('p');
      detail.setAttribute('role', 'status');
      const node = (tag, attrs, text) => {
        const n = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text !== undefined) n.textContent = text;
        return n;
      };
      const arrowId = 'fast-arrow-' + crypto.randomUUID();
      const defs = node('defs', {}),
        marker = node('marker', {
          id: arrowId,
          viewBox: '0 0 10 10',
          refX: 9,
          refY: 5,
          markerWidth: 7,
          markerHeight: 7,
          orient: 'auto-start-reverse',
        });
      marker.append(node('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: 'currentColor' }));
      defs.append(marker);
      svg.append(defs);
      for (const edge of view.edges) {
        const [x1, y1] = positions.get(edge.from),
          [x2, y2] = positions.get(edge.to);
        const high = view.highlight?.includes(edge.id);
        const dx = x2 - x1,
          dy = y2 - y1,
          t =
            dx || dy
              ? Math.min(dx ? 65 / Math.abs(dx) : Infinity, dy ? 22 / Math.abs(dy) : Infinity)
              : 0;
        const sx = x1 + dx * t,
          sy = y1 + dy * t,
          ex = x2 - dx * t,
          ey = y2 - dy * t;
        svg.append(
          node('path', {
            d:
              edge.from === edge.to
                ? `M ${x1 - 15} ${y1 - 20} C ${x1 - 70} ${y1 - 70},${x1 + 70} ${y1 - 70},${x1 + 15} ${y1 - 20}`
                : `M ${sx} ${sy} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 20} ${ex} ${ey}`,
            fill: 'none',
            stroke: high ? '#c66' : 'currentColor',
            'stroke-width': high ? '4' : '1.5',
            'marker-end': 'url(#' + arrowId + ')',
          }),
        );
        svg.append(
          node(
            'text',
            {
              x: (x1 + x2) / 2,
              y: (y1 + y2) / 2 - 12,
              'text-anchor': 'middle',
              fill: 'currentColor',
            },
            edge.label ?? '',
          ),
        );
      }
      for (const n of view.nodes) {
        const [x, y] = positions.get(n.id),
          g = node('g', { tabindex: 0, role: 'button', 'aria-label': n.label });
        g.append(
          node('rect', {
            x: x - 65,
            y: y - 22,
            width: 130,
            height: 44,
            rx: 8,
            fill: view.highlight?.includes(n.id) ? '#3569c8' : '#eef1f8',
            stroke: 'currentColor',
          }),
          node(
            'text',
            {
              x,
              y: y + 5,
              'text-anchor': 'middle',
              fill: view.highlight?.includes(n.id) ? 'white' : '#202124',
            },
            n.label,
          ),
        );
        const choose = () => (detail.textContent = n.explanation ?? n.label);
        g.onclick = choose;
        g.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose();
          }
        };
        svg.append(g);
      }
      container.append(svg, detail);
    } else if (view.kind === 'quiz') {
      genui.quiz.mount(container, {
        id: path.replace(/[^A-Za-z0-9_-]/g, '_'),
        questions: view.questions,
      });
    } else if (view.kind === 'stepper') {
      const target = el('div');
      container.append(target);
      const api = genui.stepper.mount(target, {
        id: path.replace(/[^A-Za-z0-9_-]/g, '_'),
        scene: view.scene,
        steps: view.steps,
      });
      if (api?.dispose) track(container, () => api.dispose());
    } else if (view.kind === 'lesson') {
      const shared = view.grammar
        ? { grammar: view.grammar, key: path + '/grammar', listeners: new Set() }
        : context;
      for (const [i, section] of view.sections.entries()) {
        const child = el('section');
        child.append(el('h2', section.title));
        const content = el('div');
        child.append(content);
        container.append(child);
        render(content, section.view, path + '/' + i, shared);
      }
    } else if (view.kind === 'grammar') {
      const editor = el('textarea');
      editor.setAttribute('aria-label', '产生式（符号间用空格）');
      const formatGrammar = (g) =>
        g.productions.map((p) => p.lhs + ' → ' + (p.rhs.join(' ') || 'ε')).join('\n');
      const savedGrammar =
        read()[context?.key ?? path]?.grammar ?? view.grammar ?? context?.grammar;
      if (!savedGrammar) {
        container.append(el('p', '需要文法输入'));
        return;
      }
      editor.value = formatGrammar(savedGrammar);
      const input = el('input');
      input.type = 'text';
      input.setAttribute('aria-label', '输入串（符号间用空格）');
      input.value = (read()[path]?.input ?? view.input ?? []).join(' ');
      const output = el('div'),
        error = el('p');
      error.setAttribute('role', 'status');
      const productionLabel = el('label', '产生式（符号间用空格，ε 表示空串）');
      productionLabel.style.display = 'block';
      productionLabel.append(editor);
      const start = el('input');
      start.setAttribute('aria-label', '开始符号');
      start.value = savedGrammar.start;
      const startLabel = el('label', '开始符号 ');
      startLabel.append(start);
      const inputLabel = el('label', '分析输入串 ');
      inputLabel.append(input);
      container.append(
        productionLabel,
        startLabel,
        inputLabel,
        button('重新计算', () => compute(false, true)),
        button('消除直接左递归', () => compute(true, true)),
        error,
        output,
      );
      let localRevision = 0,
        broadcast = false,
        pendingGrammar = savedGrammar,
        pendingInput = view.input ?? [];
      const sharedUpdate = (grammar) => {
        editor.value = formatGrammar(grammar);
        start.value = grammar.start;
        compute();
      };
      context?.listeners.add(sharedUpdate);
      track(container, () => context?.listeners.delete(sharedUpdate));
      const workerURL = URL.createObjectURL(
        new Blob([GRAMMAR_WORKER_SOURCE], { type: 'text/javascript' }),
      );
      const grammarWorker = new Worker(workerURL);
      track(container, () => {
        grammarWorker.terminate();
        URL.revokeObjectURL(workerURL);
      });
      grammarWorker.onmessage = (event) => {
        const message = event.data;
        if (message.revision !== localRevision) return;
        if (message.error) {
          error.textContent = message.error;
          return;
        }
        error.textContent = '';
        cleanup(output);
        output.replaceChildren();
        const a = message.analysis;
        const currentGrammar = message.transformed ?? {
          start: a.start,
          productions: a.productions,
        };
        const nextState = { ...read(), [context?.key ?? path]: { grammar: currentGrammar } };
        nextState[path] = { ...nextState[path], input: pendingInput };
        save(nextState);
        if (context && broadcast) {
          context.grammar = currentGrammar;
          for (const listener of context.listeners)
            if (listener !== sharedUpdate) listener(currentGrammar);
          broadcast = false;
        }
        if (message.transformed) {
          const comparison = el('div');
          output.append(comparison);
          render(
            comparison,
            {
              kind: 'compare',
              before: { label: '变换前', lines: formatGrammar(pendingGrammar).split('\n') },
              after: { label: '变换后', lines: formatGrammar(message.transformed).split('\n') },
            },
            path + '/transform',
          );
          editor.value = formatGrammar(message.transformed);
          save({ ...read(), [path]: { grammar: message.transformed } });
        }
        const sets = el(
          'pre',
          a.nonterminals
            .map(
              (n) =>
                n +
                '  FIRST={' +
                a.first[n].join(', ') +
                '}  FOLLOW={' +
                a.follow[n].join(', ') +
                '}',
            )
            .join('\n'),
        );
        output.append(
          sets,
          el(
            'p',
            a.leftRecursive.length ? '左递归：' + a.leftRecursive.join(', ') : '未检测到左递归',
          ),
        );
        const matrix = {
          kind: 'matrix',
          rows: a.nonterminals,
          columns: [...a.terminals, '$'],
          cells: [],
        };
        for (const n of a.nonterminals)
          for (const [t, entries] of Object.entries(a.table[n]))
            matrix.cells.push({
              row: n,
              column: t,
              text: entries
                .map((e) => {
                  const p = a.productions.find((p) => p.id === e.production);
                  return p.lhs + ' → ' + (p.rhs.join(' ') || 'ε');
                })
                .join(' / '),
              conflict: entries.length > 1,
              explanation: entries
                .map((e) =>
                  (() => {
                    const p = a.productions.find((p) => p.id === e.production);
                    return p.lhs + ' → ' + (p.rhs.join(' ') || 'ε') + ' ← ' + e.reasons.join('、');
                  })(),
                )
                .join('；'),
            });
        const target = el('div');
        output.append(target);
        render(target, matrix, path + '/table');
        const trace = message.trace;
        if (trace) {
          output.append(
            el(
              'p',
              '分析结果：' +
                ({
                  accepted: '接受',
                  rejected: '拒绝',
                  'invalid-input': '输入包含文法之外的符号',
                  'not-ll1': '文法不满足确定性 LL(1) 分析条件',
                  limit: '已达到分析步数上限',
                }[trace.status] ?? trace.status),
            ),
          );
          if (trace.steps.length) {
            const target = el('div');
            output.append(target);
            render(
              target,
              {
                kind: 'stepper',
                steps: trace.steps.map((s) => ({
                  title: s.action,
                  text: '栈：' + s.stack.join(' ') + '\n输入：' + s.input.join(' '),
                  frame: {
                    ...matrix,
                    cells: matrix.cells,
                    highlight: s.cell,
                  },
                })),
              },
              path + '/trace',
            );
          }
        }
      };
      grammarWorker.onerror = () => (error.textContent = '文法计算无法启动，请重新运行应用');
      function compute(transform = false, share = false) {
        try {
          const lines = editor.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const productions = lines.flatMap((line, index) => {
            const parts = line.split(/\s*(?:→|->)\s*/);
            if (parts.length !== 2 || !parts[0])
              throw Error('第 ' + (index + 1) + ' 行需要 左部 → 右部');
            return parts[1].split('|').map((rhs, j) => ({
              id: 'p' + index + '_' + j,
              lhs: parts[0],
              rhs: rhs.trim() === 'ε' || !rhs.trim() ? [] : rhs.trim().split(/\s+/),
            }));
          });
          const grammar = { start: start.value.trim(), productions },
            tokens = input.value.trim() ? input.value.trim().split(/\s+/) : [];
          broadcast = share;
          pendingGrammar = grammar;
          pendingInput = tokens;
          localRevision++;
          grammarWorker.postMessage({
            revision: localRevision,
            grammar,
            input: tokens,
            transform: transform === true,
          });
        } catch (e) {
          error.textContent = String(e.message);
        }
      }
      compute();
    }
  }
  function dispose() {
    cleanup(root);
    style.remove();
  }
  render(root, initial, '__fast');
  return {
    dispose,
    render: (target, view) => render(target, view, '__scene'),
    async png() {
      const rect = root.getBoundingClientRect(),
        canvas = document.createElement('canvas');
      canvas.width = Math.min(4096, Math.max(320, Math.ceil(root.scrollWidth)));
      canvas.height = Math.min(4096, Math.max(120, Math.ceil(root.scrollHeight)));
      const ctx = canvas.getContext('2d'),
        bodyStyle = getComputedStyle(document.body);
      ctx.fillStyle =
        bodyStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : bodyStyle.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const node of root.querySelectorAll('h2,h3,p,pre,mark,th,td')) {
        const box = node.getBoundingClientRect(),
          style = getComputedStyle(node);
        if (!box.width || !box.height) continue;
        const x = box.left - rect.left,
          y = box.top - rect.top;
        ctx.fillStyle = style.color;
        ctx.font = style.font || '14px system-ui';
        if (node.matches('th,td')) {
          ctx.strokeStyle = '#888888';
          ctx.strokeRect(x, y, box.width, box.height);
        }
        const lines = node.innerText.split('\n');
        lines.forEach((line, i) =>
          ctx.fillText(line, x + 5, y + 18 + i * 20, Math.max(1, box.width - 10)),
        );
      }
      for (const svg of root.querySelectorAll('svg')) {
        const box = svg.getBoundingClientRect(),
          copy = svg.cloneNode(true);
        copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        copy.setAttribute('width', String(box.width));
        copy.setAttribute('height', String(box.height));
        copy.style.color = bodyStyle.color;
        const image = new Image();
        image.src =
          'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(new XMLSerializer().serializeToString(copy));
        await image.decode();
        ctx.drawImage(image, box.left - rect.left, box.top - rect.top, box.width, box.height);
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size > 8388608) throw Error('PNG 超过上限');
      return blob;
    },
  };
}
