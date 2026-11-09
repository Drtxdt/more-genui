import { z } from 'zod';
import { chartSchema } from './chart-data.mjs';
import { compileModel, modelSchema } from './numeric-model.mjs';
const text = z.string().max(8192),
  id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const entity = z.string().min(1).max(128);
const grammar = z
  .object({
    start: entity,
    productions: z
      .array(z.object({ id, lhs: entity, rhs: z.array(entity).max(64) }).strict())
      .min(1)
      .max(256),
  })
  .strict()
  .superRefine((g, ctx) => {
    const nonterminals = new Set(g.productions.map((p) => p.lhs)),
      ids = new Set(),
      rules = new Set(),
      terminals = new Set();
    if (!nonterminals.has(g.start) || nonterminals.size > 32)
      ctx.addIssue({ code: 'custom', message: '开始符号无效或非终结符超过上限' });
    for (const p of g.productions) {
      const key = JSON.stringify([p.lhs, p.rhs]);
      if (
        ids.has(p.id) ||
        rules.has(key) ||
        ['ε', '$'].includes(p.lhs) ||
        p.rhs.some((s) => ['ε', '$'].includes(s))
      )
        ctx.addIssue({ code: 'custom', message: '产生式重复或使用了保留符号' });
      ids.add(p.id);
      rules.add(key);
      for (const s of p.rhs) if (!nonterminals.has(s)) terminals.add(s);
    }
    if (terminals.size > 64) ctx.addIssue({ code: 'custom', message: '终结符超过上限' });
  });
const base = {
  group: id.optional(),
  version: z.literal(1),
  id,
  title: z.string().min(1).max(160),
  stateVersion: z.number().int().positive(),
};
const labeled = { id, label: entity, detail: text };
const entries = (schema) =>
  z
    .array(schema.strict())
    .min(1)
    .max(64)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, '条目 ID 重复');
const position = z.number().finite().min(0).max(100);
const coordinate = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    source: z
      .string()
      .url()
      .max(2048)
      .regex(/^https:\/\//),
  })
  .strict();
