export const normalizePrompt = (value) => String(value).replace(/\r\n?/g, '\n').trim();
export class GenerationIntent {
  /** @type {{id:string,revision:number,route:string,prompt:string,kind:string}|null} */
  current = null;
  /** @type {Array<{id:string,revision:number,route:string,prompt:string,kind:string,at:number}>} */
  pending = [];
  get submitted() {
    return this.pending.at(-1) ?? null;
  }
  clear() {
    this.current = null;
    this.pending = [];
  }
  capture(route, prompt) {
    const intent = this.current;
    if (!intent || intent.route !== route || intent.prompt !== normalizePrompt(prompt)) return null;
    const snapshot = { ...intent, at: Date.now() };
    this.pending = this.pending.filter(
      (p) => Date.now() - p.at < 10000 && !(p.id === intent.id && p.revision === intent.revision),
    );
    this.pending.push(snapshot);
    if (this.pending.length > 8) this.pending.shift();
    return snapshot;
  }
  arm(value) {
    if (value === null) {
      this.current = null;
      return true;
    }
    if (
      !value ||
      typeof value.id !== 'string' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      typeof value.route !== 'string' ||
      typeof value.prompt !== 'string' ||
      !['', 'diagram', 'quiz', 'steps'].includes(value.kind)
    )
      return false;
    this.current = { ...value, prompt: normalizePrompt(value.prompt) };
    return true;
  }
  consume(route, prompt) {
    this.pending = this.pending.filter((p) => Date.now() - p.at < 10000);
    const normalized = normalizePrompt(prompt),
      match = (intent) =>
        intent &&
        intent.prompt === normalized &&
        (intent.route === route ||
          (intent.route === '/' && /^\/a\/chat\//.test(route) && this.pending.includes(intent)));
    const intent = this.pending.find(match) ?? (match(this.current) ? this.current : null);
    if (!intent) return null;
    this.pending = this.pending.filter((p) => p !== intent);
    if (this.current?.id === intent.id) this.current = null;
    return intent;
  }
}
