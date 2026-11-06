import { defineBackground } from 'wxt/utils/define-background';
import { imageFor } from '../src/preview-download.mjs';
import { publicURL } from '../src/search-sources.mjs';
export default defineBackground(() => {
  const jobs = new Map<number, AbortController>();
  const registered = new Map<
    number,
    Map<
      string,
      Map<string, { url: string; image: string | null; index: number | null; title: string }>
    >
  >();
  let queue = Promise.resolve();
  const ttl = 7 * 86400000,
    limit = 10 * 1024 * 1024;
  async function cache() {
    const entries = ((await chrome.storage.local.get('previewCache')).previewCache ?? {}) as Record<
      string,
      {
        at: number;
        items: Array<{ url: string; index: number | null; title: string; data: string }>;
      }
    >;
    const count = Object.keys(entries).length;
    for (const [k, v] of Object.entries(entries))
      if ((v as any).at < Date.now() - ttl) delete entries[k];
    if (count !== Object.keys(entries).length)
      await chrome.storage.local.set({ previewCache: entries });
    return entries;
  }
  chrome.tabs.onRemoved.addListener((tab) => {
    jobs.get(tab)?.abort();
    jobs.delete(tab);
    registered.delete(tab);
  });
  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (
      sender.frameId !== 0 ||
      !sender.tab?.id ||
      !sender.url?.startsWith('https://chat.deepseek.com/') ||
      !m?.type?.startsWith('preview:')
    )
      return;
    const tab = sender.tab.id;
    if (m.type === 'preview:cancel') {
      jobs.get(tab)?.abort();
      jobs.delete(tab);
      registered.delete(tab);
      respond(true);
      return;
    }
    const key = JSON.stringify([new URL(sender.url).pathname, String(m.message).slice(0, 128)]);
    if (m.type === 'preview:register') {
      if (!Array.isArray(m.sources)) return;
      const records = registered.get(tab) ?? new Map();
      const sources = new Map();
      for (const item of m.sources.slice(0, 8)) {
        const url = publicURL(item?.url);
        if (url)
          sources.set(url, {
            url,
            image: publicURL(item.image),
            index: item.index,
            title: String(item.title ?? '').slice(0, 200),
          });
      }
      records.set(key, sources);
      if (records.size > 32) records.delete(records.keys().next().value!);
      registered.set(tab, records);
      respond(true);
      return;
    }
    const controller = jobs.get(tab) ?? new AbortController();
    jobs.set(tab, controller);
    const run = async () => {
      const entries = await cache();
      if (m.type === 'preview:restore') return entries[key]?.items ?? [];
      if (
        m.type !== 'preview:one' ||
        controller.signal.aborted ||
        !registered.get(tab)?.get(key)?.has(m.source) ||
        (await chrome.storage.local.get('enabled')).enabled === false
      )
        return [];
      const items = entries[key]?.items ?? [];
      const source = registered.get(tab)?.get(key)?.get(m.source);
      for (const s of source ? [source] : []) {
        if (controller.signal.aborted || items.length >= 4) break;
        const url = publicURL(s.url);
        if (!url || items.some((i: any) => i.url === url)) continue;
        const data = await imageFor(
          { url, image: publicURL(s.image) },
          AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        ).catch(() => null);
        if (data && !items.some((i: any) => i.data === data))
          items.push({ url, index: s.index, title: String(s.title ?? '').slice(0, 200), data });
      }
      if (items.length && !controller.signal.aborted) {
        entries[key] = { at: Date.now(), items };
        const keys = Object.keys(entries).sort((a, b) => entries[a].at - entries[b].at);
        while (keys.length && new Blob([JSON.stringify(entries)]).size > limit - 262144)
          delete entries[keys.shift()!];
        await chrome.storage.local.set({ previewCache: entries }).catch(() => {});
      }
      return controller.signal.aborted ? [] : items;
    };
    const result = queue.then(run);
    queue = result.then(
      () => {},
      () => {},
    );
    result.then(respond, () => respond([]));
    return true;
  });
});