const definitions = {
  dataset: z.object({kind:z.literal('dataset'),dataset:z.literal('usgs-m45-day')}).strict(),
  chart: chartSchema,
  model: modelSchema,
  checklist: z.object({ kind: z.literal('checklist'), items: entries(z.object(labeled)) }).strict(),
  parts: z
    .object({
      kind: z.literal('parts'),
      parts: entries(
        z.object({
          ...labeled,
          x: position,
          y: position,
          outline: z
            .array(z.tuple([position, position]))
            .min(2)
            .max(128),
        }),
      ),
    })
    .strict(),
  route: z
    .object({
      kind: z.literal('route'),
      stops: entries(z.object({ ...labeled, coordinate: coordinate.optional() })),
    })
    .strict(),
  automaton: z
    .object({
      kind: z.literal('automaton'),
      states: z.array(entity).min(1).max(32),
      start: entity,
      accepting: z.array(entity).max(32),
      edges: z.array(z.object({ from: entity, to: entity, symbol: entity }).strict()).max(128),
    })
    .strict(),
  quiz: z
    .object({
      kind: z.literal('quiz'),
      questions: z
        .array(
          z
            .object({
              id,
              prompt: text,
              type: z.enum(['single', 'multiple', 'number', 'order']).optional(),
              options: z
                .array(z.object({ id, text, hint: text.optional() }).strict())
                .max(64)
                .optional(),
              correct: z.union([text, z.number().finite(), z.array(id).max(64)]),
              hint: text.optional(),
              explanation: text,
              tolerance: z.number().nonnegative().optional(),
              unit: text.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(64),
    })
    .strict(),
  compare: z
    .object({
      kind: z.literal('compare'),
      before: z.object({ label: text, lines: z.array(text).max(256) }).strict(),
      after: z.object({ label: text, lines: z.array(text).max(256) }).strict(),
      note: text.optional(),
    })
    .strict(),
  matrix: z
    .object({
      kind: z.literal('matrix'),
      columns: z.array(entity).min(1).max(128),
      rows: z.array(entity).min(1).max(64),
      highlight: z.tuple([entity, entity]).optional(),
      cells: z
        .array(
          z
            .object({
              row: entity,
              column: entity,
              text,
              explanation: text.optional(),
              conflict: z.boolean().optional(),
            })
            .strict(),
        )
        .max(8192),
    })
    .strict(),
  'state-diagram': z
    .object({
      kind: z.literal('state-diagram'),
      interaction: z.enum(['flow','topology']).optional(),
      nodes: z
        .array(z.object({ id: entity, label: text, explanation: text.optional() }).strict())
        .min(1)
        .max(128),
      edges: z
        .array(
          z
            .object({
              id: entity,
              from: entity,
              to: entity,
              label: text.optional(),
              explanation: text.optional(),
            })
            .strict(),
        )
        .max(256),
      highlight: z.array(entity).max(384).optional(),
    })
    .strict(),
  grammar: z
    .object({
      kind: z.literal('grammar'),
      grammar: grammar.optional(),
      input: z.array(entity).max(256).optional(),
    })
    .strict(),
};
export function validateView(value, depth = 0, hasGrammar = false) {
  if (depth > 8) throw Error('Fast UI 嵌套超过八层');
  let result;
  if (value?.kind === 'switch') {
    result = z
      .object({
        kind: z.literal('switch'),
        options: z
          .array(z.object({ id: entity, label: text, view: z.unknown() }).strict())
          .min(1)
          .max(32),
      })
      .strict()
      .parse(value);
    const ids = new Set();
    for (const o of result.options) {
      if (ids.has(o.id)) throw Error('重复状态 ID');
      ids.add(o.id);
      o.view = validateView(o.view, depth + 1, hasGrammar);
    }
  } else if (value?.kind === 'stepper') {
    result = z
      .object({
        kind: z.literal('stepper'),
        scene: z.unknown().optional(),
        steps: z
          .array(z.object({ title: text, text, time: entity.optional(), frame: z.unknown().optional() }).strict())
          .min(1)
          .max(2048),
      })
      .strict()
      .parse(value);
    if (result.scene) result.scene = validateView(result.scene, depth + 1, hasGrammar);
    for (const step of result.steps)
      if (step.frame) step.frame = validateView(step.frame, depth + 1, hasGrammar);
  } else if (value?.kind === 'lesson') {
    result = z
      .object({
        kind: z.literal('lesson'),
        grammar: grammar.optional(),
        sections: z
          .array(z.object({ title: text, view: z.unknown() }).strict())
          .min(1)
          .max(32),
      })
      .strict()
      .parse(value);
    for (const section of result.sections)
      section.view = validateView(section.view, depth + 1, hasGrammar || !!result.grammar);
  } else {
    const schema = definitions[value?.kind];
    if (!schema) throw Error('不支持的 Fast UI 类型');
    result = schema.parse(value);
  }
  if (result.kind === 'model') compileModel(result);
  if (result.kind === 'grammar' && !result.grammar && !hasGrammar)
    throw Error('文法视图缺少文法输入');
  if (result.kind === 'automaton') {
    const states = new Set(result.states);
    if (
      states.size !== result.states.length ||
      !states.has(result.start) ||
      result.accepting.some((s) => !states.has(s)) ||
      result.edges.some((e) => !states.has(e.from) || !states.has(e.to))
    )
      throw Error('自动机状态重复或边引用无效');
  }
  if (result.kind === 'matrix') {
    if (
      new Set(result.rows).size !== result.rows.length ||
      new Set(result.columns).size !== result.columns.length
    )
      throw Error('矩阵行列 ID 重复');
    const seen = new Set();
    for (const cell of result.cells) {
      const key = JSON.stringify([cell.row, cell.column]);
      if (!result.rows.includes(cell.row) || !result.columns.includes(cell.column) || seen.has(key))
        throw Error('矩阵单元引用无效或重复');
      seen.add(key);
    }
  }
  if (result.kind === 'state-diagram') {
    const nodes = new Set(result.nodes.map((n) => n.id)),
      all = new Set(nodes);
    if (nodes.size !== result.nodes.length) throw Error('节点 ID 重复');
    for (const edge of result.edges) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to) || all.has(edge.id))
        throw Error('边引用无效或 ID 重复');
      all.add(edge.id);
    }
    if (result.highlight?.some((id) => !all.has(id))) throw Error('高亮引用无效');
  }
  return result;
}
export function parseFast(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 262144)
    throw Error('Fast UI 超过 256 KiB');
  const raw = JSON.parse(source);
  if (raw && Object.hasOwn(raw, 'requestProof')) {
    z.string().uuid().parse(raw.requestProof);
    delete raw.requestProof;
  }
  const meta = z
    .object(base)
    .strict()
    .parse(Object.fromEntries(Object.keys(base).map((k) => [k, raw[k]])));
  const view = validateView(
    Object.fromEntries(Object.entries(raw).filter(([k]) => !Object.hasOwn(base, k))),
  );
  return { ...meta, html: '', spec: view };
}
