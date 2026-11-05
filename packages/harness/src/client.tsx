import React, { useEffect, useRef } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { mountSurface } from '../../../src/surface';
import { StateRepository } from '../../../src/state.mjs';
import { appDefinition } from './events.mjs';
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'more-genui-app': { id: string; source: string; title: string };
  }
}
const repository = new StateRepository({
  async get(key: string) {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  },
  async set(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
  },
});
function App(props: ChatNodeViewProps<'more-genui-app'>) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const draft = props.useInput((s: InputState) => s.draft);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    if (!host.current) return;
    const surface = mountSurface(host.current, {
      source: props.node.data.source,
      scope: String(props.sessionId),
      instance: props.node.id,
      repository,
      draft(text) {
        const actions = latest.current.inputActions;
        if (!actions.insertText(text, actions.captureInsertion()))
          throw Error('草稿已更改，请重试');
      },
      repair(text) {
        if (latestDraft.current.trim()) throw Error('请先发送或保存现有草稿，再点击修复');
        const actions = latest.current.inputActions;
        actions.setDraft(text);
        actions.submit();
      },
    });
    return () => surface.dispose();
  }, [props.node.data.source, props.node.id, props.sessionId]);
  return <div ref={host} />;
}
export const name = 'more-genui-harness/client';
export const inject = ['uiConversation', 'slots'];
export function apply(ctx: Context) {
  ctx.uiConversation.events.register(appDefinition as ConversationNodeDefinition);
  ctx.slots.register({ name: 'conversation.chat.node', key: 'more-genui-app' }, App);
}
