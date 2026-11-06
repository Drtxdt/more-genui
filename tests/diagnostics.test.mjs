import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GenerationDiagnostics } from '../src/diagnostics.mjs';
test('diagnostics are opt-in, bounded and strip all prompt and reasoning content', () => {
  const d = new GenerationDiagnostics();
  d.update({ id: 'a', stage: 'text', prompt: 'secret' });
  assert.equal(d.records.size, 0);
  d.configure(true);
  for (let i = 0; i < 120; i++)
    d.update({ id: String(i), stage: 'text', bytes: 20, prompt: 'secret', reasoning: 'hidden' });
  assert.equal(d.records.size, 100);
  assert.ok(!JSON.stringify([...d.records.values()]).includes('secret'));
  assert.ok(!JSON.stringify([...d.records.values()]).includes('hidden'));
  d.configure(false);
  assert.equal(d.records.size, 0);
});
