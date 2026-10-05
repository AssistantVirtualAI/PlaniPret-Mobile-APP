import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "jwt.SECRET.part" } } })),
      refreshSession: vi.fn(async () => ({ data: { session: null } })),
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
  registerPlugin: () => ({ open: vi.fn() }),
}));

import { openBrokerPortal } from "./openBrokerPortal";

const CID = "3f2b8c1e-1234-4abc-9def-0123456789ab";
const SENSITIVE = ["jwt.SECRET.part", "@", "http", "th=", "magic", "provider exploded"];
const noLeak = (s: string) => SENSITIVE.forEach((x) => expect(s).not.toContain(x));

describe("openBrokerPortal — failure display", () => {
  beforeEach(() => { invoke.mockReset(); localStorage.setItem("mplanipret-lang", "fr"); });

  it.each(["handoff_stamp_failed", "link_failed", "handoff_failed"])("%s → code + tracking id", async (code) => {
    invoke.mockResolvedValue({ data: { ok: false, error: code, correlation_id: CID }, error: null });
    const r = await openBrokerPortal();
    expect(r.ok).toBe(false);
    const msg = (r as { error: string }).error;
    expect(msg).toContain(`(${code})`);
    expect(msg).toContain(`No de suivi : ${CID}`);
    expect(msg).not.toContain("Lien du portail invalide");
    noLeak(msg);
  });

  it("error without tracking id, raw provider text never shown", async () => {
    invoke.mockResolvedValue({ data: { ok: false, error: "provider exploded: user@x.com" }, error: null });
    const msg = ((await openBrokerPortal()) as { error: string }).error;
    expect(msg).toBe("Lien du portail invalide. Réessayez.");
    noLeak(msg);
  });

  it("English when the app is in English", async () => {
    localStorage.setItem("mplanipret-lang", "en");
    invoke.mockResolvedValue({ data: { ok: false, error: "link_failed", correlation_id: CID }, error: null });
    const msg = ((await openBrokerPortal()) as { error: string }).error;
    expect(msg).toContain("Tracking no:");
    expect(msg).toContain("(link_failed)");
  });

  it("success unchanged: opens the validated URL", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const url = "https://avastatistic.ca/planipret/portal-handoff?th=abc&em=a%40b.c&to=%2Fplanipret%2Fbroker";
    invoke.mockResolvedValue({ data: { ok: true, url, portal: "broker" }, error: null });
    expect(await openBrokerPortal()).toEqual({ ok: true, portal: "broker" });
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
  });
});
