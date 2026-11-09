export function analyzeGrammar(grammar) {
  const { start, productions } = grammar;
  if (!Array.isArray(productions) || !productions.length || productions.length > 256)
    throw Error('文法需要 1–256 条产生式');
  if (productions.some((p) => !p || typeof p.lhs !== 'string' || !Array.isArray(p.rhs)))
    throw Error('产生式无效');
  const nonterminals = [...new Set(productions.map((p) => p.lhs))];
  if (!nonterminals.includes(start) || nonterminals.length > 32)
    throw Error('开始符号无效或非终结符超过 32 个');
  const ids = new Set(),
    keys = new Set();
  for (const p of productions) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      typeof p.lhs !== 'string' ||
      !p.lhs ||
      !Array.isArray(p.rhs) ||
      p.rhs.length > 64 ||
      p.rhs.some((s) => typeof s !== 'string' || !s || ['ε', '$'].includes(s)) ||
      ['ε', '$'].includes(p.lhs)
    )
      throw Error('产生式符号、ID 或 ε 表示无效');
    const key = JSON.stringify([p.lhs, p.rhs]);
    if (keys.has(key)) throw Error('存在重复产生式');
    keys.add(key);
    ids.add(p.id);
  }
  const terminals = [
    ...new Set(productions.flatMap((p) => p.rhs).filter((s) => !nonterminals.includes(s))),
  ];
  if (terminals.length > 64) throw Error('终结符超过 64 个');
  const first = Object.fromEntries(nonterminals.map((s) => [s, new Set()])),
    follow = Object.fromEntries(nonterminals.map((s) => [s, new Set()]));
  const nullable = new Set();
  // Keep the first successful derivation. Its premises were already known;
  // circular grammars therefore cannot make a circular explanation.
  const evidence = Object.create(null);
  const fact = (kind, n, t) => JSON.stringify([kind, n, t]);
  function premises(rhs, token) {
    const via = [];
    for (const s of rhs) {
      if (!Object.hasOwn(first, s)) break;
      if (token !== 'ε' && first[s].has(token)) return [...via, fact('FIRST', s, token)];
      if (!nullable.has(s)) break;
      via.push(fact('FIRST', s, 'ε'));
    }
    return via;
  }
  const sequence = (rhs) => {
    const out = new Set();
    let empty = true;
    for (const s of rhs) {
      if (Object.hasOwn(first, s)) {
        for (const t of first[s]) out.add(t);
        if (!nullable.has(s)) {
          empty = false;
          break;
        }
      } else {
        out.add(s);
        empty = false;
        break;
      }
    }
    return { values: out, nullable: empty };
  };
  let changed = true;
  const add = (set, values) => {
    for (const v of values)
      if (!set.has(v)) {
        set.add(v);
        changed = true;
      }
  };
  while (changed) {
    changed = false;
    for (const p of productions) {
      const f = sequence(p.rhs);
      for (const t of f.values) if (!first[p.lhs].has(t))
        evidence[fact('FIRST', p.lhs, t)] = {rule:p.id, via:premises(p.rhs, t)};
      add(first[p.lhs], f.values);
      if (f.nullable && !nullable.has(p.lhs)) {
        evidence[fact('FIRST', p.lhs, 'ε')] = {rule:p.id, via:premises(p.rhs, 'ε')};
        nullable.add(p.lhs);
        changed = true;
      }
    }
  }
  follow[start].add('$');
  evidence[fact('FOLLOW', start, '$')] = {rule:null, via:[]};
  changed = true;
  while (changed) {
    changed = false;
    for (const p of productions)
      for (let i = 0; i < p.rhs.length; i++) {
        const s = p.rhs[i];
        if (!Object.hasOwn(follow, s)) continue;
        const suffix = sequence(p.rhs.slice(i + 1));
        for (const t of suffix.values) if (!follow[s].has(t))
          evidence[fact('FOLLOW', s, t)] = {rule:p.id, via:premises(p.rhs.slice(i+1), t)};
        add(follow[s], suffix.values);
        if (suffix.nullable) {
          for (const t of follow[p.lhs]) if (!follow[s].has(t))
            evidence[fact('FOLLOW', s, t)] = {rule:p.id, via:[...premises(p.rhs.slice(i+1),'ε'),fact('FOLLOW',p.lhs,t)]};
          add(follow[s], follow[p.lhs]);
        }
      }
  }
  const table = Object.create(null),
    select = Object.create(null);
  for (const n of nonterminals) table[n] = Object.create(null);
  for (const p of productions) {
    const f = sequence(p.rhs);
    select[p.id] = [...new Set([...f.values, ...(f.nullable ? follow[p.lhs] : [])])];
    for (const t of select[p.id]) {
      const entries = (table[p.lhs][t] ??= []);
      entries.push({
        production: p.id,
        reasons: [
          ...(f.values.has(t) ? ['FIRST'] : []),
          ...(f.nullable && follow[p.lhs].has(t) ? ['FOLLOW'] : []),
        ],
      });
    }
  }
  const conflicts = [];
  for (const n of nonterminals)
    for (const [terminal, entries] of Object.entries(table[n]))
      if (entries.length > 1) conflicts.push({ nonterminal: n, terminal, entries });
  const edges = Object.fromEntries(nonterminals.map((n) => [n, new Set()]));
  for (const p of productions)
    for (const s of p.rhs) {
      if (!Object.hasOwn(first, s)) break;
      edges[p.lhs].add(s);
      if (!nullable.has(s)) break;
    }
  const leftRecursive = nonterminals.filter((n) => {
    const pending = [...edges[n]],
      seen = new Set();
    while (pending.length) {
      const s = pending.pop();
      if (s === n) return true;
      if (!seen.has(s)) {
        seen.add(s);
        pending.push(...edges[s]);
      }
    }
    return false;
  });
  return {
    start,
    productions,
    nonterminals,
    terminals,
    nullable: [...nullable],
    first: Object.fromEntries(
      nonterminals.map((n) => [n, [...first[n], ...(nullable.has(n) ? ['ε'] : [])]]),
    ),
    follow: Object.fromEntries(nonterminals.map((n) => [n, [...follow[n]]])),
    select,
    evidence,
    table,
    conflicts,
    leftRecursive,
  };
}
export function traceGrammar(grammar, input) {
  const analysis = analyzeGrammar(grammar);
  if (analysis.conflicts.length || analysis.leftRecursive.length)
    return { status: 'not-ll1', steps: [] };
  if (
    !Array.isArray(input) ||
    input.length > 256 ||
    input.some((t) => !analysis.terminals.includes(t))
  )
    return { status: 'invalid-input', steps: [] };
  const stack = ['$', grammar.start],
    tokens = [...input, '$'],
    steps = [];
  let offset = 0;
  for (let i = 0; i < 2048; i++) {
    const top = stack.at(-1),
      lookahead = tokens[offset];
    const snapshot = { stack: [...stack], input: tokens.slice(offset) };
    if (top === '$' && lookahead === '$') {
      steps.push({ ...snapshot, action: '接受' });
      return { status: 'accepted', steps };
    }
    if (!analysis.nonterminals.includes(top)) {
      if (top !== lookahead) {
        steps.push({ ...snapshot, action: '终结符不匹配' });
        return { status: 'rejected', steps };
      }
      stack.pop();
      offset++;
      steps.push({ ...snapshot, action: '匹配 ' + top });
      continue;
    }
    const entry = analysis.table[top]?.[lookahead]?.[0];
    if (!entry) {
      steps.push({ ...snapshot, action: '分析表无产生式', cell: [top, lookahead] });
      return { status: 'rejected', steps };
    }
    const p = grammar.productions.find((p) => p.id === entry.production);
    stack.pop();
    stack.push(...[...p.rhs].reverse());
    steps.push({
      ...snapshot,
      action: p.lhs + ' → ' + (p.rhs.join(' ') || 'ε'),
      production: p.id,
      cell: [top, lookahead],
    });
  }
  return { status: 'limit', steps };
}
export function eliminateDirectLeftRecursion(grammar) {
  analyzeGrammar(grammar);
  const used = new Set(grammar.productions.flatMap((p) => [p.lhs, ...p.rhs]));
  let output = [];
  for (const lhs of [...new Set(grammar.productions.map((p) => p.lhs))]) {
    const rules = grammar.productions.filter((p) => p.lhs === lhs),
      recursive = rules.filter((p) => p.rhs[0] === lhs),
      base = rules.filter((p) => p.rhs[0] !== lhs);
    if (!recursive.length) {
      output.push(...rules);
      continue;
    }
    if (!base.length || recursive.some((p) => p.rhs.length === 1))
      throw Error('没有非递归候选式或存在空递归，不能直接变换');
    let fresh = lhs + "'";
    while (used.has(fresh)) fresh += "'";
    used.add(fresh);
    output.push(
      ...base.map((p) => ({ ...p, rhs: [...p.rhs, fresh] })),
      ...recursive.map((p) => ({
        id: p.id + '-tail',
        lhs: fresh,
        rhs: [...p.rhs.slice(1), fresh],
      })),
      { id: 'epsilon-' + output.length, lhs: fresh, rhs: [] },
    );
  }
  output = output.map((p, i) => ({ ...p, id: 'transformed-' + i }));
  const result = { start: grammar.start, productions: output };
  analyzeGrammar(result);
  return result;
}
