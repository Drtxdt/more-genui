import { sourceHistory } from '../src/source-history.mjs';
import { PreviewPool } from '../src/preview-pool.mjs';
import { database, restore, append } from '../src/preview-cache.mjs';
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
  chrome.runtime.onInstalled.addListener(() => {
    void database().catch(() => {
      /* The next cache read retries migration. */
    });
  });
  const pool = new PreviewPool(imageFor);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.enabled?.newValue === false || changes.previewImages?.newValue === false)
    ) {
      for (const controller of jobs.values()) controller.abort();
      jobs.clear();
      registered.clear();
    }
  });
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
    const key = JSON.stringify([m.route, String(m.message).slice(0, 128)]);
    if (m.route !== new URL(sender.url).pathname) return;
    if (m.type === 'preview:readSources' || m.type === 'preview:saveSources') {
      if (m.type === 'preview:saveSources' && !Array.isArray(m.sources)) return;
      sourceHistory(key, m.type === 'preview:saveSources' ? m.sources : undefined)
        .then(respond, () => respond([]));
      return true;
    }
    const registration = JSON.stringify([sender.documentId, key]);
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
      records.set(registration, sources);
      if (records.size > 32) records.delete(records.keys().next().value!);
      registered.set(tab, records);
      respond(true);
      return;
    }
    const controller = jobs.get(tab) ?? new AbortController();
    jobs.set(tab, controller);
    const run = async () => {
      const settings = await chrome.storage.local.get(['enabled', 'previewImages']);
      if (
        settings.enabled === false ||
        settings.previewImages === false ||
        controller.signal.aborted
      )
        return [];
      const items = await restore(key);
      if (m.type === 'preview:restore') return items;
      const source = registered.get(tab)?.get(registration)?.get(m.source);
      if (m.type !== 'preview:one' || controller.signal.aborted) return [];
      if (!source) return { registerAgain: true };
      if (items.length >= 4 || items.some((i: any) => i.url === source.url)) return items;
      const data = await pool.get(tab, source, controller.signal);
      if (!data || controller.signal.aborted) return items;
      return append(
        key,
        { url: source.url, index: source.index, title: source.title, data },
        controller.signal,
      );
    };
    run().then(respond, () => respond([]));
    return true;
  });
});
