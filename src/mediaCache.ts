import type { CloudPayload } from "./cloudCrypto";
// Only encrypted payloads enter persistent storage. The live metadata list still
// authorizes every photo; caches never supply a list of accessible images.
const DB = "scdr-encrypted-media",
  LIMIT = 12;
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore("images", { keyPath: "key" });
      store.createIndex("at", "at");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function cachedMedia(key: string): Promise<CloudPayload | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction("images"),
        r = tx.objectStore("images").get(key);
      r.onsuccess = () => resolve(r.result?.payload || null);
      r.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}
export async function cacheMedia(key: string, payload: CloudPayload) {
  if (JSON.stringify(payload).length > 2_600_000) return;
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("images", "readwrite"),
        store = tx.objectStore("images");
      store.put({ key, payload, at: Date.now() });
      const count = store.count();
      count.onsuccess = () => {
        let excess = count.result - LIMIT;
        if (excess > 0) {
          const cursor = store.index("at").openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (item && excess-- > 0) {
              item.delete();
              item.continue();
            }
          };
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    /* Caching must never prevent opening a photo. */
  }
}
export async function removeCachedMedia(key: string) {
  try {
    const db = await open();
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").delete(key);
    tx.oncomplete = () => db.close();
  } catch {}
}
