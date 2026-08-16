// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: any[]) => invoke(...a) } },
}));

/**
 * Non-récurrence sync Contacts : TTL 60 s + anti-concurrence (dedup in-flight).
 * Un appel réseau par cycle => plus de tempête de logs
 * ("QUARANTINED DUE TO HIGH LOGGING VOLUME").
 */
describe("ppContactsCache — TTL et anti-concurrence", () => {
  let mod: typeof import("../ppContactsCache");

  beforeEach(async () => {
    vi.resetModules();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { directory: [{ id: "1" }] }, error: null });
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mod = await import("../ppContactsCache");
  });
  afterEach(() => vi.useRealTimers());

  it("dédoublonne 20 appels parallèles en une seule requête", async () => {
    const all = await Promise.all(Array.from({ length: 20 }, () => mod.getPpContacts("directory")));
    expect(invoke).toHaveBeenCalledTimes(1);
    all.forEach((r) => expect(r).toEqual([{ id: "1" }]));
  });

  it("sert le cache pendant le TTL puis re-fetch après expiration", async () => {
    await mod.getPpContacts("directory");
    vi.setSystemTime(Date.now() + 30_000);
    await mod.getPpContacts("directory");
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    await mod.getPpContacts("directory");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("5 cycles de sync => 5 requêtes max (pas de tempête de logs)", async () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      await Promise.all(Array.from({ length: 8 }, () => mod.getPpContacts("directory")));
      vi.setSystemTime(Date.now() + 61_000);
    }
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("libère le verrou in-flight après une erreur (pas de blocage définitif)", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(mod.getPpContacts("directory")).rejects.toBeTruthy();
    invoke.mockResolvedValue({ data: { directory: [{ id: "2" }] }, error: null });
    await expect(mod.getPpContacts("directory")).resolves.toEqual([{ id: "2" }]);
  });

  it("peek synchrone lit le cache disque sans requête", async () => {
    await mod.getPpContacts("directory");
    vi.resetModules();
    const fresh = await import("../ppContactsCache");
    expect(fresh.peekPpContacts("directory")).toEqual([{ id: "1" }]);
  });
});
