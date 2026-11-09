import { MAX_SOURCE, parseApp } from './protocol.mjs';

// DeepSeek renders unfenced HTML as adjacent escaped spans in the answer body.
function documentAt(first) {
  const nodes = [];
  let source = '';
  for (let node = first; node?.matches('span.ds-markdown-html'); node = node.nextElementSibling) {
    if (
      node.children.length ||
      (nodes.length && node.textContent.trimStart().startsWith('<!-- more-genui:'))
    )
      break;
    nodes.push(node);
    source += (nodes.length > 1 ? '\n' : '') + node.textContent;
    if (source.length > MAX_SOURCE) return;
    if (!/<\/html>\s*(?:<!-- more-genui-end -->\s*)?$/i.test(source)) continue;
    source = source.trim().replace(/\s*<!-- more-genui-end -->$/, '');
    // Some responses repeat the separate HTML request proof inside metadata.
    const header =
      /^<!-- more-genui: (\{[^\n]*\}) -->(\s*<!-- more-genui-request: ([a-f0-9-]{36}) -->)/.exec(
        source,
      );
    try {
      if (header) {
        const meta = JSON.parse(header[1]);
        if (Object.hasOwn(meta, 'requestProof') && meta.requestProof === header[3]) {
          delete meta.requestProof;
          source =
            '<!-- more-genui: ' +
            JSON.stringify(meta) +
            ' -->' +
            header[2] +
            source.slice(header[0].length);
        }
      }
      parseApp(source);
      return { nodes, source };
    } catch {
      return;
    }
  }
}

export function rawApplications() {
  const groups = new Map();
  function remove(first, entry) {
    entry.pre.remove();
    for (const [node, display] of entry.original) node.style.display = display;
    groups.delete(first);
  }
  function valid(first, entry, doc) {
    return (
      doc &&
      entry.pre.isConnected &&
      entry.pre.previousElementSibling === doc.nodes.at(-1) &&
      first.parentElement?.matches('.ds-assistant-message-main-content') &&
      doc.source === entry.pre.textContent &&
      doc.nodes.length === entry.original.size &&
      doc.nodes.every((node) => entry.original.has(node))
    );
  }
  return {
    current(pre) {
      for (const [first, entry] of groups)
        if (entry.pre === pre) return valid(first, entry, documentAt(first));
      return true;
    },
    clear() {
      for (const [first, entry] of groups) remove(first, entry);
    },
    prune() {
      for (const [first, entry] of groups) if (!first.isConnected) remove(first, entry);
    },
    refresh(body) {
      for (const [first, entry] of groups) {
        if (
          (entry.body === body || first.parentElement === body) &&
          !valid(first, entry, documentAt(first))
        )
          remove(first, entry);
      }
      for (const first of body.querySelectorAll(':scope > span.ds-markdown-html')) {
        if (groups.has(first) || !first.textContent.trimStart().startsWith('<!-- more-genui:'))
          continue;
        const doc = documentAt(first);
        if (!doc) continue;
        const pre = document.createElement('pre');
        pre.hidden = true;
        pre.dataset.language = 'html'; // Always require explicit preview for an unfenced document.
        pre.textContent = doc.source;
        const original = new Map(doc.nodes.map((node) => [node, node.style.display]));
        for (const node of doc.nodes) node.style.display = 'none';
        doc.nodes.at(-1).after(pre);
        groups.set(first, { body, original, pre });
      }
    },
  };
}
