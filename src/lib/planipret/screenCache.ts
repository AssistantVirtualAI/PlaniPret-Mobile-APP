/**
 * Cache d'écran persistant (mémoire + localStorage).
 *
 * Objectif : naviguer entre Accueil, Clients, Tâches, Commissions et Messages
 * sans relancer les endpoints à chaque montage. Chaque écran choisit sa
 * fraîcheur (TTL) :
 *   - commissions : 1 fois par jour
 *   - tâches / courriels / statistiques : 5 minutes
 * Un rafraîchissement explicite (bouton, pull-to-refresh, mutation) passe
 * toujours outre le cache via `force`.
 */

export const TTL = {
  /** Commissions : une fois par jour suffit. */
  daily: 24 * 60 * 60 * 1000,
  /** Tâches, courriels, statistiques d'accueil. */
  fiveMinutes: 5 * 60 * 1000,
} as const;

type Entry<T> = { at: number; value: T };

const PREFIX = "pp:screen:cache:v1:";
const memory = new Map<string, Entry<any>>();

function diskKey(key: string) { return PREFIX + key; }

export function peekScreenCache<T = any>(key: string): Entry<T> | null {
  const hit = memory.get(key);
  if (hit) return hit as Entry<T>;
  try {
    const raw = localStorage.getItem(diskKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    memory.set(key, parsed);
    return parsed;
  } catch { return null; }
}

/** Retourne la valeur seulement si elle est encore fraîche. */
export function readScreenCache<T = any>(key: string, ttlMs: number): Entry<T> | null {
  const hit = peekScreenCache<T>(key);
  if (!hit) return null;
  return Date.now() - hit.at < ttlMs ? hit : null;
}

export function writeScreenCache<T = any>(key: string, value: T): void {
  const entry: Entry<T> = { at: Date.now(), value };
  memory.set(key, entry);
  try { localStorage.setItem(diskKey(key), JSON.stringify(entry)); } catch { /* quota */ }
}

export function invalidateScreenCache(prefix?: string): void {
  if (!prefix) { memory.clear(); return; }
  for (const k of Array.from(memory.keys())) if (k.startsWith(prefix)) memory.delete(k);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(diskKey(prefix))) localStorage.removeItem(k);
    }
  } catch { /* storage disabled */ }
}

export function isFresh(key: string, ttlMs: number): boolean {
  return !!readScreenCache(key, ttlMs);
}
