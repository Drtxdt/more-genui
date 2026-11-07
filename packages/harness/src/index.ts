import { defineTool } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { parseApp } from '../../../src/protocol.mjs';
import { parseFast } from '../../../src/fast-schema.mjs';
import { FAST_GUIDE } from '../../../src/prompt-policy.mjs';
export const name = 'more-genui';
export const inject = ['tools', 'systemPrompt'];
export function apply(ctx: Context) {
  ctx.systemPrompt.section({
    name: 'more-genui:authoring',
    order: 110,
    text: () =>
      FAST_GUIDE +
      '\n当前宿主是 Harness。上述围栏只是格式示例。声明式视图调用 render_visual，spec 为结构化对象；完整 HTML 调用 render_app，source 参数只放元数据注释和完整 HTML，不含 Markdown 围栏。不要在正文重复应用源码。',
  });
  ctx.tools.register(
    defineTool({
      name: 'render_visual',
      description: 'Display a validated offline teaching view.',
      parameters: {
        spec: { type: 'json', required: true, description: 'More GenUI declarative specification' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { meta: { type: 'json', required: true } },
        },
        render: () => [{ type: 'text', text: 'Teaching view stored.' }],
        presentationMeta: (_args, value) => value.meta,
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const source = JSON.stringify(args.spec);
        const app = parseFast(source);
        return {
          meta: {
            kind: 'more-genui-app',
            source,
            id: app.id,
            title: app.title,
            version: app.version,
            stateVersion: app.stateVersion,
          },
        };
      },
    }),
  );
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
