export function determinize(machine) {
  const { states, start, accepting, edges } = machine;
  const ids = new Set(states);
  if (ids.size !== states.length || !ids.has(start) || accepting.some((s) => !ids.has(s)))
    throw Error('状态重复、初态或终态不存在');
  const alphabet = new Set(),
    transitions = new Map(states.map((s) => [s, new Map()]));
  for (const { from, to, symbol } of edges) {
    if (!ids.has(from) || !ids.has(to)) throw Error('边引用未知状态');
    if (symbol !== 'ε') alphabet.add(symbol);
    const row = transitions.get(from);
    if (!row.has(symbol)) row.set(symbol, new Set());
    row.get(symbol).add(to);
  }
  const closure = (seeds) => {
    const seen = new Set(seeds),
      queue = [...seen];
    for (const state of queue)
      for (const next of transitions.get(state).get('ε') ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    return [...seen].sort();
  };
  const subsets = [],
    byKey = new Map(),
    moves = [];
  function intern(members) {
    const key = JSON.stringify(members);
    if (byKey.has(key)) return byKey.get(key);
    if (subsets.length >= 256) throw Error('子集数超过 256');
    const id = 'D' + subsets.length;
    subsets.push({ id, members, accepting: members.some((s) => accepting.includes(s)) });
    byKey.set(key, id);
    return id;
  }
  intern(closure([start]));
  for (const state of subsets)
    for (const symbol of alphabet) {
      const targets = new Set();
      for (const s of state.members)
        for (const t of transitions.get(s).get(symbol) ?? []) targets.add(t);
      moves.push({ from: state.id, symbol, to: intern(closure(targets)) });
    }
  return { subsets, moves };
}
