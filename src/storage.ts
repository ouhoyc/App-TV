import { parseEnvelope, type Envelope } from "./crypto";
const DB = "prive-encrypted";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vault");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(
        new Error(
          "Stockage indisponible. Autorisez les données de ce site dans Safari.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Fermez les autres fenêtres de l’application puis réessayez.",
        ),
      );
  });
}
export async function loadEnvelope(): Promise<Envelope | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly");
      let value: unknown;
      const r = tx.objectStore("vault").get("main");
      r.onsuccess = () => {
        value = r.result;
      };
      tx.oncomplete = () => {
        try {
          resolve(
            value === undefined ? null : parseEnvelope(JSON.stringify(value)),
          );
        } catch (e) {
          reject(e);
        }
      };
      tx.onerror = () => reject(new Error("Lecture du coffre impossible."));
    });
  } finally {
    db.close();
  }
}
export async function saveEnvelope(e: Envelope, expected: string | null) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      const store = tx.objectStore("vault");
      let conflict = false;
      const r = store.get("main");
      r.onsuccess = () => {
        if ((r.result?.ciphertext ?? null) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(e, "main");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            conflict
              ? "Le coffre a changé dans une autre fenêtre. Rechargez la page avant de modifier les données."
              : "Enregistrement impossible. Le stockage est peut-être plein. Vos modifications ne sont pas enregistrées.",
          ),
        );
      tx.onerror = () => reject(new Error("Échec de l’enregistrement local."));
    });
  } finally {
    db.close();
  }
}
