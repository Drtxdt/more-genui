import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { parseApp, GUIDE } from '../../../src/protocol.mjs';
export const name = 'more-genui';
export const inject = ['tools', 'systemPrompt'];
export function apply(ctx: Context) {
  ctx.systemPrompt.section({
    name: 'more-genui:authoring',
    order: 110,
    text: () =>
      GUIDE +
      '\n当前宿主是 Harness。上述围栏只是格式示例。实际交付请调用 render_app，source 参数只放元数据注释和完整 HTML，不含 Markdown 围栏。不要在正文重复应用源码。',
  });
  ctx.tools.register(
    defineTool({
      name: 'render_app',
      description: 'Validate and persist a self-contained interactive HTML application.',
      parameters: {
        source: {
          type: 'string',
          required: true,
          description: 'Complete HTML document with the More GenUI metadata comment.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { meta: { type: 'json', required: true } },
        },
        render: () => [{ type: 'text', text: 'Interactive application stored.' }],
        presentationMeta: (_args, value) => value.meta,
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const app = parseApp(args.source);
        return {
          meta: {
            kind: 'more-genui-app',
            source: args.source,
            version: app.version,
            id: app.id,
            title: app.title,
            stateVersion: app.stateVersion,
          },
        };
      },
    }),
  );
}
