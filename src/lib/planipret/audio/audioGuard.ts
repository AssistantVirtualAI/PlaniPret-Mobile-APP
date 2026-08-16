/**
 * Garde-fou audio pour l'UI (boîte vocale / studio de message).
 *
 * Empêche le gel constaté quand l'utilisateur clique plusieurs fois pour
 * choisir ou changer de fichier audio :
 *  - une seule opération audio à la fois (sérialisation),
 *  - la précédente lecture est arrêtée + son objet Audio libéré,
 *  - chaque opération reçoit un AbortSignal (annulation des requêtes),
 *  - `busy` expose l'état pour désactiver les boutons et afficher un spinner.
 */

type Listener = (busy: boolean) => void;

export class AudioGuard {
  private current: HTMLAudioElement | null = null;
  private controller: AbortController | null = null;
  private running = false;
  private listeners = new Set<Listener>();

  get busy() { return this.running; }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.running);
    return () => { this.listeners.delete(fn); };
  }

  private setBusy(v: boolean) {
    if (this.running === v) return;
    this.running = v;
    this.listeners.forEach((l) => { try { l(v); } catch { /* noop */ } });
  }

  /** Arrête la lecture en cours et annule toute requête audio en vol. */
  cancel() {
    if (this.current) {
      try { this.current.pause(); this.current.src = ""; } catch { /* noop */ }
      this.current = null;
    }
    if (this.controller) { try { this.controller.abort(); } catch { /* noop */ } this.controller = null; }
    this.setBusy(false);
  }

  /**
   * Exécute une opération audio en exclusivité. Les clics rapides successifs
   * annulent la précédente au lieu d'empiler des lectures (source du freeze).
   */
  async run<T>(fn: (signal: AbortSignal) => Promise<T> | T): Promise<T | null> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    this.setBusy(true);
    try {
      const out = await fn(controller.signal);
      return controller.signal.aborted ? null : out;
    } catch (e: any) {
      if (e?.name === "AbortError") return null;
      throw e;
    } finally {
      if (this.controller === controller) { this.controller = null; this.setBusy(false); }
    }
  }

  /** Lecture non bloquante d'une URL : remplace toujours la lecture courante. */
  play(url: string, onEnded?: () => void): HTMLAudioElement | null {
    this.cancel();
    try {
      const el = new Audio(url);
      el.onended = () => { if (this.current === el) this.current = null; onEnded?.(); };
      el.onerror = () => { if (this.current === el) this.current = null; onEnded?.(); };
      this.current = el;
      void el.play().catch(() => { if (this.current === el) this.current = null; onEnded?.(); });
      return el;
    } catch { return null; }
  }

  isPlaying() { return !!this.current; }
}

export const createAudioGuard = () => new AudioGuard();
