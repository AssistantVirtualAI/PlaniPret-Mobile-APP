import { ensureMicPermission, type MicPermissionResult } from "./micPermission";

export type SpeakerAuthorization = {
  allowed: boolean;
  state: MicPermissionResult["state"] | "not_required";
};

/**
 * iOS and Android do not expose a standalone operating-system permission for
 * the loudspeaker. A VoIP app needs microphone permission for its call audio
 * session, so request that permission from the user's explicit speaker tap.
 * The short probe stream is immediately released; the existing call engine
 * keeps ownership of its own media tracks.
 */
export async function authorizeSpeakerRoute(
  isNative: boolean,
  requestMicrophone: () => Promise<MicPermissionResult> = ensureMicPermission,
): Promise<SpeakerAuthorization> {
  if (!isNative) return { allowed: true, state: "not_required" };

  const result = await requestMicrophone();
  try { result.stream?.getTracks().forEach((track) => track.stop()); } catch { /* best effort */ }

  return {
    allowed: result.state === "granted",
    state: result.state,
  };
}
