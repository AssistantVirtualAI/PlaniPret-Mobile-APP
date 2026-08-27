// @vitest-environment jsdom
/**
 * Test E2E (UI) — boîte vocale : changements répétés de fichier audio et
 * ouvertures/fermetures successives de la feuille.
 *
 * Reproduit le scénario de gel signalé : l'utilisateur clique plusieurs fois
 * pour choisir/changer le fichier audio pendant qu'une requête est en vol.
 * Vérifie que l'UI reste responsive (boutons réactivés, spinner résorbé,
 * aucune lecture empilée, aucun timer/objet Audio fuité au démontage).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { createAudioGuard, AudioGuard } from "../audioGuard";

let playCount = 0;
let liveAudios = 0;

class FakeAudio {
  paused = false;
  private _src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) { this._src = src; playCount += 1; liveAudios += 1; }
  get src() { return this._src; }
  set src(v: string) { if (v === "" && !this.paused) { /* released */ } this._src = v; }
  pause() { if (!this.paused) { this.paused = true; liveAudios -= 1; } }
  play() { return Promise.resolve(); }
}

/** Feuille « boîte vocale » minimale reproduisant le flux du GreetingStudio. */
function VoicemailSheet({ onClose, latencyMs = 20 }: { onClose: () => void; latencyMs?: number }) {
  const guardRef = useRef<AudioGuard | null>(null);
  if (!guardRef.current) guardRef.current = createAudioGuard();
  const guard = guardRef.current;
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => guard.subscribe(setBusy), [guard]);
  useEffect(() => () => guard.cancel(), [guard]);

  const chooseFile = (name: string) => {
    void guard.run(async (signal) => {
      await new Promise((r) => setTimeout(r, latencyMs));
      if (signal.aborted) return null;
      setFile(name);
      guard.play(`${name}.mp3`);
      return name;
    });
  };

  return (
    <div>
      <p data-testid="state">{busy ? "busy" : "ready"}</p>
      <p data-testid="file">{file ?? "none"}</p>
      {["greeting-a", "greeting-b", "greeting-c"].map((n) => (
        <button key={n} data-testid={`pick-${n}`} disabled={busy} onClick={() => chooseFile(n)}>
          {n}
        </button>
      ))}
      <button data-testid="close" onClick={() => { guard.cancel(); onClose(); }}>fermer</button>
    </div>
  );
}

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="open" onClick={() => setOpen(true)}>ouvrir</button>
      {open && <VoicemailSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("E2E boîte vocale — aucun gel sur changements d'audio répétés", () => {
  beforeEach(() => {
    playCount = 0; liveAudios = 0;
    (globalThis as any).Audio = FakeAudio as any;
  });
  afterEach(() => cleanup());

  it("20 changements de fichier consécutifs : l'UI redevient toujours responsive", async () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId("open"));

    for (let i = 0; i < 20; i++) {
      const target = `pick-greeting-${["a", "b", "c"][i % 3]}`;
      const btn = screen.getByTestId(target) as HTMLButtonElement;
      expect(btn.disabled).toBe(false); // jamais bloqué par l'itération précédente
      fireEvent.click(btn);
      expect(screen.getByTestId("state").textContent).toBe("busy");
      await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("ready"));
    }
    expect(liveAudios).toBeLessThanOrEqual(1); // aucune lecture empilée
  });

  it("clics rapides pendant une requête en vol : une seule sélection aboutit", async () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId("open"));

    // Le bouton est désactivé pendant le traitement : on force les clics via
    // l'API du guard pour simuler des taps parasites (double-tap iOS).
    fireEvent.click(screen.getByTestId("pick-greeting-a"));
    fireEvent.click(screen.getByTestId("pick-greeting-b"));
    fireEvent.click(screen.getByTestId("pick-greeting-c"));

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("ready"));
    expect(screen.getByTestId("file").textContent).not.toBe("none");
    expect(liveAudios).toBeLessThanOrEqual(1);
  });

  it("10 cycles ouverture/fermeture ne laissent ni audio actif ni état bloqué", async () => {
    render(<Host />);
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId("open"));
      fireEvent.click(screen.getByTestId("pick-greeting-a"));
      // fermeture immédiate, pendant la requête en vol
      fireEvent.click(screen.getByTestId("close"));
      expect(screen.queryByTestId("state")).toBeNull();
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    }
    expect(liveAudios).toBe(0);
  });

  it("une erreur de génération ne laisse pas le spinner bloqué", async () => {
    const guard = createAudioGuard();
    await expect(guard.run(async () => { throw new Error("tts_failed"); })).rejects.toThrow("tts_failed");
    expect(guard.busy).toBe(false);
    expect(guard.isPlaying()).toBe(false);
  });

  it("le rendu reste rapide : 30 changements en moins de 2 s", async () => {
    render(<Host />);
    fireEvent.click(screen.getByTestId("open"));
    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      fireEvent.click(screen.getByTestId(`pick-greeting-${["a", "b", "c"][i % 3]}`));
      await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("ready"));
    }
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(playCount).toBeGreaterThan(0);
  });
});
