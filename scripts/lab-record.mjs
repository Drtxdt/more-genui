import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { policyManifest, schedule, taskHash } from './prompt-lab.mjs';
import { ReplyAccumulator, SSEDecoder } from '../src/stream.mjs';
import { FenceScanner } from '../src/fences.mjs';
import { parseRenderable } from '../src/renderable.mjs';
export function inspectCapture(capture) {
  let text = '';
  if (Array.isArray(capture.events) || typeof capture.sse === 'string') {
    const accumulator = new ReplyAccumulator(() => {});
    if (capture.events) for (const event of capture.events) accumulator.accept(event);
    else {
      const decoder = new SSEDecoder((event) => accumulator.accept(event));
      decoder.push(capture.sse);
    }
    text = accumulator.text;
  } else if (typeof capture.text === 'string') text = capture.text;
  else throw Error('需要 RESPONSE 正文、事件数组或 SSE');
  const sources = [],
    scanner = new FenceScanner((source, language) => sources.push({source, language}));
  scanner.update(text);
  if (capture.observation?.status === 'complete') scanner.finish();
  const ui = scanner.declared;
  let valid =
    ui && sources.length > 0 && !(scanner.fence && scanner.explicit) && capture.observation?.status === 'complete';
  for (const {source,language} of sources)
    try {
      parseRenderable(source, language === 'genui-json' ? 'fast' : 'html');
    } catch {
      valid = false;
    }
  return {
    text,
    ui,
    valid,
    outputBytes: new TextEncoder().encode(text).length,
    characters: text.length,
  };
}
export function makeRecord(row, capture, manifest = policyManifest()) {
  const parsed = inspectCapture(capture),
    o = capture.observation ?? {};
  const record = {
    runId: row.runId,
    buildCommit: row.buildCommit,
    taskHash: row.taskHash,
    taskId: row.taskId,
    strategy: row.strategy,
    mode: row.mode,
    policyHash: manifest[row.strategy].sha256,
    injectionVerified: o.observedPolicyHash === manifest[row.strategy].sha256,
    ui: parsed.ui,
    protocolValid: parsed.valid,
    valid: parsed.valid && o.runtimeValid === true,
    outputBytes: parsed.outputBytes,
    characters: parsed.characters,
    status: ['complete', 'cancelled', 'timeout', 'network-error'].includes(o.status)
      ? o.status
      : 'unsupported',
    reviewed: o.reviewed === true,
    appropriate: o.appropriate === true,
    semantic: o.semantic === true,
    taskComplete: o.taskComplete === true,
  };
  for (const key of ['usefulMs', 'interactiveMs', 'feedbackMs'])
    if (Number.isFinite(o[key]) && o[key] >= 0) record[key] = o[key];
  return { record, text: parsed.text };
}
if (process.argv[1]?.endsWith('lab-record.mjs')) {
  const [runId, file] = process.argv.slice(2),
    tasks = JSON.parse(await readFile('tests/lab/tasks.json', 'utf8')),
    row = schedule(tasks).find((row) => row.runId === runId);
  if (!row || !file) throw Error('用法：node scripts/lab-record.mjs <冻结 runId> <capture.json>');
  const capture = JSON.parse(await readFile(file, 'utf8'));
  const frozen = JSON.parse(await readFile('.cache/prompt-lab/schedule.json', 'utf8'));
  if (
    frozen.taskHash !== taskHash(tasks) ||
    frozen.policies[row.strategy].sha256 !== policyManifest()[row.strategy].sha256
  )
    throw Error('请核对冻结的题集与策略版本');
  const { record, text } = makeRecord(
    { ...row, buildCommit: frozen.buildCommit, taskHash: frozen.taskHash },
    capture,
  );
  const directory = '.cache/prompt-lab';
  await mkdir(directory + '/raw', { recursive: true });
  let records = [];
  try {
    records = JSON.parse(await readFile(directory + '/records.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (records.some((r) => r.runId === runId)) throw Error('首轮记录已存在，不允许覆盖');
  if (records.length >= 48) throw Error('请求预算已用完');
  await writeFile(directory + '/raw/' + runId + '.txt', text, { flag: 'wx' });
  records.push(record);
  await writeFile(directory + '/records.json', JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
