/**
 * Cache mémoire du carnet d’adresses du téléphone.
 * La lecture native peut être lente, surtout au retour dans l’application.
 */
export const DEVICE_CONTACTS_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; rows: any[] };

let cached: CacheEntry | null = null;
let inflight: Promise<any[]> | null = null;

export async function loadCachedDeviceContacts(
  loader: () => Promise<any[]>,
  options: { force?: boolean } = {},
): Promise<any[]> {
  const force = options.force === true;
  if (!force && cached && Date.now() - cached.at < DEVICE_CONTACTS_CACHE_TTL_MS) {
    return cached.rows;
  }
  if (inflight) return inflight;

  inflight = loader()
    .then((rows) => {
      cached = { at: Date.now(), rows };
      return rows;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

/** Test-only reset; never used by the application runtime. */
export function resetDeviceContactsCacheForTests() {
  cached = null;
  inflight = null;
}
