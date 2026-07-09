// Planipret mobile — microphone permission gate.
// Detects permission state, requests access, and returns a normalized result the
// caller can act on (open a fallback dialog, guide user to OS settings, etc.).
// Works on web + Capacitor (uses navigator.mediaDevices; Capacitor Android/iOS
// bridges getUserMedia to the native mic permission dialog automatically).

export type MicPermissionState = "granted" | "denied" | "prompt" | "unavailable";

export interface MicPermissionResult {
  state: MicPermissionState;
  error?: string;
  stream?: MediaStream;
}

/** Query without prompting. Returns "prompt" when the API can't tell. */
export async function queryMicPermission(): Promise<MicPermissionState> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "unavailable";
    }
    const p: any = (navigator as any).permissions;
    if (p?.query) {
      try {
        const r = await p.query({ name: "microphone" as PermissionName });
        if (r.state === "granted" || r.state === "denied" || r.state === "prompt") return r.state;
      } catch { /* not supported */ }
    }
    return "prompt";
  } catch {
    return "prompt";
  }
}

/** Actively request mic access. Returns a live stream on success (caller must
 *  stop it if not needed). On denial the error is normalized. */
export async function requestMicPermission(): Promise<MicPermissionResult> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return { state: "unavailable", error: "getUserMedia not available" };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return { state: "granted", stream };
  } catch (e: any) {
    const name = e?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { state: "denied", error: "Microphone permission denied" };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { state: "unavailable", error: "No microphone detected" };
    }
    return { state: "denied", error: e?.message ?? "Microphone unavailable" };
  }
}

/** One-shot helper: probes and requests only when needed. */
export async function ensureMicPermission(): Promise<MicPermissionResult> {
  const s = await queryMicPermission();
  if (s === "granted") return { state: "granted" };
  if (s === "unavailable") return { state: "unavailable", error: "No microphone" };
  return await requestMicPermission();
}
