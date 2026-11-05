// Test-only offline model adapter. Never included in either release artifact.
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../examples/wave.html', import.meta.url), 'utf8');
class FixtureAdapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'More GenUI offline fixture' };
  }
  async listModels(provider) {
    return [
      {
        provider,
        id: 'fixture',
        name: 'More GenUI fixture (no network)',
        inputModalities: ['text'],
      },
    ];
  }
  async *stream(options) {
    if (options.signal?.aborted) return;
    const last = options.messages.at(-1);
    if (options.purpose || last?.role === 'tool') {
      if (!options.purpose) await new Promise((resolve) => setTimeout(resolve, 1800));
      const text = options.purpose
        ? 'More GenUI 验收'
        : 'Fixture complete: local tool result rendered.';
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    const block = {
      type: 'tool-call',
      id: crypto.randomUUID(),
      name: 'render_app',
      arguments: JSON.stringify({ source }),
    };
    yield { type: 'block-start', index: 0, blockType: 'tool-call' };
    yield {
      type: 'tool-call-delta',
      index: 0,
      id: block.id,
      name: block.name,
      argumentsDelta: block.arguments,
    };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}
export const name = 'more-genui-offline-fixture';
export const inject = ['llm'];
export function apply(ctx) {
  ctx.llm.registerAdapter(['more-genui-fixture'], new FixtureAdapter());
}
