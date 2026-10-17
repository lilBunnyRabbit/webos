/** Mounted folder handles (ADR-044). IndexedDB because a handle survives structured clone but not JSON; nothing else uses it. */

const DATABASE = "webos-mounts";
const STORE = "mounts";

export interface StoredMount {
  name: string;
  handle: FileSystemDirectoryHandle;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "name" });
  return done(request);
}

async function store<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await done(run(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export function load_mounts(): Promise<StoredMount[]> {
  return store("readonly", (mounts) => mounts.getAll() as IDBRequest<StoredMount[]>);
}

export async function save_mount(mount: StoredMount): Promise<void> {
  await store("readwrite", (mounts) => mounts.put(mount));
}

export async function delete_mount(name: string): Promise<void> {
  await store("readwrite", (mounts) => mounts.delete(name));
}
