import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAudioGuard } from "../audioGuard";

class FakeAudio {
  static instances: FakeAudio[] = [];
  paused = false;
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
  pause() { this.paused = true; }
  play() { return Promise.resolve(); }
}

describe("AudioGuard — anti-freeze boîte vocale", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    (globalThis as any).Audio = FakeAudio as any;
  });

  it("expose busy et le remet à false après l'opération", async () => {
    const g = createAudioGuard();
    const seen: boolean[] = [];
    g.subscribe((b) => seen.push(b));
    await g.run(async () => "ok");
    expect(seen).toEqual([false, true, false]);
    expect(g.busy).toBe(false);
  });

  it("des clics rapides n'empilent pas les lectures (une seule audio active)", () => {
    const g = createAudioGuard();
    g.play("a.mp3"); g.play("b.mp3"); g.play("c.mp3");
    expect(FakeAudio.instances.length).toBe(3);
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(FakeAudio.instances[1].paused).toBe(true);
    expect(FakeAudio.instances[2].paused).toBe(false);
  });

  it("annule la requête précédente via AbortSignal", async () => {
    const g = createAudioGuard();
    let aborted = false;
    const first = g.run((signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => { aborted = true; resolve("aborted"); });
    }));
    const second = g.run(async () => "second");
    expect(await second).toBe("second");
    await first;
    expect(aborted).toBe(true);
    expect(g.busy).toBe(false);
  });

  it("libère l'état même quand l'opération échoue (pas de spinner bloqué)", async () => {
    const g = createAudioGuard();
    await expect(g.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(g.busy).toBe(false);
  });

  it("10 changements de fichier successifs restent réactifs", async () => {
    const g = createAudioGuard();
    for (let i = 0; i < 10; i++) {
      g.play(`file-${i}.mp3`);
      await g.run(async () => i);
    }
    expect(g.busy).toBe(false);
    expect(g.isPlaying()).toBe(false); // run() annule la lecture précédente
  });
});
