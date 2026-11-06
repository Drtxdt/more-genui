export class PreviewPool {
  shared = new Map();
  waiting = new Map();
  running = new Map();
  count = 0;
  constructor(load) {
    this.load = load;
  }
  get(tab, source, signal) {
    if (signal.aborted) return Promise.resolve(null);
    const key = JSON.stringify([source.url, source.image]);
    let job = this.shared.get(key);
    if (!job) {
      job = { tab, key, source, controller: new AbortController(), listeners: new Set() };
      this.shared.set(key, job);
      if (!this.waiting.has(tab)) this.waiting.set(tab, []);
      this.waiting.get(tab).push(job);
    }
    return new Promise((resolve) => {
      const finish = (value) => {
        signal.removeEventListener('abort', abort);
        job.listeners.delete(finish);
        resolve(value);
      };
      const abort = () => {
        finish(null);
        if (!job.listeners.size) {
          job.controller.abort();
          if (this.shared.get(key) === job) this.shared.delete(key);
        }
      };
      job.listeners.add(finish);
      signal.addEventListener('abort', abort, { once: true });
      this.drain();
    });
  }
  drain() {
    while (this.count < 4) {
      const tab = [...this.waiting.keys()].find((id) => (this.running.get(id) || 0) < 2);
      if (tab === undefined) return;
      const queue = this.waiting.get(tab),
        job = queue.shift();
      this.waiting.delete(tab);
      if (queue.length) this.waiting.set(tab, queue);
      if (!job.listeners.size) continue;
      this.count++;
      this.running.set(tab, (this.running.get(tab) || 0) + 1);
      Promise.resolve()
        .then(() =>
          this.load(
            job.source,
            AbortSignal.any([job.controller.signal, AbortSignal.timeout(4000)]),
          ),
        )
        .catch(() => null)
        .then((data) => {
          for (const finish of job.listeners) finish(data);
          if (this.shared.get(job.key) === job) this.shared.delete(job.key);
          this.count--;
          const n = this.running.get(tab) - 1;
          if (n) this.running.set(tab, n);
          else this.running.delete(tab);
          this.drain();
        });
    }
  }
}
