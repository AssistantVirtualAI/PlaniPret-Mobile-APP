import { useCallback, useEffect, useState } from "react";
import { ms365Connected, ms365TokenExpired } from "@/lib/planipret/ms365Connected";

export type Ms365State = "connected" | "missing" | "expired" | "error";

const ERROR_KEY = "pp_ms365_last_error";

/** Record a Microsoft 365 failure so the UI can surface a reconnect prompt. */
export function setMs365Error(message?: string | null) {
  try {
    if (message) localStorage.setItem(ERROR_KEY, JSON.stringify({ message, at: Date.now() }));
    else localStorage.removeItem(ERROR_KEY);
  } catch {}
}

export function getMs365Error(): { message: string; at: number } | null {
  try {
    const raw = localStorage.getItem(ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Errors older than 24h are stale — ignore them.
    if (!parsed?.at || Date.now() - parsed.at > 86_400_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Broadcast a Microsoft 365 link change so every mounted screen re-evaluates. */
export function notifyMs365Changed(): void {
  try {
    window.dispatchEvent(new CustomEvent("pp:ms365-changed"));
  } catch {}
}

/**
 * Derives the Microsoft 365 connection state for the signed-in broker.
 * `missing` = never linked, `expired` = refresh grant is gone,
 * `error` = last Graph/OAuth call failed, `connected` = healthy.
 *
 * Pass `reloadProfile` (from the mobile Outlet context) so the hook can pull a
 * fresh profile after a reconnect: the cached snapshot still carries the old
 * `ms365_token_expiry`, which would otherwise keep the reconnect banner up even
 * though the OAuth exchange succeeded.
 */
export function useMs365Status(
  profile: any,
  reloadProfile?: () => void | Promise<void>,
): { state: Ms365State; errorMessage?: string; refresh: () => void } {
  const [tick, setTick] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(() => getMs365Error()?.message);

  const refresh = useCallback(() => {
    setErrorMessage(getMs365Error()?.message);
    setTick((t) => t + 1);
    try {
      void reloadProfile?.();
    } catch {}
  }, [reloadProfile]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pp:ms365-changed", refresh as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pp:ms365-changed", refresh as EventListener);
    };
  }, [refresh]);

  // A fresh redirect from the OAuth callback (`?ms365=ok`) means the link was
  // just re-established: drop the stale error marker and pull the new profile.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = new URLSearchParams(window.location.search).get("ms365") === "ok";
    } catch {}
    if (!flagged) return;
    setMs365Error(null);
    refresh();
  }, [refresh]);

  let state: Ms365State = "connected";
  if (!ms365Connected(profile)) state = "missing";
  else if (ms365TokenExpired(profile)) state = "expired";
  else if (errorMessage) state = "error";

  // `tick` keeps the hook re-evaluating after refresh() calls.
  void tick;

  return { state, errorMessage, refresh };
}
