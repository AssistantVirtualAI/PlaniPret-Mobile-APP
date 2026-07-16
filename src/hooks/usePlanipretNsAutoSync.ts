import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Options = {
  enabled?: boolean;
  intervalMs?: number;
  startDays?: number;
  onQueued?: () => void;
};

let inFlight: Promise<unknown> | null = null;
let lastRun = 0;

export function usePlanipretNsAutoSync(opts: Options = {}) {
  const enabled = opts.enabled ?? true;
  const intervalMs = opts.intervalMs ?? 5 * 60_000;
  const startDays = opts.startDays ?? 90;
  const onQueuedRef = useRef(opts.onQueued);
  onQueuedRef.current = opts.onQueued;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      const now = Date.now();
      if (inFlight || now - lastRun < intervalMs) return;
      const start = new Date(Date.now() - startDays * 24 * 60 * 60 * 1000).toISOString();
      inFlight = supabase.functions.invoke("pp-admin-ns-sync", { body: { start } })
        .then((res) => {
          lastRun = Date.now();
          if (res.error) console.warn("[planipret-ns-auto-sync] queued with error", res.error);
          if (!cancelled) {
            onQueuedRef.current?.();
            window.setTimeout(() => onQueuedRef.current?.(), 10_000);
            window.setTimeout(() => onQueuedRef.current?.(), 30_000);
          }
          return res;
        })
        .catch((err) => {
          console.warn("[planipret-ns-auto-sync] failed", err);
          return null;
        })
        .finally(() => { inFlight = null; });
      await inFlight;
    };

    run();
    const timer = window.setInterval(run, intervalMs);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs, startDays]);
}