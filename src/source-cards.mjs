export class SourceCards {
  requests = new Map();
  answers = new Map();
  constructor(storage) {
    this.storage = storage;
  }
  update(id, patch) {
    const req = Object.assign(this.requests.get(id) ?? {}, patch);
    this.requests.set(id, req);
    if (req.key == null || !req.sources?.length) return;
    const a = this.answer(String(req.key));
    a.sources = req.sources;
    const route = location.pathname;
    const sources = req.sources;
    a.saving = (a.saving ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.storage({ type: 'preview:saveSources', route, message: req.key, sources }))
      .catch(() => {});
    this.draw(a);
  }
  answer(key) {
    if (!this.answers.has(key)) this.answers.set(key, { nodes: [], sources: [] });
    return this.answers.get(key);
  }
  render(message) {
    const key = message.closest('[data-virtual-list-item-key]')?.dataset.virtualListItemKey;
    const body = message.querySelector('.ds-assistant-message-main-content');
    if (!key || !body) return;
    const a = this.answer(key);
    a.body = body;
    if (!a.read) {
      a.read = true;
      this.storage({ type: 'preview:readSources', route: location.pathname, message: key })
        .then((record) => {
          if (this.answers.get(key) !== a || a.sources.length) return;
          a.sources = Array.isArray(record) ? record : [];
          this.draw(a);
        })
        .catch(() => {});
    }
    this.draw(a);
  }
  draw(a) {
    if (!a.body?.isConnected || !a.sources.length) return;
    const cites = [
      ...a.body.querySelectorAll('a[href],sup,[data-citation-group],[data-citation-index]'),
    ].filter((el) => !el.closest('aside,pre,.more-genui-surface'));
    const groups = new Map();
    for (const s of a.sources) {
      for (const el of cites) {
        const indices =
          (el.dataset.citationIndex ?? el.dataset.citationGroup ?? el.textContent.trim()).match(
            /\d+/g,
          ) ?? [];
        if (
          el.href !== s.href &&
          el.href !== s.url &&
          !(
            s.index != null &&
            indices.includes(String(s.index)) &&
            el.matches('sup,[data-citation-group],[data-citation-index]')
          )
        )
          continue;
        const paragraph = el.closest('li,p,h2,h3,h4');
        if (!paragraph) continue;
        const heading = [...a.body.querySelectorAll('h2,h3,h4')]
          .filter(
            (h) =>
              h === paragraph ||
              h.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING,
          )
          .at(-1);
        const anchor = heading ?? paragraph;
        if (!groups.has(anchor)) groups.set(anchor, new Set());
        groups.get(anchor).add(s);
      }
    }
    const anchors = [...groups.keys()];
    const signature = JSON.stringify([
      a.sources,
      [...groups.values()].map((set) => [...set].map((s) => s.index ?? s.url)),
    ]);
    if (
      a.signature === signature &&
      a.nodes.every((n) => a.body.contains(n)) &&
      anchors.every((n, i) => a.anchors[i] === n)
    )
      return;
    a.signature = signature;
    a.anchors = anchors;
    const open = a.nodes.at(-1)?.querySelector('details')?.open;
    for (const n of a.nodes) n.remove();
    a.nodes = [];
    const links = (parent, sources) => {
      for (const s of sources) {
        let u;
        try {
          u = new URL(s.href ?? s.url);
        } catch {
          continue;
        }
        if (u.protocol !== 'https:') continue;
        const link = document.createElement('a');
        link.href = u.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent =
          (s.index != null ? '[' + s.index + '] ' : '') + (s.title || u.hostname + u.pathname);
        link.style.cssText = 'display:block;overflow-wrap:anywhere;color:inherit';
        parent.append(link);
      }
    };
    const box = () => {
      const el = document.createElement('aside');
      el.className = 'more-genui-sources';
      el.style.cssText = 'font:13px/1.6 system-ui;color:inherit;margin:.4em 0';
      a.nodes.push(el);
      return el;
    };
    for (const [anchor, sources] of groups) {
      const el = box();
      links(el, sources);
      anchor.after(el);
    }
    const footer = box(),
      details = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = '全部检索来源（' + a.sources.length + '）';
    details.open = !!open;
    details.append(summary);
    links(details, a.sources);
    footer.append(details);
    a.body.append(footer);
  }
  clear() {
    for (const a of this.answers.values()) for (const n of a.nodes) n.remove();
    this.answers.clear();
    this.requests.clear();
  }
}
