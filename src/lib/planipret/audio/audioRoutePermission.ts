import { ensureMicPermission, type MicPermissionResult } from "./micPermission";

export type SpeakerAuthorization = {
  allowed: boolean;
  state: MicPermissionResult["state"] | "not_required";
};

type NativePjsipPermissionBridge = {
  requestMicrophonePermission?: () => Promise<{ granted?: boolean; state?: string }>;
};

function nativePjsipPermissionBridge(): NativePjsipPermissionBridge | null {
  const bridge = (window as any)?.Capacitor?.Plugins?.PpPjsip as NativePjsipPermissionBridge | undefined;
  return bridge?.requestMicrophonePermission ? bridge : null;
}

/**
 * iOS and Android do not expose a standalone operating-system permission for
 * the loudspeaker. A VoIP app needs microphone permission for its call audio
 * session, so request that permission from the user's explicit speaker tap.
 * On iOS PJSIP, use the native permission bridge: a WebView getUserMedia
 * track could compete with the active CallKit audio session. Android/WebRTC
 * use the existing browser/Capacitor prompt and release its short probe.
 */
export async function authorizeSpeakerRoute(
  isNative: boolean,
  requestMicrophone: () => Promise<MicPermissionResult> = ensureMicPermission,
): Promise<SpeakerAuthorization> {
  if (!isNative) return { allowed: true, state: "not_required" };

  const nativeBridge = nativePjsipPermissionBridge();
  if (nativeBridge) {
    try {
      const result = await nativeBridge.requestMicrophonePermission!();
      const allowed = result?.granted === true || result?.state === "granted";
      return { allowed, state: allowed ? "granted" : "denied" };
    } catch {
      return { allowed: false, state: "denied" };
    }
  }

  const result = await requestMicrophone();
  try { result.stream?.getTracks().forEach((track) => track.stop()); } catch { /* best effort */ }

  return {
    allowed: result.state === "granted",
    state: result.state,
  };
}
