import { digest } from './state.mjs';
import { readProof } from './request-proof.mjs';
export class RequestLifecycle {
  proofs = new Map();
  requests = new Map();
  bindings = new Map();
  retained = new Map();
  active = new Set();

  verified = new WeakMap();
  history = new Map();
  historicalNodes = new WeakMap();
  observedTraffic = false;
  classify(code, key, source, language, index = 0) {
    const owner = this.owner(code, key, source);
    if (owner && (!owner.key || !key || owner.key === key)) return { kind: 'live', owner };
    if (this.historicalNodes.get(code) === source || this.history.get(key)?.has(source))
      return { kind: 'history' };
    if (this.observedTraffic) {
      const proof = readProof(source);
      const request = this.proofs.get(proof);
      const receipt = request?.blocks[index];
      if (
        request?.ended &&
        (!request.key || request.key === key) &&
        receipt?.language === language &&
        receipt.hash &&
        !receipt.source
      ) {
        const cached = this.verified.get(code);
        if (
          cached?.r === request &&
          cached.source === source &&
          cached.index === index &&
          cached.ok
        )
          return { kind: 'live', owner: request };
        if (!cached || cached.source !== source || cached.r !== request || cached.index !== index) {
          const check = { r: request, source, index, ok: false };
          this.verified.set(code, check);
          void digest(source.trim()).then((hash) => {
            if (hash === receipt.hash && this.proofs.get(proof) === request) {
              check.ok = true;
              this.rescan();
            }
          });
        }
      }
      if (
        receipt &&
        (!request.key || request.key === key) &&
        receipt.language === language &&
        receipt.source === source.trim()
      ) {
        if (key) this.identify(request.id, key);

        return { kind: 'live', owner: request };
      }
      return { kind: 'unknown' };
    }
    this.historicalNodes.set(code, source);
    if (key) {
      if (!this.history.has(key)) this.history.set(key, new Set());
      const blocks = this.history.get(key);
      blocks.add(source);
      if (blocks.size > 16) blocks.delete(blocks.values().next().value);
      if (this.history.size > 64) this.history.delete(this.history.keys().next().value);
    }
    return { kind: 'history' };
  }
  constructor(rescan) {
    this.rescan = rescan;
  }
  start(id, baseline, repairToken, proof) {
    const r = { id, baseline, proof, repairToken, complete: new Set(), hashes: new Set(), ended: false };
    this.observedTraffic = true;
    r.blocks = [];
    if (proof) {
      this.proofs.set(proof, r);
    }
    this.requests.set(id, r);
    this.active.add(id);
  }
  identify(id, key) {
    const r = this.requests.get(id);
    if (
      r &&
      key &&
      (!r.key || r.key === String(key)) &&
      (!this.bindings.has(String(key)) || this.bindings.get(String(key)) === r)
    ) {
      if (this.bindings.get(r.key) === r) this.bindings.delete(r.key);
      r.key = String(key);
      this.bindings.set(r.key, r);
    }
  }
  source(id, source, language) {
    const r = this.requests.get(id);
    if (!r) return;
    const block = { source, language };
    r.blocks.push(block);
    r.complete.add(source);
    void digest(source).then((hash) => {
      block.hash = hash;
      r.hashes.add(hash);
    });
  }
  owner(code, key, source) {
    return this.bindings.get(key);
  }
  confirmed(code, r, source, language, index) {
    const block = index == null ? undefined : r.blocks[index];
    if (index != null && (!block || (language && block.language !== language))) return false;
    if (block?.source) return block.source === source.trim();
    if (r.complete.has(source.trim())) return true;
    if (!r.ended || !r.hashes.size) return false;
    const cached = this.verified.get(code);
    if (cached?.source === source && cached.r === r && cached.index === index) return cached.ok;
    const check = { source, r, index, ok: false };
    this.verified.set(code, check);
    void digest(source.trim()).then((hash) => {
      if (block ? block.hash === hash : r.hashes.has(hash)) {
        check.ok = true;
        this.rescan();
      }
    });
    return false;
  }
  end(id) {
    const r = this.requests.get(id);
    if (!r || r.ended) return;
    this.active.delete(id);
    r.ended = true;
    r.timer = setTimeout(() => {
      r.complete.clear();
      for (const block of r.blocks) delete block.source;

      r.baseline = new WeakMap();
      this.requests.delete(id);
      this.retained.set(id, r);
      if (this.retained.size > 256) {
        const oldest = this.retained.values().next().value;
        this.retained.delete(oldest.id);
        if (this.bindings.get(oldest.key) === oldest) this.bindings.delete(oldest.key);
        if (this.proofs.get(oldest.proof) === oldest) this.proofs.delete(oldest.proof);
      }
    }, 2000);
  }
  clear() {
    for (const r of this.requests.values()) clearTimeout(r.timer);
    this.history.clear();
    this.retained.clear();
    this.historicalNodes = new WeakMap();
    this.observedTraffic = false;
    this.proofs.clear();
    this.requests.clear();
    this.bindings.clear();
    this.active.clear();

    this.verified = new WeakMap();
  }
}
