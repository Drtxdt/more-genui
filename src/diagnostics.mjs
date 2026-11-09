const stages = new Set([
  'sandbox-boot',
  'sandbox-fallback',
  'preview-candidate',
  'response-bytes',
  'recognized',
  'policy',
  'mounted',
  'interaction',
  'feedback',
  'no-ui',
  'insufficient-evidence',
  'enhanced',
  'skipped',
  'text',
  'visible-text',
  'ui-output',
  'invalid-protocol',
  'ambiguous',
  'ready',
  'execution-error',
  'mount-timeout',
  'complete',
  'cancelled',
  'unsupported',
  'http-error',
  'network-error',
  'abort',
  'timeout',
  'error',
]);
export class GenerationDiagnostics {
  records = new Map();
  enabled = false;
  configure(enabled) {
    this.enabled = enabled === true;
    if (!this.enabled) this.records.clear();
  }
  update(event) {
    if (!this.enabled || typeof event?.id !== 'string' || !stages.has(event.stage)) return;
    const record = this.records.get(event.id) ?? {
      id: event.id,
      started: performance.now(),
      events: [],
    };
    const item = { stage: event.stage, ms: Math.max(0, performance.now() - record.started) };
    if (Number.isFinite(event.bytes)) item.bytes = Math.max(0, event.bytes);
    if (typeof event.policyHash === 'string' && /^[a-f0-9]{64}$/.test(event.policyHash))
      item.policyHash = event.policyHash;
    if (
      ['interaction', 'feedback', 'sandbox-boot', 'ready'].includes(item.stage) &&
      record.events.some((e) => e.stage === item.stage)
    )
      return record;
    record.events.push(item);
    if (record.events.length > 32) record.events.shift();
    this.records.set(event.id, record);
    if (this.records.size > 100) this.records.delete(this.records.keys().next().value);
    return record;
  }
  clear() {
    this.records.clear();
  }
}
