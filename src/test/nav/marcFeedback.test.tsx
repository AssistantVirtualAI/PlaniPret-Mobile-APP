/** Feedbacks Marc Alexandre — A (DND), B (scroll owners), C (recurrence), D (Marketing). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, act, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const h = vi.hoisted(() => {
  const state: { result: any; deferred: null | ((v: any) => void) } = { result: { error: null }, deferred: null };
  const update = vi.fn(() => ({ eq: vi.fn(() => (state.deferred ? new Promise((r) => { state.deferred = r; }) : Promise.resolve(state.result))) }));
  return { state, update };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ update: h.update }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
}));

import { useDndToggle } from "@/lib/planipret/useDndToggle";
import { recurrenceLabel } from "@/lib/planipret/recurrenceLabel";
import MaestroTaskRow from "@/components/planipret/mobile/MaestroTaskRow";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const src = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("A — DND toggle never shows a false success", () => {
  beforeEach(() => { vi.clearAllMocks(); h.state.result = { error: null }; h.state.deferred = null; });
  const setup = () => {
    const reload = vi.fn(async () => {});
    const onSuccess = vi.fn(); const onError = vi.fn();
    const hook = renderHook(() => useDndToggle({ user_id: "u1" }, reload, { onSuccess, onError }));
    return { ...hook, reload, onSuccess, onError };
  };

  it("success: one update, profile reload, success toast", async () => {
    const s = setup();
    await act(async () => { await s.result.current.toggle(true); });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ dnd_enabled: true });
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.onSuccess).toHaveBeenCalledWith(true);
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.result.current.pending).toBeNull();
    expect(s.result.current.busy).toBe(false);
  });

  it("Supabase error: error toast, no success, no reload, original value restored", async () => {
    h.state.result = { error: { message: "denied" } };
    const s = setup();
    await act(async () => { await s.result.current.toggle(true); });
    expect(s.onError).toHaveBeenCalledTimes(1);
    expect(s.onSuccess).not.toHaveBeenCalled();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.result.current.pending).toBeNull(); // confirmed profile value shown again
    expect(s.result.current.busy).toBe(false); // no stuck spinner/toggle
  });

  it("double tap: a single request", async () => {
    h.state.deferred = () => {};
    const s = setup();
    let p1!: Promise<void>;
    act(() => { p1 = s.result.current.toggle(true); });
    expect(s.result.current.busy).toBe(true);
    await act(async () => { await s.result.current.toggle(true); });
    expect(h.update).toHaveBeenCalledTimes(1);
    await act(async () => { h.state.deferred!({ error: null }); await p1; });
    expect(s.result.current.busy).toBe(false);
  });

  it("MMore uses the hook (confirmed value, busy-disabled switch) and the DND sheet checks errors", () => {
    const s = src("pages/planipret/mobile/MMore.tsx");
    expect(s).toContain('<Toggle testId="dnd-toggle" on={dndShown} busy={dndBusy} onChange={toggleDnd} />');
    expect(s).toContain("const dndShown = dndPending ?? !!profile?.dnd_enabled;");
    expect(s).toContain("disabled={busy}");
    expect(s).not.toMatch(/update\(\{ dnd_enabled: v \}\)\.eq\("user_id", profile\.user_id\);\n\s*await reloadProfile/);
    const sheet = s.slice(s.indexOf("function DndSheet"));
    expect(sheet).toContain('if (error) { toast.error(t("common.failed")); return; }');
  });
});

describe("B — one vertical scroll owner per screen", () => {
  const msgs = src("pages/planipret/mobile/MMessages.tsx");
  it("Messages tabs live in a non-scrolling page container (overflow-hidden)", () => {
    expect(msgs).toContain('<div className="flex-1 overflow-hidden">\n        {visited.has("sms")');
  });
  it("Emails list has no fragile fixed height and owns its scroll with safe-area", () => {
    expect(msgs).not.toContain('calc(100dvh - 242px)');
    const line = msgs.split("\n").find((l) => l.includes('data-scroll-owner="emails"'))!;
    for (const c of ["h-full", "min-h-0", "overflow-y-auto", "overscroll-contain", "safe-area-inset-bottom"]) expect(line).toContain(c);
  });
  it("SMS thread, team chat and Teams thread scrollers are contained", () => {
    expect(msgs).toContain('className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-2"');
    expect(msgs).toContain('<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-2"');
  });
  it("Email history and recording segments are contained", () => {
    expect(src("components/planipret/mobile/EmailHistoryList.tsx")).toContain('data-scroll-owner="email-history" className="flex-1 min-h-0 overflow-y-auto overscroll-contain');
    expect(src("components/planipret/mobile/recordings/RecordingsList.tsx")).toContain("max-h-72 overflow-y-auto overscroll-contain");
  });

  const touch = (el: Element, type: string, ys: number[]) => {
    const e: any = new Event(type, { bubbles: true }); e.touches = ys.map((clientY) => ({ clientY })); el.dispatchEvent(e);
  };
  function Owner({ onRefresh }: { onRefresh: () => void }) {
    const { ref } = usePullToRefresh(onRefresh, 70);
    return (
      <div ref={ref} data-testid="owner">
        <div data-testid="inner" style={{ overflowY: "auto" }} />
        <div role="dialog" data-testid="sheet" />
      </div>
    );
  }
  for (const vp of [{ name: "iPhone SE", w: 375, h: 667 }, { name: "Android compact", w: 360, h: 640 }]) {
    it(`${vp.name}: two-finger, cancelled, inner-list and sheet gestures never trigger global pull-to-refresh`, async () => {
      Object.assign(window, { innerWidth: vp.w, innerHeight: vp.h });
      const onRefresh = vi.fn();
      render(<Owner onRefresh={onRefresh} />);
      const owner = screen.getByTestId("owner");
      const inner = screen.getByTestId("inner");
      Object.defineProperty(inner, "scrollHeight", { value: 900 }); Object.defineProperty(inner, "clientHeight", { value: 300 });
      await act(async () => { touch(owner, "touchstart", [10, 20]); touch(owner, "touchmove", [200, 210]); touch(owner, "touchend", []); });
      await act(async () => { touch(owner, "touchstart", [10]); touch(owner, "touchmove", [200]); touch(owner, "touchcancel", []); touch(owner, "touchend", []); });
      await act(async () => { touch(inner, "touchstart", [10]); touch(inner, "touchmove", [200]); touch(inner, "touchend", []); });
      await act(async () => { touch(screen.getByTestId("sheet"), "touchstart", [10]); touch(owner, "touchmove", [200]); touch(owner, "touchend", []); });
      expect(onRefresh).not.toHaveBeenCalled();
      await act(async () => { touch(owner, "touchstart", [10]); touch(owner, "touchmove", [200]); touch(owner, "touchend", []); });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  }
});

describe("C — recurring tasks show their frequency", () => {
  const cases: [number, string, string, string][] = [
    [1, "day", "Chaque jour", "Every day"],
    [2, "week", "Toutes les 2 semaines", "Every 2 weeks"],
    [1, "month", "Chaque mois", "Every month"],
    [1, "year", "Chaque année", "Every year"],
  ];
  for (const [n, p, fr, en] of cases) {
    it(`${n} + ${p} → ${fr} / ${en}`, () => {
      expect(recurrenceLabel({ is_recurring: true, recurring_value: n, recurring_pattern: p }, "fr")).toBe(fr);
      expect(recurrenceLabel({ is_recurring: true, recurring_value: n, recurring_pattern: p }, "en")).toBe(en);
    });
  }
  it("never invents a frequency", () => {
    expect(recurrenceLabel({ is_recurring: false, recurring_value: 1, recurring_pattern: "day" }, "fr")).toBeNull();
    expect(recurrenceLabel({ is_recurring: true, recurring_pattern: null }, "fr")).toBeNull();
    expect(recurrenceLabel({ is_recurring: true, recurring_value: 1, recurring_pattern: "hourly" }, "fr")).toBeNull();
    expect(recurrenceLabel({ is_recurring: true, recurring_value: 0, recurring_pattern: "day" }, "fr")).toBeNull();
  });

  const base: any = { id: "t1", notes: "", description: null, due_at: null, status: null, type: null, xid: null, target_name: null,
    is_recurring: false, recurring_pattern: null, created_by_ava: false, assignee_ids: [], assignment_source: "none" };
  for (const [n, p, fr] of cases) {
    it(`row renders badge for ${n} + ${p}`, () => {
      render(<MaestroTaskRow task={{ ...base, is_recurring: true, recurring_value: n, recurring_pattern: p }} lang="fr" expanded={false} />);
      expect(screen.getByTestId("task-recurrence-t1").textContent).toContain(fr);
    });
  }
  it("non-recurring row renders no badge", () => {
    render(<MaestroTaskRow task={base} lang="fr" expanded={false} />);
    expect(screen.queryByTestId("task-recurrence-t1")).toBeNull();
  });
});

describe("D — Marketing wording and destination", () => {
  it("no forbidden French synonym in Planiprêt mobile sources", () => {
    const { execSync } = require("node:child_process");
    const word = "Commerciali" + "sation";
    const dirs = [resolve(__dirname, "../..")];
    const out = execSync(`grep -rl "${word}" ${dirs.map((d) => `"${d}"`).join(" ")} --include=*.ts --include=*.tsx --include=*.json || true`, { encoding: "utf8" });
    expect(out.trim()).toBe("");
  });
  it("Plus menu has a Marketing row opening the official broker portal route via handoff", () => {
    const s = src("pages/planipret/mobile/MMore.tsx");
    expect(s).toContain('export const MARKETING_PORTAL_PATH = "/planipret/broker/marketing";');
    expect(s).toContain('label="Marketing"');
    expect(s).toContain("openBrokerPortal(MARKETING_PORTAL_PATH)");
  });
});
