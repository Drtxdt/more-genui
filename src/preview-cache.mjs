const ttl = 7 * 86400000;
const budget = 10 * 1024 * 1024;
let opening;
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function database() {
  if (!opening) {
    opening = (async () => {
      const req = indexedDB.open('more-genui-previews', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('answers');
        req.result.createObjectStore('sizes');
      };
      const db = await request(req);
      try {
        const { previewCache } = await chrome.storage.local.get('previewCache');
        {
          await transaction(db, async (answers, sizes) => {
            for (const [key, value] of Object.entries(previewCache ?? {})) {
              if (
                value?.at > Date.now() - ttl &&
                Array.isArray(value.items) &&
                !(await request(answers.count(key)))
              )
                store(answers, sizes, key, value);
            }
            await trim(answers, sizes);
          });
          if (previewCache) await chrome.storage.local.remove('previewCache');
        }
        return db;
      } catch (error) {
        db.close();
        throw error;
      }
    })().catch((error) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}
function transaction(db, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['answers', 'sizes'], 'readwrite');
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || Error('cache transaction aborted'));
    action(tx.objectStore('answers'), tx.objectStore('sizes')).then(
      (value) => (result = value),
      (error) => {
        tx.abort();
        reject(error);
      },
    );
  });
}
function store(answers, sizes, key, value) {
  answers.put(value, key);
  sizes.put({ key, at: value.at, bytes: new Blob([key, JSON.stringify(value)]).size }, key);
}
async function trim(answers, sizes) {
  const entries = (await request(sizes.getAll())).sort((a, b) => a.at - b.at);
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  for (const e of entries) {
    if (e.at > Date.now() - ttl && total <= budget) break;
    sizes.delete(e.key);
    answers.delete(e.key);
    total -= e.bytes;
  }
}
export async function restore(key) {
  const db = await database();
  const value = await request(db.transaction('answers').objectStore('answers').get(key));
  return value?.at > Date.now() - ttl ? value.items : [];
}
export async function append(key, item, signal) {
  return transaction(await database(), async (answers, sizes) => {
    const old = await request(answers.get(key));
    const items = old?.at > Date.now() - ttl ? old.items : [];
    if (signal.aborted) return [];
    if (items.length < 4 && !items.some((i) => i.url === item.url || i.data === item.data)) {
      items.push(item);
      store(answers, sizes, key, { at: Date.now(), items });
      await trim(answers, sizes);
    }
    return items;
  });
}
