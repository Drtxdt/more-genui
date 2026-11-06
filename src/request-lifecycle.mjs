import { digest } from './state.mjs';
export class RequestLifecycle {
  requests = new Map();
  bindings = new Map();
  active = new Set();
  owners = new WeakMap();
  verified = new WeakMap();
  constructor(rescan) {
    this.rescan = rescan;
  }
  start(id, baseline, repairToken) {
    const r = { id, baseline, repairToken, complete: new Set(), hashes: new Set(), ended: false };
    this.requests.set(id, r);
    this.active.add(id);
  }
  identify(id, key) {
    const r = this.requests.get(id);
    if (r && key) {
      if (this.bindings.get(r.key) === r) this.bindings.delete(r.key);
      r.key = String(key);
      this.bindings.set(r.key, r);
    }
  }
  source(id, source) {
    const r = this.requests.get(id);
    if (!r) return;
    r.complete.add(source);
    void digest(source).then((hash) => r.hashes.add(hash));
  }
  owner(code, key, source) {
    let r = this.bindings.get(key) ?? this.owners.get(code);
    if (!r && this.active.size === 1) {
      const candidate = this.requests.get([...this.active][0]);
      if (candidate && !candidate.key && candidate.baseline.get(code) !== source) {
        r = candidate;
        if (key) this.identify(r.id, key);
      }
    }
    if (!r) {
      const matches = [...this.requests.values()].filter(
        (x) => x.ended && !x.key && x.complete.has(source.trim()),
      );
      if (matches.length === 1) r = matches[0];
    }
    if (r) this.owners.set(code, r);
    return r;
  }
  confirmed(code, r, source) {
    if (r.complete.has(source.trim())) return true;
    if (!r.ended || !r.hashes.size) return false;
    const cached = this.verified.get(code);
    if (cached?.source === source && cached.r === r) return cached.ok;
    const check = { source, r, ok: false };
    this.verified.set(code, check);
    void digest(source.trim()).then((hash) => {
      if (r.hashes.has(hash)) {
        check.ok = true;
        this.rescan();
      }
    });
    return false;
  }
  end(id) {
    const r = this.requests.get(id);
    if (!r) return;
    this.active.delete(id);
    r.ended = true;
    r.timer = setTimeout(() => {
      r.complete.clear();
      r.baseline = new WeakMap();
      this.requests.delete(id);
    }, 2000);
  }
  clear() {
    for (const r of this.requests.values()) clearTimeout(r.timer);
    this.requests.clear();
    this.bindings.clear();
    this.active.clear();
    this.owners = new WeakMap();
    this.verified = new WeakMap();
  }
}
