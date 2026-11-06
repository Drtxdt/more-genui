export class PreviewRenderer {
  requests = new Map();
  answers = new Map();
  hosts = new Set();
  constructor(send) {
    this.send = send;
  }
  request(id) {
    if (!this.requests.has(id)) this.requests.set(id, {});
    return this.requests.get(id);
  }
  identify(id, key) {
    const req = this.request(id);
    req.key = String(key);
    this.load(req);
  }
  sources(id, sources) {
    const req = this.request(id);
    req.sources = sources;
    this.load(req);
  }
  end(id) {
    const req = this.requests.get(id);
    if (req) {
      req.done = true;
      if (req.key) {
        const answer = this.answers.get(req.key);
        if (answer) {
          answer.done = true;
          this.place(answer);
        }
      }
    }
    this.requests.delete(id);
  }
  load(req) {
    if (!req.key || !req.sources) return;
    const answer = this.answer(req.key);
    answer.live = true;
    const update = async () => {
      await this.send({ type: 'preview:register', message: req.key, sources: req.sources });
      req.attempted ??= new Set();
      for (const source of req.sources.slice(0, 8)) {
        if (this.answers.get(req.key) !== answer || answer.items.length >= 4) break;
        if (req.attempted.has(source.url)) continue;
        req.attempted.add(source.url);
        const items = await this.send({
          type: 'preview:one',
          message: req.key,
          source: source.url,
        });
        if (this.answers.get(req.key) !== answer) return;
        if (Array.isArray(items) && items.length >= answer.items.length) answer.items = items;
        answer.done = req.done;
        this.place(answer);
      }
    };
    req.queue = (req.queue ?? Promise.resolve()).then(update).catch(() => {});
  }
  answer(key) {
    if (!this.answers.has(key))
      this.answers.set(key, { key, items: [], nodes: new Map(), done: false });
    return this.answers.get(key);
  }
  render(message) {
    const key = message
      .closest('[data-virtual-list-item-key]')
      ?.getAttribute('data-virtual-list-item-key');
    const body = message.querySelector('.ds-assistant-message-main-content');
    if (!key || !body) return;
    const answer = this.answer(key);
    answer.body = body;
    if (!answer.live && !answer.restoring) {
      answer.restoring = true;
      this.send({ type: 'preview:restore', message: key })
        .then((items) => {
          if (answer.live || this.answers.get(key) !== answer) return;
          answer.items = items ?? [];
          answer.done = true;
          this.place(answer);
        })
        .catch(() => {});
    }
    this.place(answer);
  }
  place(answer) {
    const body = answer.body;
    if (!body?.isConnected) return;
    const used = new Set();
    for (const item of answer.items) {
      let anchor = [
        ...body.querySelectorAll('a[href],[data-citation-index],[data-citation-group],sup'),
      ]
        .find(
          (el) =>
            el.href === item.url ||
            (item.index != null &&
              (el.dataset.citationIndex ??
                el.dataset.citationGroup ??
                el.textContent.trim().replace(/^\[|\]$/g, '')) === String(item.index)),
        )
        ?.closest('p,li,h2,h3,h4');
      if (anchor?.closest('pre,.more-genui-surface')) anchor = null;
      if (anchor) {
        const heading = [...body.querySelectorAll('h2,h3,h4')]
          .filter(
            (el) =>
              el === anchor ||
              el.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING,
          )
          .at(-1);
        anchor = heading ?? anchor;
        if (used.has(anchor)) {
          answer.nodes.get(item.url)?.remove();
          continue;
        }
      }
      if (!anchor && !answer.done) continue;
      if (anchor) used.add(anchor);
      let node = answer.nodes.get(item.url);
      if (!node) {
        node = document.createElement('aside');
        node.className = 'more-genui-preview';
        node.setAttribute('aria-label', '来源预览');
        const root = node.attachShadow({ mode: 'open' }),
          link = document.createElement('a'),
          img = document.createElement('img'),
          label = document.createElement('small'),
          style = document.createElement('style');
        style.textContent =
          ':host{display:inline-block;max-width:140px;margin:4px 12px 8px 0}:host([data-inline]){float:inline-start}a{display:grid;color:inherit;text-decoration:none}img{width:100%;height:88px;object-fit:cover;border-radius:9px}small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px system-ui}@media(max-width:600px){:host([data-inline]){float:none;display:block}}';
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        label.textContent = new URL(item.url).hostname;
        img.alt = '来源预览 · ' + (item.title || label.textContent);
        img.src = item.data;
        link.append(img, label);
        root.append(style, link);
        answer.nodes.set(item.url, node);
        this.hosts.add(node);
      }
      node.toggleAttribute('data-inline', !!anchor);
      if (anchor) {
        if (node.nextElementSibling !== anchor) anchor.before(node);
      } else {
        if (!answer.footer?.isConnected) {
          answer.footer = document.createElement('aside');
          answer.footer.className = 'more-genui-preview';
          const heading = document.createElement('div');
          heading.textContent = '来源预览';
          answer.footer.append(heading);
          body.append(answer.footer);
          this.hosts.add(answer.footer);
        }
        if (node.parentElement !== answer.footer) answer.footer.append(node);
      }
    }
    if (answer.footer?.children.length === 1) answer.footer.remove();
  }
  clear() {
    this.send({ type: 'preview:cancel' }).catch(() => {});
    for (const node of this.hosts) node.remove();
    this.hosts.clear();
    this.answers.clear();
    this.requests.clear();
  }
}
