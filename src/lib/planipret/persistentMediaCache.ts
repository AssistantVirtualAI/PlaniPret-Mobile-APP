/**
 * Cache persistant (mémoire + localStorage) pour des contenus lourds :
 * corps de courriels et liens audio d'enregistrements.
 *
 * Contrairement à `screenCache`, chaque espace de noms est borné :
 *   - nombre d'entrées maximum (éviction LRU),
 *   - poids total maximum (éviction LRU),
 *   - TTL par entrée.
 * Les entrées survivent au redémarrage de l'app (localStorage).
 */

type Entry<T> = { at: number; used: number; value: T };
type Store<T> = Record<string, Entry<T>>;

export type PersistentCache<T> = {
  get(id: string): T | null;
  peek(id: string): T | null;
  set(id: string, value: T): void;
  has(id: string): boolean;
  remove(id: string): void;
  clear(): void;
  size(): number;
};

export function createPersistentCache<T>(opts: {
  namespace: string;
  ttlMs: number;
  maxEntries: number;
  maxBytes: number;
}): PersistentCache<T> {
  const diskKey = `pp:media:cache:v1:${opts.namespace}`;
  let memory: Store<T> | null = null;

  const read = (): Store<T> => {
    if (memory) return memory;
    try {
      const raw = localStorage.getItem(diskKey);
      const parsed = raw ? (JSON.parse(raw) as Store<T>) : {};
      memory = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      memory = {};
    }
    return memory!;
  };

  const persist = (store: Store<T>) => {
    memory = store;
    try {
      localStorage.setItem(diskKey, JSON.stringify(store));
    } catch {
      // Quota dépassé : on réduit de moitié plutôt que de tout perdre.
      const ids = Object.keys(store).sort((a, b) => store[a].used - store[b].used);
      for (const id of ids.slice(0, Math.ceil(ids.length / 2))) delete store[id];
      memory = store;
      try { localStorage.setItem(diskKey, JSON.stringify(store)); } catch { /* ignore */ }
    }
  };

  const prune = (store: Store<T>) => {
    const now = Date.now();
    for (const [id, entry] of Object.entries(store)) {
      if (!entry || typeof entry.at !== "number" || now - entry.at > opts.ttlMs) delete store[id];
    }
    let ids = Object.keys(store).sort((a, b) => store[b].used - store[a].used);
    if (ids.length > opts.maxEntries) {
      for (const id of ids.slice(opts.maxEntries)) delete store[id];
      ids = ids.slice(0, opts.maxEntries);
    }
    let bytes = 0;
    for (const id of ids) {
      bytes += JSON.stringify(store[id]?.value ?? "").length;
      if (bytes > opts.maxBytes) delete store[id];
    }
  };

  return {
    peek(id) {
      const entry = read()[id];
      return entry ? entry.value : null;
    },
    get(id) {
      const store = read();
      const entry = store[id];
      if (!entry) return null;
      if (Date.now() - entry.at > opts.ttlMs) { delete store[id]; persist(store); return null; }
      entry.used = Date.now();
      return entry.value;
    },
    has(id) {
      const entry = read()[id];
      return !!entry && Date.now() - entry.at <= opts.ttlMs;
    },
    set(id, value) {
      const store = read();
      store[id] = { at: Date.now(), used: Date.now(), value };
      prune(store);
      persist(store);
    },
    remove(id) {
      const store = read();
      if (!(id in store)) return;
      delete store[id];
      persist(store);
    },
    clear() {
      memory = {};
      try { localStorage.removeItem(diskKey); } catch { /* ignore */ }
    },
    size() {
      const store = read();
      prune(store);
      return Object.keys(store).length;
    },
  };
}

/** Corps complet des courriels (auto-chargés), conservé 24 h. */
export const emailBodyCache = createPersistentCache<any>({
  namespace: "email-body",
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 80,
  maxBytes: 2_000_000,
});

/**
 * Liens audio signés des enregistrements. Le fichier lui-même reste en cache
 * durable côté serveur ; seul le lien temporaire expire, d'où un TTL court.
 */
export const recordingAudioCache = createPersistentCache<string>({
  namespace: "recording-audio",
  ttlMs: 14 * 60 * 1000,
  maxEntries: 300,
  maxBytes: 300_000,
});
