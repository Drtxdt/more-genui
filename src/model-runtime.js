function mountNumericModel(container, model, load, save) {
  const order = FastValidation.compileModel(model);
  const restored = load() ?? {};
  const controls = new Map(),
    checked = new Set((model.checklist ?? []).filter((id) => restored.checked?.includes?.(id)));
  const results = new Map();
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const status = element('p');
  status.setAttribute('role', 'status');
  for (const def of model.inputs) {
    const label = element('label', def.label + (def.unit === '1' ? '' : ' (' + def.unit + ')'));
    const control = element('input');
    control.type = def.kind === 'slider' ? 'range' : 'number';
    control.min = def.min;
    control.max = def.max;
    control.step = def.step;
    control.value = FastValidation.allowedInput(def, restored.inputs?.[def.id])
      ? restored.inputs[def.id]
      : def.value;
    const current = element('output');
    controls.set(def.id, { control, current });
    label.append(control, current);
    container.append(label);
    control.oninput = () => update(true);
  }
  const equations = element('details');
  equations.append(element('summary', '查看计算公式'));
  for (const def of model.outputs) {
    const row = element('div'),
      value = element('output');
    const label = element('label', def.label + ' ');
    if (model.checklist?.includes(def.id)) {
      const box = element('input');
      box.type = 'checkbox';
      box.checked = checked.has(def.id);
      box.onchange = () => {
        if (box.checked) checked.add(def.id);
        else checked.delete(def.id);
        update(true);
      };
      label.prepend(box);
    }
    results.set(def.id, value);
    row.append(label, value);
    container.append(row);
    equations.append(element('p', def.label + ' = ' + def.op + '(' + def.args.join(', ') + ')'));
  }
  const copy = element('button', '复制当前清单');
  let list = '';
  if (model.checklist) {
    container.append(copy);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(list);
        status.textContent = '已复制';
      } catch {
        const field = element('textarea');
        field.value = list;
        field.setAttribute('aria-label', '当前清单');
        container.append(field);
        field.select();
        if (document.execCommand('copy')) {
          field.remove();
          status.textContent = '已复制';
        } else {
          status.textContent = '请复制选中的清单';
          field.onblur = () => field.remove();
        }
      }
    };
  }
  container.append(equations, status);
  const comparison = element('div');
  let chartState = restored.chart;
  if (model.sweep) container.append(comparison);
  function update(persist) {
    const inputs = {};
    for (const [id, { control, current }] of controls) {
      inputs[id] = control.valueAsNumber;
      current.value = control.value;
      control.setAttribute('aria-invalid', String(!control.validity.valid || !control.value));
    }
    try {
      const values = FastValidation.calculateModel(model, inputs, order);
      if (model.sweep) {
        comparison.replaceChildren();
        const s = model.sweep,
          input = model.inputs.find((n) => n.id === s.input);
        const outputs = s.outputs.map((id) => model.outputs.find((n) => n.id === id));
        const points = s.values.flatMap((x) => {
          const result = FastValidation.calculateModel(model, { ...inputs, [input.id]: x }, order);
          return outputs.map((o) => ({ x, y: result[o.id], group: o.label }));
        });
        mountDataChart(
          comparison,
          {
            style: 'line',
            xLabel: input.label + ' (' + input.unit + ')',
            yLabel: outputs[0].unit,
            points,
          },
          chartState,
          (value) => {
            chartState = value;
            save({ inputs, checked: [...checked], chart: value });
          },
        );
      }
      for (const def of model.outputs) {
        const digits = def.unit === 'CNY' ? 2 : undefined;
        results.get(def.id).value =
          values[def.id].toLocaleString('zh-CN', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits ?? 6,
          }) + (def.unit === '1' ? '' : ' ' + def.unit);
      }
      if (model.checklist) {
        list = model.checklist
          .map(
            (id) =>
              (checked.has(id) ? '☑ ' : '☐ ') +
              model.outputs.find((n) => n.id === id).label +
              ' ' +
              results.get(id).value,
          )
          .join('\n');
        status.textContent = '已完成 ' + checked.size + '/' + model.checklist.length;
      } else status.textContent = '';
      copy.disabled = false;
      if (persist) save({ inputs, checked: [...checked], chart: chartState });
    } catch (error) {
      comparison.replaceChildren();
      for (const value of results.values()) value.value = '—';
      status.textContent = error.message;
      copy.disabled = true;
    }
  }
  update(false);
}
