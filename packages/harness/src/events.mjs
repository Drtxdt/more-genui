import { parseRenderable } from '../../../src/renderable.mjs';
// Accept replayable presentation metadata only, never parse model prose as a tool result.
export function appFromEvent(event) {
  if (
    !['tool/result', 'tool/ptc-dispatch'].includes(event?.type) ||
    event.data?.isError ||
    event.data?.message?.isError
  )
    return null;
  const data = event.data,
    meta = data?.meta;
  if (meta?.kind !== 'more-genui-app' || typeof meta.source !== 'string') return null;
  try {
    const app = parseRenderable(meta.source);
    const id = event.type === 'tool/ptc-dispatch' ? data.subCallId : data.message?.toolCallId;
    if (typeof id !== 'string') return null;
    return { id, source: meta.source, title: app.title, answerId: event.turnId ?? data.message?.id };
  } catch {
    return null;
  }
}
export const appDefinition = {
  kind: 'more-genui-app',
  target: 'chat',
  match(event) {
    const app = appFromEvent(event);
    return app ? { id: app.id, role: 'start' } : null;
  },
  start(_context, match) {
    return appFromEvent(match.event);
  },
  update(context, match) {
    return appFromEvent(match.event) || context.state;
  },
  buildViewNode(context) {
    if (!context.state || !context.start) return null;
    return {
      key: context.key,
      id: context.id,
      kind: 'more-genui-app',
      target: 'chat',
      data: context.state,
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      groupTree: 'turn',
    };
  },
};
