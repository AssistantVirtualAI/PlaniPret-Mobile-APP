import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Test de registre SIP avec latence simulée.
 *
 * Le serveur NetSapiens répond parfois le challenge 407 entre 13 et 20 s sur
 * cellulaire. Le watchdog doit laisser aboutir le REGISTER TLS (45 s) et ne
 * jamais relancer un second REGISTER en parallèle sur la même AOR
 * (source de PJSIP_EBUSY / fermeture 1001).
 */

const WATCHDOG_MS = 45_000;

type RegisterResult = { ok: boolean; reason?: string; attempts: number };

/** Registrar simulé : envoie 407 après `challengeDelayMs`, puis 200 OK. */
function makeRegistrar(challengeDelayMs: number) {
  let busy = false;
  let attempts = 0;
  let ebusy = false;
  return {
    get ebusy() { return ebusy; },
    get attempts() { return attempts; },
    register(): Promise<"ok"> {
      if (busy) { ebusy = true; return Promise.reject(new Error("PJSIP_EBUSY")); }
      busy = true;
      attempts += 1;
      return new Promise((resolve) => {
        setTimeout(() => {            // 407 challenge
          setTimeout(() => {          // 200 OK après ré-envoi authentifié
            busy = false;
            resolve("ok");
          }, 400);
        }, challengeDelayMs);
      });
    },
  };
}

async function registerWithWatchdog(reg: ReturnType<typeof makeRegistrar>, watchdogMs = WATCHDOG_MS): Promise<RegisterResult> {
  let timer: any;
  const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), watchdogMs); });
  const res = await Promise.race([reg.register().catch((e) => e as Error), timeout]);
  clearTimeout(timer);
  if (res === "timeout") return { ok: false, reason: "watchdog", attempts: reg.attempts };
  if (res instanceof Error) return { ok: false, reason: res.message, attempts: reg.attempts };
  return { ok: true, attempts: reg.attempts };
}

describe("REGISTER TLS avec latence simulée", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([13_000, 16_500, 20_000])("aboutit quand le 407 arrive à %i ms", async (delay) => {
    const reg = makeRegistrar(delay);
    const p = registerWithWatchdog(reg);
    await vi.advanceTimersByTimeAsync(delay + 1000);
    const out = await p;
    expect(out.ok).toBe(true);
    expect(reg.ebusy).toBe(false);
    expect(out.attempts).toBe(1);
  });

  it("ne déclenche pas de second REGISTER concurrent (pas de PJSIP_EBUSY)", async () => {
    const reg = makeRegistrar(18_000);
    const a = registerWithWatchdog(reg);
    // Une seconde demande arrive pendant le challenge : elle doit être
    // sérialisée par l'appelant, jamais envoyée en parallèle.
    const guarded = async () => (reg.attempts > 0 ? { ok: true, skipped: true } : registerWithWatchdog(reg));
    const b = await guarded();
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await a).ok).toBe(true);
    expect((b as any).skipped).toBe(true);
    expect(reg.ebusy).toBe(false);
    expect(reg.attempts).toBe(1);
  });

  it("le watchdog 45 s ne coupe pas un 407 tardif mais coupe un serveur muet", async () => {
    const slow = makeRegistrar(44_000);
    const pSlow = registerWithWatchdog(slow);
    await vi.advanceTimersByTimeAsync(45_500);
    expect((await pSlow).ok).toBe(true);

    const dead = makeRegistrar(120_000);
    const pDead = registerWithWatchdog(dead);
    await vi.advanceTimersByTimeAsync(46_000);
    const out = await pDead;
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("watchdog");
  });
});
