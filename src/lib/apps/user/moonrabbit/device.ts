import { generate_device_key, type QuickRecord } from "./quick";

/** Per device and outside OPFS on purpose: backups and a copied `/home` never carry the device key or a quick wrap. */
const DB_NAME = "webos.moonrabbit";
const KEYS = "keys";
const QUICK = "quick";
const DEVICE_KEY = "device";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open_db(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(KEYS);
    req.result.createObjectStore(QUICK, { keyPath: "journal_id" });
  };
  return request(req);
}

async function with_store<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open_db();
  try {
    const transaction = db.transaction(store, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    done.catch(() => undefined);
    const result = await request(run(transaction.objectStore(store)));
    await done;
    return result;
  } finally {
    db.close();
  }
}

/** The non-extractable HMAC key, created on first use. Structured clone keeps it non-extractable in IndexedDB. */
export async function device_key(): Promise<CryptoKey> {
  const existing = await with_store<CryptoKey | undefined>(KEYS, "readonly", (store) => store.get(DEVICE_KEY));
  if (existing) return existing;
  const key = await generate_device_key();
  await with_store(KEYS, "readwrite", (store) => store.add(key, DEVICE_KEY)).catch(() => undefined);
  return (await with_store<CryptoKey | undefined>(KEYS, "readonly", (store) => store.get(DEVICE_KEY))) ?? key;
}

export function read_quick(journal_id: string): Promise<QuickRecord | undefined> {
  return with_store<QuickRecord | undefined>(QUICK, "readonly", (store) => store.get(journal_id));
}

export async function write_quick(record: QuickRecord): Promise<void> {
  await with_store(QUICK, "readwrite", (store) => store.put(record));
}

export async function delete_quick(journal_id: string): Promise<void> {
  await with_store(QUICK, "readwrite", (store) => store.delete(journal_id));
}

export async function patch_quick(journal_id: string, patch: Partial<QuickRecord>): Promise<QuickRecord | undefined> {
  const record = await read_quick(journal_id);
  if (!record) return undefined;
  const next = { ...record, ...patch };
  await write_quick(next);
  return next;
}

/** Uninstall with "delete data": the device key and every quick-unlock record go; journals still open with the phrase. */
export function delete_device_store(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
