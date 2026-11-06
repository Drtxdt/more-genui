import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('source retention deletes expired index entries and retains the newest 256', async ({
  page,
}) => {
  const source = await readFile('src/source-history.mjs', 'utf8');
  await page.goto('/');
  const result = await page.evaluate(async (source) => {
    const { sourceHistory, purgeSourceHistory } = await import(
      'data:text/javascript,' + encodeURIComponent(source)
    );
    const now = Date.now(),
      day = 86400000;
    await purgeSourceHistory(now);
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('more-genui-source-history', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Initialize the module's store before seeding an independent connection.
    const seed = (records) =>
      new Promise((resolve, reject) => {
        const tx = database.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        store.clear();
        for (const [key, at] of records) store.put({ at, sources: [key] }, key);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    const keys = () =>
      new Promise((resolve) => {
        const request = database.transaction('records').objectStore('records').getAllKeys();
        request.onsuccess = () => resolve(request.result);
      });
    await seed([
      ['eight-days', now - 8 * day],
      ['boundary', now - 7 * day],
      ['fresh', now - 6 * day],
    ]);
    await purgeSourceHistory(now);
    const expiry = await keys();
    await seed(Array.from({ length: 260 }, (_, i) => ['record-' + i, now - 260000 + i * 1000]));
    await sourceHistory('newest', ['newest']);
    const capacity = await keys();
    await seed([
      ['idle-expired', now - 8 * day],
      ['fresh', now],
    ]);
    const expiredRead = await sourceHistory('idle-expired');
    const afterRead = await keys();
    database.close();
    return { expiry, capacity, expiredRead, afterRead };
  }, source);
  expect(result.expiry).toEqual(['fresh']);
  expect(result.capacity).toHaveLength(256);
  for (let i = 0; i < 5; i++) expect(result.capacity).not.toContain('record-' + i);
  expect(result.capacity).toContain('record-5');
  expect(result.expiredRead).toEqual([]);
  expect(result.afterRead).toEqual(['fresh']);
});
