import { setPref, type PermStatus } from "./platform";

export async function ensureMic(): Promise<PermStatus> {
  let status: PermStatus = "prompt";
  try {
    // Best-effort probe (mobile browsers/WebViews often lack Permissions API for mic).
    if (typeof navigator !== "undefined" && (navigator as any).permissions?.query) {
      try {
        const r = await (navigator as any).permissions.query({ name: "microphone" as PermissionName });
        if (r?.state === "granted") status = "granted";
        else if (r?.state === "denied") status = "denied";
      } catch { /* ignore */ }
    }
    if (status !== "granted") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        status = "granted";
      } catch {
        status = "denied";
      }
    }
  } finally {
    await setPref("perm_mic_v1", status);
  }
  return status;
}
