// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: any[]) => invoke(...a) },
    auth: {
      getSession: (...a: any[]) => getSession(...a),
      onAuthStateChange: (...a: any[]) => onAuthStateChange(...a),
    },
  },
}));

/**
 * Non-récurrence sync Contacts : TTL 5 min + anti-concurrence (dedup in-flight).
 * Un appel réseau par cycle => plus de tempête de logs
 * ("QUARANTINED DUE TO HIGH LOGGING VOLUME").
 */
describe("ppContactsCache — TTL et anti-concurrence", () => {
  let mod: typeof import("../ppContactsCache");

  beforeEach(async () => {
    vi.resetModules();
    invoke.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockClear();
    getSession.mockResolvedValue({ data: { session: { user: { id: "broker-a" } } } });
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
    vi.setSystemTime(Date.now() + 4 * 60_000);
    await mod.getPpContacts("directory");
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    await mod.getPpContacts("directory");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("5 cycles de sync => 5 requêtes max (pas de tempête de logs)", async () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      await Promise.all(Array.from({ length: 8 }, () => mod.getPpContacts("directory")));
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    }
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("libère le verrou in-flight après une erreur (pas de blocage définitif)", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(mod.getPpContacts("directory")).rejects.toBeTruthy();
    invoke.mockResolvedValue({ data: { directory: [{ id: "2" }] }, error: null });
    await expect(mod.getPpContacts("directory")).resolves.toEqual([{ id: "2" }]);
  });

  it("ne sert pas le cache Maestro persistant avant vérification de la session", async () => {
    await mod.getPpContacts("directory");
    vi.resetModules();
    const fresh = await import("../ppContactsCache");
    expect(fresh.peekPpContacts("maestro_clients")).toBeNull();

    invoke.mockResolvedValue({
      data: { success: true, maestro_user_id: "maestro-broker-1", clients: [{ maestro_client_id: "client-1" }], total: 1 },
      error: null,
    });
    await expect(fresh.getPpContacts("maestro_clients")).resolves.toEqual([{ maestro_client_id: "client-1" }]);
  });

  it("charge toutes les pages Maestro sans limiter la liste à 500 clients", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ maestro_client_id: `client-${index}` }));
    const secondPage = Array.from({ length: 150 }, (_, index) => ({ maestro_client_id: `client-${500 + index}` }));
    invoke.mockImplementation((_functionName: string, { body }: any) => {
      const offset = Number(body?.payload?.offset ?? 0);
      if (offset === 0) {
        return Promise.resolve({
          data: { success: true, maestro_user_id: "maestro-broker-1", clients: firstPage, total: 650 },
          error: null,
        });
      }
      if (offset === 500) {
        return Promise.resolve({
          data: { success: true, maestro_user_id: "maestro-broker-1", clients: secondPage, total: 650 },
          error: null,
        });
      }
      return Promise.resolve({ data: { success: true, maestro_user_id: "maestro-broker-1", clients: [], total: 650 }, error: null });
    });

    const clients = await mod.getPpContacts("maestro_clients", { force: true, limit: 500 });

    expect(clients).toHaveLength(650);
    expect(new Set(clients.map((row: any) => row.maestro_client_id)).size).toBe(650);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map(([, options]) => options.body.payload.offset)).toEqual([0, 500]);
  });

  it("propage un refus Maestro au lieu de présenter une liste vide", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "maestro_unavailable" }, error: null });

    await expect(mod.getPpContacts("maestro_clients", { force: true })).rejects.toThrow("maestro_unavailable");
  });

  it("ne réutilise jamais le cache Maestro d’un autre courtier sur un téléphone partagé", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, maestro_user_id: "maestro-a", clients: [{ maestro_client_id: "client-a" }], total: 1 },
      error: null,
    });
    await expect(mod.getPpContacts("maestro_clients", { force: true })).resolves.toEqual([{ maestro_client_id: "client-a" }]);

    getSession.mockResolvedValue({ data: { session: { user: { id: "broker-b" } } } });
    invoke.mockResolvedValue({
      data: { success: true, maestro_user_id: "maestro-b", clients: [{ maestro_client_id: "client-b" }], total: 1 },
      error: null,
    });

    await expect(mod.getPpContacts("maestro_clients")).resolves.toEqual([{ maestro_client_id: "client-b" }]);
    expect(invoke).toHaveBeenCalledWith("maestro-actions", expect.objectContaining({
      body: expect.objectContaining({ action: "list_clients" }),
    }));
  });
});
