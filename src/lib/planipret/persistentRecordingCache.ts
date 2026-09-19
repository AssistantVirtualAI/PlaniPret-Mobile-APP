const DB_NAME = "pp-recording-audio-v1";
const STORE_NAME = "recordings";
const MAX_ENTRIES = 40;
const MAX_BYTES = 150 * 1024 * 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RecordingEntry = {
  id: string;
  blob: Blob;
  size: number;
  createdAt: number;
  usedAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

async function prune(db: IDBDatabase) {
  const readTx = db.transaction(STORE_NAME, "readonly");
  const entries = (await requestValue(readTx.objectStore(STORE_NAME).getAll()) as RecordingEntry[] | null) ?? [];
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const now = Date.now();
  const valid = entries.filter((entry) => {
    if (now - entry.createdAt <= TTL_MS) return true;
    store.delete(entry.id);
    return false;
  }).sort((a, b) => b.usedAt - a.usedAt);
  let bytes = 0;
  valid.forEach((entry, index) => {
    bytes += entry.size;
    if (index >= MAX_ENTRIES || bytes > MAX_BYTES) store.delete(entry.id);
  });
}

export async function getCachedRecordingUrl(id: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const entry = await requestValue(store.get(id)) as RecordingEntry | null;
  if (!entry || Date.now() - entry.createdAt > TTL_MS) {
    if (entry) store.delete(id);
    return null;
  }
  entry.usedAt = Date.now();
  store.put(entry);
  return URL.createObjectURL(entry.blob);
}

export async function persistRecordingUrl(id: string, url: string, signal?: AbortSignal): Promise<string> {
  if (/^(blob:|data:)/i.test(url)) return url;
  const db = await openDb();
  if (!db) return url;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return url;
    const blob = await response.blob();
    if (!blob.size) return url;
    const now = Date.now();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, blob, size: blob.size, createdAt: now, usedAt: now } satisfies RecordingEntry);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    await prune(db);
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

export const RECORDING_CACHE_LIMITS = { maxEntries: MAX_ENTRIES, maxBytes: MAX_BYTES, ttlMs: TTL_MS } as const;