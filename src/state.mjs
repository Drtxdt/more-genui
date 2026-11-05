import { safeState } from './protocol.mjs';
export async function digest(source) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export class StateRepository {
  constructor(storage) {
    this.storage = storage;
    this.queue = Promise.resolve();
  }
  async keys(scope, instance, app, source) {
    const family = await digest(JSON.stringify([scope, app.id, app.stateVersion]));
    const revision = await digest(JSON.stringify([scope, instance, source]));
    return { exact: `mg:state:${revision}`, latest: `mg:latest:${family}` };
  }
  async load(keys) {
    await this.queue.catch(() => {});
    const exact = await this.storage.get(keys.exact);
    const value = exact ?? (await this.storage.get(keys.latest));
    try {
      return value ? safeState(value) : {};
    } catch {
      return {};
    }
  }
  save(keys, value) {
    const clean = safeState(value);
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        await this.storage.set(keys.exact, clean);
        await this.storage.set(keys.latest, clean);
      });
    this.queue = operation;
    return operation;
  }
  reset(keys) {
    return this.save(keys, {});
  }
}
