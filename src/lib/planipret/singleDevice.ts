// Un seul appareil mobile connecté par courtier.
// - claim : à la connexion, cet appareil devient l'appareil actif (serveur).
// - check : à l'ouverture / retour au premier plan, vérifie qu'on l'est encore.
// - realtime : signal immédiat si un autre appareil prend la place.
// L'ancien appareil attend la fin de tout appel en cours avant de se déconnecter.
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "pp_mobile_device_id";
export const REPLACED_FLAG = "pp_signed_out_elsewhere";
export type MobileDeviceClaim = {
  active: boolean;
  deferred: boolean;
  /** False only when the server could not confirm a claim; preserve availability. */
  confirmed: boolean;
  retryAfterSeconds?: number;
};

export function getMobileDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "nostorage0000000000";
  }
}

async function platform(): Promise<"ios" | "android" | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : null;
  } catch { return null; }
}

export async function isNativeMobile(): Promise<boolean> {
  return (await platform()) !== null;
}

export function claimAllowsSipStart(result: MobileDeviceClaim): boolean {
  // A network error must not take an existing broker offline. Only an explicit
  // server-side defer stops SIP from starting on this installation.
  return result.active || !result.confirmed;
}

export async function claimThisDevice(): Promise<MobileDeviceClaim> {
  const p = await platform();
  if (!p) return { active: true, deferred: false, confirmed: false };
  try {
    const { data, error } = await supabase.functions.invoke("pp-mobile-device-claim", {
      body: { action: "claim", device_id: getMobileDeviceId(), platform: p },
    });
    if (error) return { active: true, deferred: false, confirmed: false };
    const claim = (data ?? {}) as { active?: boolean; deferred?: boolean; retry_after_seconds?: unknown };
    const deferred = claim.deferred === true;
    return {
      active: claim.active !== false,
      deferred,
      confirmed: true,
      retryAfterSeconds: Number.isFinite(Number(claim.retry_after_seconds))
        ? Number(claim.retry_after_seconds)
        : undefined,
    };
  } catch {
    return { active: true, deferred: false, confirmed: false };
  }
}

/** true = still active (or unknown: never sign out on network errors). */
export async function checkThisDevice(): Promise<boolean> {
  const p = await platform();
  if (!p) return true;
  try {
    const { data, error } = await supabase.functions.invoke("pp-mobile-device-claim", {
      body: { action: "check", device_id: getMobileDeviceId(), platform: p },
    });
    if (error) return true;
    return (data as { active?: boolean } | null)?.active !== false;
  } catch { return true; }
}

/** Decides whether a remote active-device row means "signed in elsewhere". */
export function isReplacedBy(remoteDeviceId: unknown, myDeviceId: string): boolean {
  return typeof remoteDeviceId === "string" && remoteDeviceId.length > 0 && remoteDeviceId !== myDeviceId;
}

/** Returns true when a call is ringing/active/held, so sign-out must wait. */
export function callBlocksSignOut(callState: string | null | undefined): boolean {
  return ["ringing-in", "ringing-out", "active", "held"].includes(String(callState ?? ""));
}
