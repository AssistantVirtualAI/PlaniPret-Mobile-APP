// État UI de l'écran d'appel, volontairement hors du routeur React :
// minimiser l'écran ne doit JAMAIS démonter l'appel en cours.
import { useEffect, useState } from "react";

type CallUiState = { minimized: boolean };

let state: CallUiState = { minimized: false };
const listeners = new Set<(s: CallUiState) => void>();

function emit() {
  const snap = state;
  listeners.forEach((l) => { try { l(snap); } catch {} });
}

export const callUi = {
  get: () => state,
  minimize() { if (!state.minimized) { state = { minimized: true }; emit(); } },
  restore() { if (state.minimized) { state = { minimized: false }; emit(); } },
  toggle() { state = { minimized: !state.minimized }; emit(); },
  /** Remis à zéro à chaque nouvel appel pour que l'écran s'ouvre en grand. */
  reset() { if (state.minimized) { state = { minimized: false }; emit(); } },
  subscribe(l: (s: CallUiState) => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

export function useCallUi() {
  const [s, setS] = useState<CallUiState>(callUi.get());
  useEffect(() => callUi.subscribe(setS), []);
  return s;
}
