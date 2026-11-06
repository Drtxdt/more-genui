export const normalizePrompt = (value) => String(value).replace(/\r\n?/g, '\n').trim();
export class GenerationIntent {
  /** @type {{id:string,revision:number,route:string,prompt:string,kind:string}|null} */
  current = null;
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
    const intent = this.current;
    if (!intent || intent.route !== route || intent.prompt !== normalizePrompt(prompt)) return null;
    this.current = null;
    return intent;
  }
}
