/** Contre-audit Marc — A (Marketing handoff), B (recurrence preserved end-to-end), C (Messages sheets vs pull-to-refresh). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })),
  native: false,
  nativeExternal: false,
  externalOpen: vi.fn(),
  browserClose: vi.fn(),
  browserOpen: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: h.getSession, refreshSession: vi.fn() }, functions: { invoke: h.invoke } },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => h.native,
    isPluginAvailable: (name: string) => name === "PpPortalExternal" && h.nativeExternal,
  },
  registerPlugin: () => ({ open: h.externalOpen }),
}));
vi.mock("@capacitor/browser", () => ({ Browser: { close: h.browserClose, open: h.browserOpen } }));

import { validPortalHandoffUrl } from "@/lib/planipret/portalHandoffUrl";
import { openBrokerPortal } from "@/lib/planipret/openBrokerPortal";
import { normalizeTask as appNormalize } from "@/lib/planipret/shared/planipretTasks";
import { normalizeTask as edgeNormalize, normalizeRecurrence } from "../../../supabase/functions/_shared/planipret-tasks";
import { recurrenceLabel } from "@/lib/planipret/recurrenceLabel";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const P = "https://courtierai.planipret.com";
const src = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("A — Plus → Marketing portal handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.native = false;
    h.nativeExternal = false;
    h.externalOpen.mockResolvedValue({ ok: true });
    h.browserClose.mockResolvedValue({});
    h.browserOpen.mockResolvedValue({});
  });
  it("accepts broker root, broker sub-paths incl. marketing, admin and legacy", () => {
    for (const p of ["/planipret/broker", "/planipret/broker/marketing", "/planipret/admin", "/planipret/admin/overview", "/planipret/portal-handoff"]) {
      const u = `${P}${p}?th=x&em=y`;
      expect(validPortalHandoffUrl(u), p).toBe(u);
    }
    expect(validPortalHandoffUrl("https://avastatistic.ca/planipret/broker/marketing?th=x&em=y")).not.toBeNull();
  });
  it("rejects foreign origins, non-HTTPS, look-alike paths and missing th/em", () => {
    for (const u of [
      "https://evil.example/planipret/broker/marketing?th=x&em=y",
      "http://courtierai.planipret.com/planipret/broker?th=x&em=y",
      "capacitor://localhost/planipret/broker?th=x&em=y",
      `${P}/planipret/broker-elevated?th=x&em=y`,
      `${P}/planipret/brokerage?th=x&em=y`,
      `${P}/planipret/administer?th=x&em=y`,
      `${P}/planipret?th=x&em=y`,
      `${P}/other/planipret/broker?th=x&em=y`,
      `${P}/planipret/broker/marketing?th=x`,
      `${P}/planipret/broker/marketing?em=y`,
    ]) expect(validPortalHandoffUrl(u), u).toBeNull();
  });
  it("openBrokerPortal('/planipret/broker/marketing') opens the returned URL (mocked)", async () => {
    const url = `${P}/planipret/broker/marketing?th=abc&em=b%40x.ca`;
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url, portal: "broker" }, error: null });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const r = await openBrokerPortal("/planipret/broker/marketing");
    expect(r).toEqual({ ok: true, portal: "broker" });
    expect(h.invoke).toHaveBeenCalledWith("pp-portal-handoff", expect.objectContaining({ body: { path: "/planipret/broker/marketing" } }));
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
  it("native iOS opens Marketing with the dedicated system-browser plugin", async () => {
    const url = `${P}/planipret/broker/marketing?th=abc&em=b%40x.ca`;
    h.native = true;
    h.nativeExternal = true;
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url, portal: "broker" }, error: null });

    const r = await openBrokerPortal("/planipret/broker/marketing");

    expect(r).toEqual({ ok: true, portal: "broker" });
    expect(h.externalOpen).toHaveBeenCalledWith({ url });
    expect(h.browserClose).not.toHaveBeenCalled();
    expect(h.browserOpen).not.toHaveBeenCalled();
  });
  it("uses Browser only for a legacy native build that lacks the dedicated plugin", async () => {
    const url = `${P}/planipret/broker?th=abc&em=b%40x.ca`;
    h.native = true;
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url, portal: "broker" }, error: null });

    await expect(openBrokerPortal()).resolves.toEqual({ ok: true, portal: "broker" });
    expect(h.externalOpen).not.toHaveBeenCalled();
    expect(h.browserClose).toHaveBeenCalledTimes(1);
    expect(h.browserOpen).toHaveBeenCalledWith({ url, presentationStyle: "fullscreen" });
  });
  it("does not report success when the system browser rejects the verified URL", async () => {
    const url = `${P}/planipret/broker/marketing?th=abc&em=b%40x.ca`;
    h.native = true;
    h.nativeExternal = true;
    h.externalOpen.mockRejectedValueOnce(new Error("system_browser_unavailable"));
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url, portal: "broker" }, error: null });

    await expect(openBrokerPortal("/planipret/broker/marketing")).resolves.toEqual({
      ok: false,
      error: "Ouverture du portail impossible.",
    });
  });
  it("invalid returned URL is refused and nothing is opened", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, url: "https://evil.example/planipret/broker?th=x&em=y" }, error: null });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const r = await openBrokerPortal("/planipret/broker/marketing");
    expect(r.ok).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
  it("portal copy has the same validator", () => {
    expect(src("lib/planipret/portalHandoffUrl.ts")).toBe(readFileSync(resolve(__dirname, "../../lib/planipret/portalHandoffUrl.ts"), "utf8"));
  });
});

describe("B — recurrence interval preserved Edge → app → badge", () => {
  for (const [name, norm] of [["edge", edgeNormalize], ["app", appNormalize]] as const) {
    it(`${name}: direct Maestro fields keep 2/week`, () => {
      const t = norm({ id: "1", is_recurring: 1, recurring_value: 2, recurring_pattern: "week" } as any);
      expect([t.is_recurring, t.recurring_value, t.recurring_pattern]).toEqual([true, 2, "week"]);
      expect(recurrenceLabel(t, "fr")).toBe("Toutes les 2 semaines");
    });
    it(`${name}: nested recurrence keeps 2/week`, () => {
      const t = norm({ id: "1", recurrence: { value: 2, pattern: "week" } } as any);
      expect([t.is_recurring, t.recurring_value, t.recurring_pattern]).toEqual([true, 2, "week"]);
      expect(recurrenceLabel(t, "en")).toBe("Every 2 weeks");
    });
    it(`${name}: 1/month → Chaque mois`, () => {
      expect(recurrenceLabel(norm({ id: "1", is_recurring: "1", recurring_value: "1", recurring_pattern: "Month" } as any), "fr")).toBe("Chaque mois");
    });
    it(`${name}: missing/invalid pattern, 0, negative or decimal → no badge`, () => {
      for (const raw of [
        { is_recurring: 1, recurring_value: 2 },
        { is_recurring: 1, recurring_value: 2, recurring_pattern: "fortnight" },
        { is_recurring: 1, recurring_value: 0, recurring_pattern: "week" },
        { is_recurring: 1, recurring_value: -1, recurring_pattern: "week" },
        { is_recurring: 1, recurring_value: 1.5, recurring_pattern: "week" },
        { is_recurring: 1, recurring_pattern: "week" },
        { recurrence: { value: 0, pattern: "week" } },
        { recurrence: { value: 2, pattern: "bogus" } },
      ]) expect(recurrenceLabel(norm({ id: "1", ...raw } as any), "fr"), JSON.stringify(raw)).toBeNull();
    });
  }
  it("edge API representation serializes recurring_value", () => {
    const json = JSON.parse(JSON.stringify(edgeNormalize({ id: "9", recurrence: { value: 3, pattern: "day" } } as any)));
    expect(json).toMatchObject({ is_recurring: true, recurring_value: 3, recurring_pattern: "day" });
    expect(normalizeRecurrence({})).toEqual({ is_recurring: false, recurring_value: null, recurring_pattern: null });
  });
});

const touch = (el: Element, type: string, ys: number[]) => {
  const e: any = new Event(type, { bubbles: true });
  e.touches = ys.map((clientY) => ({ clientY }));
  el.dispatchEvent(e);
};
function Page({ onRefresh, sheet }: { onRefresh: () => void; sheet: string }) {
  const { ref } = usePullToRefresh(onRefresh, 70);
  return (
    <div ref={ref} data-testid="owner">
      <div role="dialog" aria-modal="true" data-pp-sheet="" data-testid={sheet}>
        <div data-scroll-owner={sheet} data-testid={`${sheet}-content`}>contenu</div>
      </div>
    </div>
  );
}

describe("C — Messages sheets are excluded from page pull-to-refresh", () => {
  const msg = src("pages/planipret/mobile/MMessages.tsx");
  const sheets: [string, string][] = [["new-sms-sheet", "new-sms"], ["email-detail-sheet", "email-detail"], ["email-compose-sheet", "email-compose"]];
  it("each of the three sheets carries role=dialog, aria-modal and data-pp-sheet", () => {
    for (const [id] of sheets) {
      const line = msg.split("\n").find((l) => l.includes(`data-testid="${id}"`))!;
      expect(line, id).toContain('role="dialog" aria-modal="true" data-pp-sheet');
    }
  });
  it("each sheet keeps one contained vertical scroll zone; no bare 100vh height", () => {
    for (const [, owner] of sheets) {
      const i = msg.indexOf(`data-scroll-owner="${owner}"`);
      expect(i, owner).toBeGreaterThan(0);
      const seg = msg.slice(i, i + 300);
      for (const k of ["flex-1", "overflow-y-auto", "overscroll-contain", "minHeight: 0", "WebkitOverflowScrolling"]) expect(seg, `${owner} ${k}`).toContain(k);
    }
    expect(msg).not.toMatch(/height: "calc\(100vh /);
  });
  for (const [id] of sheets) {
    it(`${id}: gestures inside never refresh the page (single, double, multitouch, cancel)`, async () => {
      const fn = vi.fn();
      const { getByTestId } = render(<Page onRefresh={fn} sheet={id} />);
      const inner = getByTestId(`${id}-content`);
      for (let i = 0; i < 2; i++) {
        touch(inner, "touchstart", [0]); touch(inner, "touchmove", [150]);
        await act(async () => { touch(inner, "touchend", []); });
      }
      touch(inner, "touchstart", [0, 10]); touch(inner, "touchmove", [150, 160]);
      await act(async () => { touch(inner, "touchend", []); });
      touch(inner, "touchstart", [0]); touch(inner, "touchmove", [150]); touch(inner, "touchcancel", []);
      await act(async () => { touch(inner, "touchend", []); });
      expect(fn).not.toHaveBeenCalled();
      const owner = getByTestId("owner");
      touch(owner, "touchstart", [0]); touch(owner, "touchmove", [150]);
      await act(async () => { touch(owner, "touchend", []); });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  }
});
