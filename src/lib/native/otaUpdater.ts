// Mise à jour OTA du contenu web (Capgo capacitor-updater).
//
// Le portail admin publie un paquet ZIP ; l'application le télécharge au
// démarrage, vérifie sa taille/empreinte puis l'applique au redémarrage
// suivant. Aucun code natif n'est modifié : les changements natifs passent
// toujours par une soumission aux stores.
import { supabase } from "@/integrations/supabase/client";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

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

type CurrentBundle = {
  bundle?: { id?: string; version?: string | null };
  native?: string | null;
};

export type OtaUpdateResult = {
  status: "no-plugin" | "up-to-date" | "downloaded" | "reset-to-builtin" | "error";
  version?: string;
};

function log(msg: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.info(`[ota] ${msg}`, detail ?? "");
}

function bundledWebVersion(): string | null {
  try {
    return (import.meta as any).env?.VITE_APP_VERSION ?? null;
  } catch {
    return null;
  }
}

function versionParts(version: string | null | undefined): number[] {
  return String(version ?? "")
    .split(/[.\-+]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Renvoie true uniquement lorsque `candidate` est plus ancienne que `baseline`. */
export function isVersionOlder(candidate: string | null | undefined, baseline: string | null | undefined): boolean {
  if (!candidate || !baseline) return false;
  const left = versionParts(candidate);
  const right = versionParts(baseline);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

async function updaterCurrent(): Promise<CurrentBundle | null> {
  try {
    return await CapacitorUpdater.current() as CurrentBundle;
  } catch {
    return null;
  }
}

/**
 * Version native réellement installée, indépendamment de l'OTA actif.
 * Cela évite qu'un ancien paquet web masque les écrans du nouveau binaire.
 */
export async function nativeAppVersion(): Promise<string | null> {
  const current = await updaterCurrent();
  return current?.native || bundledWebVersion();
}

async function activeWebVersion(): Promise<{ version: string | null; nativeVersion: string | null; staleOta: boolean }> {
  const current = await updaterCurrent();
  const nativeVersion = current?.native || bundledWebVersion();
  const bundleVersion = current?.bundle?.version;
  const hasOta = !!bundleVersion && bundleVersion !== "builtin";

  if (hasOta) {
    try { localStorage.setItem(LAST_APPLIED_KEY, bundleVersion); } catch { /* noop */ }
  }

  return {
    version: hasOta ? bundleVersion : nativeVersion,
    nativeVersion,
    // Une OTA datée ne doit jamais primer sur un nouveau binaire App Store/Play.
    staleOta: hasOta && isVersionOlder(bundleVersion, nativeVersion),
  };
}

/**
 * À appeler une fois au démarrage de l'application native.
 * Sans plugin (web/preview) ou sans nouvelle version : ne fait rien.
 */
export async function checkAndApplyOtaUpdate(): Promise<OtaUpdateResult> {
  try {
    // Confirme le bundle courant pour éviter un rollback automatique.
    try { await CapacitorUpdater.notifyAppReady(); } catch { /* noop */ }

    const { version: currentVersion, nativeVersion, staleOta } = await activeWebVersion();

    // Lorsqu'un binaire plus récent est installé alors qu'une OTA plus ancienne
    // reste sélectionnée, revenir immédiatement au bundle embarqué. `reset`
    // recharge l'application et ne résout normalement jamais sa promesse.
    if (staleOta) {
      log("OTA antérieure au binaire détectée, retour au bundle embarqué", { currentVersion, nativeVersion });
      try { localStorage.removeItem(LAST_APPLIED_KEY); } catch { /* noop */ }
      await CapacitorUpdater.reset();
      return { status: "reset-to-builtin", version: nativeVersion ?? undefined };
    }

    const { data, error } = await supabase.functions.invoke("mobile-config", {
      body: {
        app_key: APP_KEY,
        channel: CHANNEL,
        version: currentVersion,
        native_version: nativeVersion,
      },
    });
    if (error || (data as any)?.error) {
      log("configuration indisponible", error ?? (data as any)?.error);
      return { status: "error" };
    }

    const release = (data as any).release as ReleaseInfo | null;
    if (!release?.url || !release.version) return { status: "up-to-date" };
    if (release.version === currentVersion) return { status: "up-to-date" };
    if (isVersionOlder(release.version, nativeVersion)) {
      log("OTA distante antérieure au binaire ignorée", { release: release.version, nativeVersion });
      return { status: "up-to-date" };
    }

    log("téléchargement du paquet", release.version);
    const bundle = await CapacitorUpdater.download({
      url: release.url,
      version: release.version,
      ...(release.sha256 ? { checksum: release.sha256 } : {}),
    });

    // `next` applique le paquet au prochain démarrage complet : jamais en
    // pleine session pour ne pas couper un appel en cours.
    await CapacitorUpdater.next({ id: bundle.id });
    log("paquet prêt, appliqué au prochain démarrage", release.version);
    return { status: "downloaded", version: release.version };
  } catch (e) {
    log("échec de la mise à jour OTA", e);
    return { status: "error" };
  }
}

/** Revient au bundle livré avec l'application (dépannage). */
export async function resetOtaToBuiltin(): Promise<boolean> {
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
