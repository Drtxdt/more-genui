import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { schedule, scoreRuns, policyManifest, taskHash } from '../scripts/prompt-lab.mjs';
const tasks = JSON.parse(await readFile('tests/lab/tasks.json', 'utf8'));
test('fixed manifest generates exactly 48 interleaved requests and empty data cannot promote candidates', () => {
  assert.equal(tasks.length, 50);
  assert.equal(tasks.filter((t) => t.expect === 'text').length, 10);
  const rows = schedule(tasks);
  assert.equal(rows.length, 48);
  assert.equal(rows.filter((r) => r.phase === 'pilot').length, 36);
  assert.deepEqual(rows, schedule(tasks));
  const report = scoreRuns(tasks, []);
  assert.equal(report.gates.B.passed, false);
  assert.equal(report.gates.C.passed, false);
  assert.throws(() =>
    scoreRuns(tasks, [{ runId: 'x', strategy: 'B', taskId: tasks[0].id, policyHash: 'wrong' }]),
  );
  assert.equal(policyManifest().A.sha256.length, 64);
});

test('capture inspection strips THINK and parses the actual first output rather than trusting scores', async () => {
  const { makeRecord } = await import('../scripts/lab-record.mjs');
  const spec = {
    version: 1,
    id: 'lab',
    title: '对照',
    stateVersion: 1,
    kind: 'compare',
    before: { label: '前', lines: ['A'] },
    after: { label: '后', lines: ['B'] },
  };
  const row = schedule(tasks)[0],
    manifest = policyManifest(),
    capture = {
      events: [
        {
          v: {
            response: {
              fragments: [
                { type: 'THINK', content: 'DO_NOT_STORE' },
                { type: 'RESPONSE', content: '```genui-json\n' + JSON.stringify(spec) + '\n```\n' },
              ],
            },
          },
        },
      ],
      observation: {
        status: 'complete',
        runtimeValid: true,
        observedPolicyHash: manifest[row.strategy].sha256,
        reviewed: true,
        semantic: true,
        appropriate: true,
      },
    };
  const { record, text } = makeRecord(row, capture);
  assert.equal(record.valid, true);
  assert.equal(record.injectionVerified, true);
  assert.ok(!text.includes('DO_NOT_STORE'));
  const bad = makeRecord(row, {
    text: '```genui-json\n{}\n```\n',
    observation: { status: 'complete' },
  });
  assert.equal(bad.record.valid, false);
  assert.equal(bad.record.injectionVerified, false);
});

test('promotion requires complete paired evidence and rejects a negative-control UI', () => {
  const manifest = policyManifest(),
    required = tasks.filter((t) => t.expect === 'model-ui'),
    baseline = new Set(required.slice(0, 16).map((t) => t.id));
  const runs = schedule(tasks).map((row) => {
    const task = tasks.find((t) => t.id === row.taskId),
      ui = task.expect === 'model-ui' && (row.strategy !== 'A' || baseline.has(task.id));
    return {
      runId: row.runId,
      taskHash: taskHash(tasks),
      buildCommit: '0'.repeat(40),
      taskId: row.taskId,
      strategy: row.strategy,
      mode: row.mode,
      policyHash: manifest[row.strategy].sha256,
      injectionVerified: true,
      ui,
      valid: ui,
      reviewed: true,
      appropriate: ui,
      semantic: true,
      usefulMs: 1000,
      interactiveMs: ui ? 2000 : undefined,
    };
  });
  assert.equal(scoreRuns(tasks, runs).gates.B.passed, true);
  const partial = runs.filter((r) => r.mode === 'normal');
  assert.equal(scoreRuns(tasks, partial).gates.B.passed, false);
  const negative = runs.find(
    (r) =>
      r.strategy === 'B' &&
      r.mode === 'normal' &&
      tasks.find((t) => t.id === r.taskId).expect === 'text',
  );
  negative.ui = true;
  negative.valid = true;
  negative.interactiveMs = 2000;
  assert.equal(scoreRuns(tasks, runs).gates.B.passed, false);
});
