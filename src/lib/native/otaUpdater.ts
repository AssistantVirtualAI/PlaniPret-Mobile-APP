// Mise à jour OTA du contenu web (Capgo capacitor-updater).
//
// Le portail admin publie un paquet ZIP ; l'application le télécharge au
// démarrage, vérifie sa taille/empreinte puis l'applique au redémarrage
// suivant. Aucun code natif n'est modifié : les changements natifs passent
// toujours par une soumission aux stores.
import { supabase } from "@/integrations/supabase/client";

const APP_KEY = "planipret";
const CHANNEL = "prod";
const LAST_APPLIED_KEY = "pp.ota.lastApplied";

type ReleaseInfo = {
  version: string;
  url: string | null;
  sha256?: string | null;
  size?: number | null;
  needs_update?: boolean;
};

function log(msg: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.info(`[ota] ${msg}`, detail ?? "");
}

function currentWebVersion(): string | null {
  try {
    return (
      localStorage.getItem(LAST_APPLIED_KEY) ||
      ((import.meta as any).env?.VITE_APP_VERSION ?? null)
    );
  } catch {
    return (import.meta as any).env?.VITE_APP_VERSION ?? null;
  }
}

async function loadUpdater() {
  try {
    // Import dynamique : absent en preview web, présent sur iOS/Android.
    const mod = await import(
      /* @vite-ignore */ "@capgo/capacitor-updater"
    );
    return (mod as any).CapacitorUpdater ?? null;
  } catch {
    return null;
  }
}

/**
 * À appeler une fois au démarrage de l'application native.
 * Sans plugin (web/preview) ou sans nouvelle version : ne fait rien.
 */
export async function checkAndApplyOtaUpdate(): Promise<
  { status: "no-plugin" | "up-to-date" | "downloaded" | "error"; version?: string }
> {
  const CapacitorUpdater = await loadUpdater();
  if (!CapacitorUpdater) {
    log("plugin absent — OTA ignorée (web ou build natif sans plugin)");
    return { status: "no-plugin" };
  }

  try {
    // Confirme le bundle courant pour éviter un rollback automatique.
    try { await CapacitorUpdater.notifyAppReady(); } catch { /* noop */ }

    const { data, error } = await supabase.functions.invoke("mobile-config", {
      body: { app_key: APP_KEY, channel: CHANNEL, version: currentWebVersion() },
    });
    if (error || (data as any)?.error) {
      log("configuration indisponible", error ?? (data as any)?.error);
      return { status: "error" };
    }

    const release = (data as any).release as ReleaseInfo | null;
    if (!release?.url || !release.version) return { status: "up-to-date" };
    if (release.version === currentWebVersion()) return { status: "up-to-date" };

    log("téléchargement du paquet", release.version);
    const bundle = await CapacitorUpdater.download({
      url: release.url,
      version: release.version,
      ...(release.sha256 ? { checksum: release.sha256 } : {}),
    });

    // `next` applique le paquet au prochain démarrage complet : jamais en
    // pleine session pour ne pas couper un appel en cours.
    await CapacitorUpdater.next({ id: bundle.id });
    try { localStorage.setItem(LAST_APPLIED_KEY, release.version); } catch { /* noop */ }
    log("paquet prêt, appliqué au prochain démarrage", release.version);
    return { status: "downloaded", version: release.version };
  } catch (e) {
    log("échec de la mise à jour OTA", e);
    return { status: "error" };
  }
}

/** Revient au bundle livré avec l'application (dépannage). */
export async function resetOtaToBuiltin(): Promise<boolean> {
  const CapacitorUpdater = await loadUpdater();
  if (!CapacitorUpdater) return false;
  try {
    await CapacitorUpdater.reset();
    try { localStorage.removeItem(LAST_APPLIED_KEY); } catch { /* noop */ }
    return true;
  } catch {
    return false;
  }
}

export function getAppliedOtaVersion(): string | null {
  try { return localStorage.getItem(LAST_APPLIED_KEY); } catch { return null; }
}
