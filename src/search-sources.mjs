export function publicURL(raw, base) {
  try {
    const u = new URL(raw, base),
      h = u.hostname.toLowerCase().replace(/\.$/, '');
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !h.includes('.') ||
      !/^[a-z0-9.-]+$/.test(h) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
      /(?:^|\.)(?:local|localhost|internal|lan|home|test|invalid|arpa)$/.test(h)
    )
      return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
export function searchSources(fragments) {
  const sources = new Map();
  for (const f of fragments) {
    if (!['SEARCH', 'TOOL_SEARCH'].includes(f?.type) || ['FAILED', 'CANCELLED'].includes(f.status))
      continue;
    for (const r of Array.isArray(f.results ?? f.search_results)
      ? (f.results ?? f.search_results)
      : []) {
      const url = publicURL(r?.url);
      if (url && !sources.has(url))
        sources.set(url, {
          url,
          index: r.cite_index ?? r.citeIndex ?? null,
          image: publicURL(r.image_url ?? r.thumbnail_url ?? r.image?.url),
          title: String(r.title ?? '').slice(0, 200),
        });
      if (sources.size === 12) return [...sources.values()];
    }
  }
  return [...sources.values()];
}
export function representativeImage(html, base) {
  const head = html
    .split(/<\/head\s*>|<body[\s>]/i)[0]
    .replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const images = new Map();
  for (const tag of head.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? []) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [
        m[1].toLowerCase(),
        m[2] ?? m[3] ?? m[4],
      ]),
    );
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (['og:image', 'twitter:image'].includes(key) && attrs.content && !images.has(key))
      images.set(key, publicURL(attrs.content.replaceAll('&amp;', '&'), base));
  }
  return images.get('og:image') ?? images.get('twitter:image');
}
