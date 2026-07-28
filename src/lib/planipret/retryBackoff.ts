// Retry générique avec backoff exponentiel + jitter.
// Utilisé pour les synchronisations Maestro/CRM et l'envoi SMS.

export type RetryOptions = {
  /** Nombre total de tentatives (1 = pas de retry). Défaut: 4 */
  attempts?: number;
  /** Délai initial en ms. Défaut: 3000 */
  baseDelayMs?: number;
  /** Délai maximum en ms. Défaut: 120000 */
  maxDelayMs?: number;
  /** Signal d'annulation. */
  signal?: AbortSignal;
  /** Callback avant chaque nouvelle tentative. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

export class RetryAbortedError extends Error {
  constructor() {
    super("retry_aborted");
    this.name = "RetryAbortedError";
  }
}

export function backoffDelay(attempt: number, baseDelayMs = 3000, maxDelayMs = 120_000): number {
  const raw = baseDelayMs * Math.pow(3, Math.max(0, attempt - 1));
  const capped = Math.min(raw, maxDelayMs);
  // jitter ±20% pour éviter les rafales simultanées
  return Math.round(capped * (0.8 + Math.random() * 0.4));
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new RetryAbortedError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new RetryAbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Exécute `fn` et réessaie avec backoff exponentiel tant qu'elle échoue.
 * `fn` doit lever une erreur pour déclencher un retry.
 */
export async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseDelayMs = 3000, maxDelayMs = 120_000, signal, onRetry } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new RetryAbortedError();
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      if (e instanceof RetryAbortedError) throw e;
      if (attempt >= attempts) break;
      const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      onRetry?.({ attempt, delayMs, error: e });
      await wait(delayMs, signal);
    }
  }
  throw lastError;
}
