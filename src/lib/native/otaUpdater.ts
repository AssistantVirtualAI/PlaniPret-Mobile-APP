// Politique de distribution native seulement.
//
// Les mises à jour Planiprêt passent exclusivement par l'App Store et Google
// Play. Le plugin Capgo reste uniquement pour réinitialiser un ancien bundle
// téléchargé auparavant, jamais pour consulter, télécharger ou activer une OTA.
import { CapacitorUpdater } from "@capgo/capacitor-updater";

const LAST_APPLIED_KEY = "pp.ota.lastApplied";

type CurrentBundle = {
  bundle?: { id?: string; version?: string | null };
  native?: string | null;
};

export type OtaUpdateResult = {
  status: "no-plugin" | "up-to-date" | "reset-to-builtin" | "error";
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

/**
 * À appeler une fois au démarrage de l'application native. Tout bundle qui
 * n'est pas celui du binaire embarqué est supprimé, quel que soit son numéro
 * de version : aucun code OTA ne peut prendre le dessus sur une release Store.
 */
export async function checkAndApplyOtaUpdate(): Promise<OtaUpdateResult> {
  try {
    try { await CapacitorUpdater.notifyAppReady(); } catch { /* noop */ }
    const current = await updaterCurrent();
    if (!current) return { status: "no-plugin" };
    const nativeVersion = current.native || bundledWebVersion();
    const bundleId = current.bundle?.id;
    const bundleVersion = current.bundle?.version;
    const hasRemoteBundle = !!bundleId && bundleId !== "builtin";

    if (hasRemoteBundle) {
      log("bundle OTA résiduel détecté, retour au binaire embarqué", { bundleId, bundleVersion, nativeVersion });
      try { localStorage.removeItem(LAST_APPLIED_KEY); } catch { /* noop */ }
      await CapacitorUpdater.reset();
      return { status: "reset-to-builtin", version: nativeVersion ?? undefined };
    }
    return { status: "up-to-date", version: nativeVersion ?? undefined };
  } catch (e) {
    log("échec de la réinitialisation OTA", e);
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
