// Configuration distante de l'application mobile.
// Récupère les interrupteurs, messages et mises à jour poussés depuis le portail admin.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const APP_KEY = "planipret";
const CHANNEL = "prod";
const CACHE_KEY = "pp.remoteConfig.v1";
const REFRESH_MS = 5 * 60 * 1000;

export type RemoteConfig = {
  flags: Record<string, boolean>;
  messages: Record<string, string>;
  settings: Record<string, unknown>;
  min_version: string | null;
  recommended_version: string | null;
  maintenance_mode: boolean;
  maintenance_message: string | null;
};

export type RemoteRelease = {
  version: string;
  notes: string | null;
  url: string | null;
  needs_update: boolean;
} | null;

const EMPTY: RemoteConfig = {
  flags: {}, messages: {}, settings: {},
  min_version: null, recommended_version: null,
  maintenance_mode: false, maintenance_message: null,
};

function readCache(): { config: RemoteConfig; release: RemoteRelease } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function appVersion(): string | null {
  try { return (import.meta as any).env?.VITE_APP_VERSION ?? null; } catch { return null; }
}

/** Compare "1.2.3" — renvoie true si `a` < `b`. */
export function isVersionLower(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export function useRemoteConfig() {
  const cached = readCache();
  const [config, setConfig] = useState<RemoteConfig>(cached?.config ?? EMPTY);
  const [release, setRelease] = useState<RemoteRelease>(cached?.release ?? null);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("mobile-config", {
        body: { app_key: APP_KEY, channel: CHANNEL, version: appVersion() },
      });
      if (error || (data as any)?.error) return;
      const cfg = (data as any).config as RemoteConfig;
      const rel = (data as any).release as RemoteRelease;
      setConfig(cfg ?? EMPTY);
      setRelease(rel ?? null);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ config: cfg, release: rel })); } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const isEnabled = useCallback(
    (flag: string) => config.flags[flag] !== false,
    [config.flags],
  );

  const setting = useCallback(
    <T,>(key: string, fallback: T): T => (config.settings[key] as T) ?? fallback,
    [config.settings],
  );

  return {
    config,
    release,
    loading,
    refresh,
    isEnabled,
    setting,
    maintenance: config.maintenance_mode,
    maintenanceMessage: config.maintenance_message,
    forceUpdate: isVersionLower(appVersion(), config.min_version),
  };
}
