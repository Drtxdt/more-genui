import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import * as plugin from '../packages/harness/lib/index.js';
test('published Harness services execute render_app with durable metadata', async () => {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {}).await();
  await ctx.plugin(ToolRuntime, { mode: 'native' }).await();
  await ctx.plugin(plugin).await();
  try {
    const source = await readFile('examples/wave.html', 'utf8');
    const result = await ctx.tools.execute({
      callId: 'test-call',
      name: 'render_app',
      arguments: { source },
      signal: new AbortController().signal,
    });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(result.meta.source, source);
    assert.equal(result.meta.kind, 'more-genui-app');
    const spec = {version:1,stateVersion:1,id:'compare',title:'前后',kind:'compare',before:{label:'前',lines:['A']},after:{label:'后',lines:['B']}};
    const visual = await ctx.tools.execute({callId:'visual-call',name:'render_visual',arguments:{spec},signal:new AbortController().signal});
    assert.equal(visual.isError,false,JSON.stringify(visual));
    assert.deepEqual(JSON.parse(visual.meta.source),spec);
    const bad = await ctx.tools.execute({
      callId: 'bad-call',
      name: 'render_app',
      arguments: { source: 'incomplete' },
      signal: new AbortController().signal,
    });
    assert.equal(bad.isError, true);
  } finally {
    await ctx.fiber.dispose();
  }
});
