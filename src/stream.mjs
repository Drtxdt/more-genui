import { FenceScanner } from './fences.mjs';
import { MAX_SOURCE, bytes } from './protocol.mjs';
export class SSEDecoder {
  buffer = '';
  constructor(onEvent) {
    this.onEvent = onEvent;
  }
  push(text) {
    this.buffer += text;
    if (bytes(this.buffer) > MAX_SOURCE * 4) throw Error('SSE event exceeds limit');
    let match;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data && data !== '[DONE]') {
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        this.onEvent(event);
      }
    }
  }
}
// The official client inherits both p and o. Each BATCH has a fresh child cursor;
// children are relative to the parent's path, including nested batches.
export class DeltaCursor {
  path = '';
  op = 'SET';
  parse(event, depth = 0) {
    if (!event || typeof event !== 'object' || !Object.hasOwn(event, 'v')) return [];
    if (depth > 12) throw Error('Delta nesting exceeds limit');
    this.path = event.p ?? this.path;
    this.op = event.o ?? this.op;
    if (typeof this.path !== 'string' || !['SET', 'APPEND', 'BATCH'].includes(this.op))
      throw Error('Unsupported delta');
    if (this.op !== 'BATCH') return [{ path: this.path, op: this.op, value: event.v }];
    if (!Array.isArray(event.v)) throw Error('BATCH must contain an array');
    const cursor = new DeltaCursor(),
      result = [];
    for (const child of event.v) {
      for (const patch of cursor.parse(child, depth + 1)) {
        result.push({ ...patch, path: [this.path, patch.path].filter(Boolean).join('/') });
        if (result.length > 10000) throw Error('Too many delta operations');
      }
    }
    return result;
  }
}
export class ReplyAccumulator {
  text = '';
  fragments = [];
  emitted = new Set();
  cursor = new DeltaCursor();
  constructor(onSource) {
    this.onSource = onSource;
    this.scanner = new FenceScanner((source) => {
      if (!this.emitted.has(source)) {
        this.emitted.add(source);
        this.onSource(source);
      }
    });
  }
  accept(event) {
    const delta = event?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string') {
      this.text += delta;
      this.emit(true);
      return;
    }
    for (const patch of this.cursor.parse(event)) {
      this.apply(patch);
      const path = patch.path.replace(/^\/+|\/+$/g, '');
      const match = /^response\/fragments\/(-?\d+)\/content$/.exec(path);
      const index = match
        ? Number(match[1]) < 0
          ? this.fragments.length + Number(match[1])
          : Number(match[1])
        : -1;
      const last = this.fragments.findLastIndex(
        (x) => x && ['RESPONSE', 'TEMPLATE_RESPONSE'].includes(x.type),
      );
      this.emit(
        patch.op === 'APPEND' &&
          (/^(response\/)?content$/.test(path) || (index >= 0 && index === last)),
      );
    }
  }
  apply({ path, op, value }) {
    path = path.replace(/^\/+|\/+$/g, '');
    let fragmentsChanged = false;
    if (
      (path === '' && value?.response) ||
      (path === 'response' && value && typeof value === 'object')
    ) {
      const response = path === '' ? value.response : value;
      if (Array.isArray(response.fragments)) {
        this.fragments = response.fragments.map((x) => ({ ...x }));
        fragmentsChanged = true;
      } else if (typeof response.content === 'string') this.text = response.content;
    } else if (/^(response\/)?content$/.test(path) && typeof value === 'string')
      this.text = op === 'APPEND' ? this.text + value : value;
    else if (path === 'response/fragments' && Array.isArray(value)) {
      this.fragments =
        op === 'APPEND' ? [...this.fragments, ...value] : value.map((x) => ({ ...x }));
      fragmentsChanged = true;
    } else {
      const match = /^response\/fragments\/(-?\d+)(?:\/(content|type))?$/.exec(path);
      if (match) {
        let index = Number(match[1]);
        if (index < 0) index = this.fragments.length + index;
        if (index < 0 || index > 10000) return;
        if (!match[2] && value && typeof value === 'object' && !Array.isArray(value)) {
          this.fragments[index] = { ...value };
          fragmentsChanged = true;
        } else if (this.fragments[index] && typeof value === 'string') {
          const key = match[2];
          if (key === 'content' || key === 'type') {
            this.fragments[index][key] =
              op === 'APPEND' ? (this.fragments[index][key] || '') + value : value;
            fragmentsChanged = true;
          }
        }
      }
    }
    if (fragmentsChanged)
      this.text = this.fragments
        .filter((x) => x && ['RESPONSE', 'TEMPLATE_RESPONSE'].includes(x.type))
        .map((x) => x.content || '')
        .join('');
    if (bytes(this.fragments) > MAX_SOURCE * 4) throw Error('Fragments exceed streaming limit');
  }
  emit(appendOnly = false) {
    if (bytes(this.text) > MAX_SOURCE * 4) throw Error('Reply exceeds streaming limit');
    this.scanner.update(this.text, appendOnly);
  }
}
