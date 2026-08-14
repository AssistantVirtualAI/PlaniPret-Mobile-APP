/**
 * Resilient network helpers for high-latency mobile networks (LTE/5G).
 *
 * Cellular carriers (observed on Telus 5G in Montréal) routinely add 1–3 s of
 * setup latency and drop the first TLS handshake after the radio goes idle.
 * A single 8–10 s timeout with no retry turns that into a hard failure screen
 * ("profile_query_timeout") or a false "Microsoft disconnected" state.
 *
 * Everything here is client-side only: same requests, but with adaptive
 * timeouts, one warm-up retry and exponential backoff.
 */

/** Rough "is this a slow link?" hint from the browser Network Information API. */
export function isSlowLink(): boolean {
  const c: any = (navigator as any)?.connection;
  if (!c) return false;
  if (c.saveData) return true;
  const t = String(c.effectiveType ?? "");
  return t === "slow-2g" || t === "2g" || t === "3g";
}

/** Timeout budget scaled for the current link. */
export function adaptiveTimeout(baseMs: number): number {
  const c: any = (navigator as any)?.connection;
  const type = String(c?.type ?? c?.effectiveType ?? "");
  const cellular = type === "cellular" || isSlowLink();
  return cellular ? Math.round(baseMs * 2.5) : baseMs;
}

export function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export type RetryOptions = {
  /** Total attempts, including the first one. */
  attempts?: number;
  /** Base timeout per attempt (scaled by link quality and attempt number). */
  timeoutMs?: number;
  label?: string;
  /** Called after each failed attempt (useful for logging/telemetry). */
  onRetry?: (attempt: number, error: unknown) => void;
};

/**
 * Runs an async task with adaptive timeouts and exponential backoff.
 * Each retry gets a longer budget — the first failure is usually the radio
 * waking up, and the second attempt succeeds within a few hundred ms.
 */
export async function retryWithBackoff<T>(
  task: () => PromiseLike<T>,
  { attempts = 3, timeoutMs = 8000, label = "request", onRetry }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const budget = adaptiveTimeout(timeoutMs) * (i + 1);
    try {
      return await withTimeout(task(), budget, label);
    } catch (err) {
      lastError = err;
      onRetry?.(i + 1, err);
      if (i === attempts - 1) break;
      // 400 ms, 1200 ms, 2800 ms … keeps the retry inside the user's patience.
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i) + Math.random() * 200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
