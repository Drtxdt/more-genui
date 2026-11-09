import { safeState } from './protocol.mjs';
// Explicit, single-use handoff. An ID match alone never authorizes inheritance.
export class RepairContexts {
  pending = new Map();
  create(scope, app, state) {
    for (const [key, value] of this.pending)
      if (value.expires < Date.now()) this.pending.delete(key);
    const token = crypto.randomUUID();
    this.pending.set(token, {
      scope,
      id: app.id,
      version: app.stateVersion,
      state: safeState(state),
      expires: Date.now() + 15 * 60_000,
    });
    return token;
  }
  consume(scope, app, source) {
    const token = /<!-- more-genui-repair: ([a-f0-9-]+) -->/.exec(source)?.[1];
    const context = this.pending.get(token);
    if (
      !context ||
      context.scope !== scope ||
      context.id !== app.id ||
      context.version !== app.stateVersion ||
      context.expires < Date.now()
    )
      return undefined;
    this.pending.delete(token);
    return safeState(context.state);
  }
  clear() {
    this.pending.clear();
  }
}
export function memoryRepositoryStorage() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}
