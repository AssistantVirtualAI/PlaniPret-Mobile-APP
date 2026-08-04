// L'avis « cet appel est enregistré » n'est PLUS joué par l'application.
//
// Raisons :
//  - il ne doit jamais s'embarquer sur les appels sortants du courtier ;
//  - joué localement au décrochage d'un appel entrant, il volait la session
//    audio (AVAudioSession / AudioManager) pendant l'établissement média, ce
//    qui rendait l'appel muet pour l'autre partie.
//
// L'avis reste diffusé par le central NetSapiens aux personnes qui appellent
// le DID d'un courtier (routage DID / annonce de sonnerie).

function log(msg: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.info(`[recording-notice] ${msg}`, detail ?? "");
}

/** No-op conservé pour compatibilité d'API : n'émet plus aucun son. */
export async function playRecordingNotice(
  callKey?: string,
  direction?: "in" | "out" | null,
): Promise<void> {
  log("disabled — the PBX plays the notice to inbound callers only", { callKey, direction });
}

/** No-op conservé pour compatibilité d'API. */
export function resetRecordingNotice(_callKey?: string) {
  /* noop */
}
