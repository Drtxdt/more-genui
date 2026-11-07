import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promptPolicy } from '../src/prompt-policy.mjs';
import { execFileSync } from 'node:child_process';
export const taskHash = (tasks) => createHash('sha256').update(JSON.stringify(tasks)).digest('hex');
export const policyManifest = () =>
  Object.fromEntries(
    ['A', 'B', 'C'].map((id) => [
      id,
      {
        version: '2026-11-07.1',
        sha256: createHash('sha256').update(promptPolicy(id)).digest('hex'),
        guide: promptPolicy(id),
      },
    ]),
  );
export function schedule(tasks) {
  let seed = 20261106;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pilot = tasks.filter((t) => t.pilot),
    rest = tasks.filter((t) => !t.pilot),
    rows = [];
  for (const [phase, list] of [['pilot', pilot]])
    for (const task of list) {
      const strategies = ['A', 'B', 'C'];
      for (let i = 2; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [strategies[i], strategies[j]] = [strategies[j], strategies[i]];
      }
      for (const strategy of strategies)
        rows.push({
          runId: `${task.id}-${strategy}-normal`,
          phase,
          taskId: task.id,
          strategy,
          mode: 'normal',
          prompt: task.prompt,
        });
    }
  for (const task of tasks.filter((t) => t.thinking))
    for (const strategy of ['A', 'B', 'C'])
      rows.push({
        runId: `${task.id}-${strategy}-thinking`,
        phase: 'thinking',
        taskId: task.id,
        strategy,
        mode: 'thinking',
        prompt: task.prompt,
      });
  return rows;
}
const quantile = (values, q) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(q * values.length) - 1] : null;
export function scoreRuns(tasks, runs, manifest = policyManifest()) {
  const expected = new Map(schedule(tasks).map((r) => [r.runId, r]));
  const seen = new Set();
  const bank = taskHash(tasks),
    revision = runs[0]?.buildCommit;
  for (const r of runs) {
    if (
      r.taskHash !== bank ||
      !/^[0-9a-f]{40}$/.test(r.buildCommit ?? '') ||
      r.buildCommit !== revision
    )
      throw Error('题库或构建提交与本轮不符');
    if (seen.has(r.runId)) throw Error('重复实验 ID');
    seen.add(r.runId);
    const scheduled = expected.get(r.runId);
    if (
      !scheduled ||
      scheduled.taskId !== r.taskId ||
      scheduled.strategy !== r.strategy ||
      scheduled.mode !== r.mode
    )
      throw Error('记录与冻结实验调度不匹配');
    for (const key of ['usefulMs', 'interactiveMs'])
      if (r[key] != null && (!Number.isFinite(r[key]) || r[key] < 0)) throw Error('无效耗时');
    if (!manifest[r.strategy] || r.policyHash !== manifest[r.strategy].sha256)
      throw Error('策略哈希不匹配');
    if (!tasks.some((t) => t.id === r.taskId)) throw Error('未知任务');
  }
  if (runs.length > 48) throw Error('超过 48 次请求预算');
  const pilotSize = tasks.filter((t) => t.pilot).length;
  const summaries = {};
  for (const strategy of ['A', 'B', 'C']) {
    const records = runs.filter((r) => r.strategy === strategy && r.mode === 'normal'),
      required = tasks.filter((t) => t.pilot && t.expect === 'model-ui'),
      positive = records.filter((r) => r.ui === true),
      negative = records.filter(
        (r) => tasks.find((t) => t.id === r.taskId).expect === 'text' && r.ui === true,
      );
    summaries[strategy] = {
      sent: records.length,
      completedTasks: records.filter((r) => r.taskComplete === true).length,
      recall:
        records.filter(
          (r) => required.some((t) => t.id === r.taskId) && r.ui === true && r.valid === true,
        ).length / required.length,
      precision: positive.length
        ? positive.filter((r) => r.appropriate === true).length / positive.length
        : 0,
      validity: positive.length
        ? positive.filter((r) => r.valid === true).length / positive.length
        : 0,
      semantic: records.length
        ? records.filter((r) => r.semantic === true).length / records.length
        : 0,
      negativeUI: negative.length,
      complete:
        records.length === pilotSize &&
        records.every(
          (r) =>
            r.reviewed === true &&
            r.injectionVerified === true &&
            Number.isFinite(r.usefulMs) &&
            (!r.ui || !r.valid || Number.isFinite(r.interactiveMs)),
        ),
      usefulP50: quantile(records.map((r) => r.usefulMs).filter(Number.isFinite), 0.5),
      usefulP90: quantile(records.map((r) => r.usefulMs).filter(Number.isFinite), 0.9),
    };
  }
  const thinkingComplete = schedule(tasks)
    .filter((r) => r.mode === 'thinking')
    .every((row) =>
      runs.some(
        (r) =>
          r.runId === row.runId &&
          r.reviewed === true &&
          r.injectionVerified === true &&
          r.semantic === true,
      ),
    );
  const gates = {};
  for (const strategy of ['B', 'C']) {
    const a = summaries.A,
      b = summaries[strategy],
      paired = tasks
        .map((t) => {
          const base = runs.find(
              (r) => r.taskId === t.id && r.strategy === 'A' && r.mode === 'normal',
            ),
            candidate = runs.find(
              (r) => r.taskId === t.id && r.strategy === strategy && r.mode === 'normal',
            );
          return base?.valid &&
            candidate?.valid &&
            Number.isFinite(base.interactiveMs) &&
            Number.isFinite(candidate.interactiveMs)
            ? [base, candidate]
            : null;
        })
        .filter(Boolean);
    const gains = paired.map(([base, candidate]) => candidate.interactiveMs - base.interactiveMs);
    gates[strategy] = {
      complete: a.complete && b.complete && thinkingComplete,
      semantic: b.semantic === 1 && b.semantic >= a.semantic,
      validity: b.validity >= a.validity,
      tasks: b.completedTasks >= a.completedTasks,
      negative: b.negativeUI === 0,
      benefit: b.recall > a.recall || (gains.length > 0 && quantile(gains, 0.5) < 0),
    };
    gates[strategy].passed = Object.values(gates[strategy]).every((v) => v === true);
  }
  return {
    scope: 'synthetic tasks on the official website; no inference about hidden reasoning tokens',
    summaries,
    gates,
    requests: runs.length,
  };
}
if (process.argv[1]?.endsWith('prompt-lab.mjs')) {
  const tasks = JSON.parse(await readFile('tests/lab/tasks.json', 'utf8')),
    manifest = policyManifest();
  if (process.argv[2] === 'score') {
    const records = JSON.parse(await readFile(process.argv[3], 'utf8'));
    console.log(JSON.stringify(scoreRuns(tasks, records), null, 2));
  } else {
    await mkdir('.cache/prompt-lab', { recursive: true });
    await writeFile(
      '.cache/prompt-lab/schedule.json',
      JSON.stringify(
        {
          seed: 20261106,
          taskHash: taskHash(tasks),
          buildCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          policies: manifest,
          runs: schedule(tasks),
        },
        null,
        2,
      ),
    );
    console.log(
      'Prepared ' +
        schedule(tasks).length +
        ' requests; no requests sent. Raw records stay under .cache/prompt-lab.',
    );
  }
}
