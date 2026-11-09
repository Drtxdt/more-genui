import { z } from 'zod';

const symbol = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const label = z.string().min(1).max(160);
// Values are evaluated in grams, metres, cents and calendar months.
const units = new Map(
  Object.entries({
    1: [1, ''],
    '%': [0.01, ''],
    g: [1, 'mass'],
    kg: [1000, 'mass'],
    m: [1, 'length'],
    cm: [0.01, 'length'],
    'm²': [1, 'area'],
    V: [1, 'volt'],
    A: [1, 'amp'],
    Ω: [1, 'resistance'],
    CNY: [100, 'money'],
    fen: [1, 'money'],
    month: [1, 'time'],
    year: [12, 'time'],
  }),
);
const unit = z.enum([...units.keys()]);
const input = z
  .object({
    id: symbol,
    label,
    kind: z.enum(['slider', 'number-input']),
    unit,
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().positive(),
    value: z.number().finite(),
  })
  .strict();
const formula = z
  .object({
    id: symbol,
    label,
    kind: z.literal('computed-value'),
    unit,
    op: z.enum(['add', 'sub', 'mul', 'div', 'convert', 'months', 'annuity', 'share']),
    args: z.array(symbol).min(1).max(32),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export const modelSchema = z
  .object({
    kind: z.literal('model'),
    inputs: z.array(input).min(1).max(64),
    outputs: z.array(formula).min(1).max(96),
    checklist: z.array(symbol).min(1).max(64).optional(),
    sweep: z
      .object({
        input: symbol,
        values: z.array(z.number().finite()).min(2).max(128),
        outputs: z.array(symbol).min(1).max(4),
      })
      .strict()
      .optional(),
  })
  .strict();

function dimensions(f, args) {
  const [a, b] = args;
  if (f.op === 'share') {
    if (
      a === 'money' &&
      args.length > 1 &&
      args.slice(1).every((x) => x === b) &&
      ['', 'money'].includes(b) &&
      f.position < args.length - 1
    )
      return 'money';
  } else if (f.position !== undefined) throw Error(f.label + ' 不需要分摊位置');
  else if (f.op === 'annuity' && args.join('/') === 'money//time') return 'money';
  else if (f.op === 'convert' && args.length === 1) return a;
  else if (f.op === 'months' && args.length === 1 && a === 'time') return '';
  else if (args.length === 2) {
    if (['add', 'sub'].includes(f.op) && a === b) return a;
    if (f.op === 'mul') {
      if (!a || !b) return a || b;
      if (a === 'length' && b === a) return 'area';
      if ([a, b].sort().join('/') === 'amp/resistance') return 'volt';
    }
    if (f.op === 'div') {
      if (!b) return a;
      if (a === b) return '';
      if (a === 'volt' && b === 'resistance') return 'amp';
      if (a === 'volt' && b === 'amp') return 'resistance';
    }
  }
  throw Error(f.label + ' 的操作数或单位不兼容');
}

export function allowedInput(input, value) {
  if (!Number.isFinite(value) || value < input.min || value > input.max) return false;
  const n = (value - input.min) / input.step;
  return Number.isSafeInteger(Math.round(n)) && Math.abs(n - Math.round(n)) < 1e-7;
}

export function compileModel(model) {
  const nodes = [...model.inputs, ...model.outputs],
    lookup = new Map(nodes.map((n) => [n.id, n]));
  if (lookup.size !== nodes.length) throw Error('输入和公式 ID 必须唯一');
  const order = [],
    done = new Set(),
    visiting = new Set();
  function visit(id) {
    if (done.has(id)) return;
    const n = lookup.get(id);
    if (!n) throw Error('未知引用 ' + id);
    if (visiting.has(id)) throw Error('公式循环引用 ' + id);
    visiting.add(id);
    if (n.args) {
      n.args.forEach(visit);
      if (
        dimensions(
          n,
          n.args.map((k) => units.get(lookup.get(k).unit)[1]),
        ) !== units.get(n.unit)[1]
      )
        throw Error(n.label + ' 的结果单位不兼容');
      order.push(n);
    } else if (!allowedInput(n, n.value) || n.min >= n.max)
      throw Error(n.label + ' 的输入范围或步长无效');
    visiting.delete(id);
    done.add(id);
  }
  nodes.forEach((n) => visit(n.id));
  if (
    model.checklist?.some((id) => !lookup.get(id)?.args) ||
    new Set(model.checklist).size !== (model.checklist?.length ?? 0)
  )
    throw Error('清单引用无效');
  if (model.sweep) {
    const s = model.sweep,
      input = model.inputs.find((n) => n.id === s.input);
    const outputs = s.outputs.map((id) => model.outputs.find((o) => o.id === id));
    if (
      !input ||
      s.values.some((v) => !allowedInput(input, v)) ||
      new Set(s.values).size !== s.values.length ||
      outputs.some((o) => !o || o.unit !== outputs[0]?.unit) ||
      new Set(s.outputs).size !== s.outputs.length
    )
      throw Error('方案对照需要有效的输入取值和相同单位的结果');
  }
  return order;
}

// Distribute integer cents by largest remainder, breaking ties by participant order.
function share(total, weights, position) {
  if (![total, ...weights].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw Error('分摊金额和权重须为非负整数');
  const parts = weights.map(BigInt),
    sum = parts.reduce((a, b) => a + b, 0n);
  if (!sum) throw Error('至少选择一位参与者');
  const amounts = parts.map((w) => (BigInt(total) * w) / sum);
  const ranking = parts
    .map((w, i) => ({ i, rem: (BigInt(total) * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const extra = BigInt(total) - amounts.reduce((a, b) => a + b, 0n);
  for (const { i } of ranking.slice(0, Number(extra))) amounts[i]++;
  return Number(amounts[position]);
}
export function calculateModel(model, edits = {}, order = compileModel(model)) {
  const values = new Map();
  function store(node, v) {
    if (!Number.isFinite(v)) throw Error(node.label + ' 的结果超出范围');
    if (units.get(node.unit)[1] === 'money') {
      v = Math.round(v);
      if (!Number.isSafeInteger(v)) throw Error(node.label + ' 的金额超出范围');
    }
    values.set(node.id, v);
  }
  for (const n of model.inputs) {
    const value = Object.hasOwn(edits, n.id) ? edits[n.id] : n.value;
    if (!allowedInput(n, value)) throw Error(n.label + ' 超出范围或步长无效');
    store(n, value * units.get(n.unit)[0]);
  }
  for (const f of order) {
    const args = f.args.map((k) => values.get(k)),
      [a, b, c] = args;
    let result;
    switch (f.op) {
      case 'add':
        result = a + b;
        break;
      case 'sub':
        result = a - b;
        break;
      case 'mul':
        result = a * b;
        break;
      case 'div':
        if (b === 0) throw Error(f.label + ' 的除数不能为零');
        result = a / b;
        break;
      case 'months':
      case 'convert':
        result = a;
        break;
      case 'annuity':
        if (!Number.isSafeInteger(c) || c < 0 || b / 12 <= -1) throw Error('月数或收益率无效');
        result = b === 0 ? a * c : (a * Math.expm1(c * Math.log1p(b / 12))) / (b / 12);
        break;
      case 'share':
        result = share(a, args.slice(1), f.position);
        break;
    }
    store(f, result);
  }
  return Object.fromEntries(
    model.outputs.map((f) => [f.id, values.get(f.id) / units.get(f.unit)[0]]),
  );
}
