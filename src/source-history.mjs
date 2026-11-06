// Keep citation text outside the extension settings and app progress quota.
let opening;
function db() {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('more-genui-source-history', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('records').createIndex('at', 'at');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        opening = undefined;
        reject(req.error);
      };
    });
  return opening;
}
const week = 7 * 86400000;
function prune(store, now) {
  const cursor = store.index('at').openCursor(null, 'prev');
  let count = 0;
  cursor.onsuccess = () => {
    const item = cursor.result;
    if (!item) return;
    if (++count > 256 || item.key <= now - week) item.delete();
    item.continue();
  };
}
export async function purgeSourceHistory(now = Date.now()) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('records', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    prune(tx.objectStore('records'), now);
  });
}
export async function sourceHistory(key, sources) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    let result = [];
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
    if (!sources) {
      prune(store, Date.now());
      const read = store.get(key);
      read.onsuccess = () => {
        if (read.result?.at > Date.now() - week) result = read.result.sources;
      };
      return;
    }
    store.put({ at: Date.now(), sources }, key);
    prune(store, Date.now());
  });
}
