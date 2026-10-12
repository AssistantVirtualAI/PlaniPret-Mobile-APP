/**
 * P2R intégré : vrai hook usePullToRefresh + vrai registre, gestes touch sur
 * l'owner de scroll. Le shell reproduit la logique handlePull de
 * PlanipretMobile (génération du registre libère le spinner).
 * JSDOM : contrat DOM/événements seulement, pas l'inertie iOS/Android.
 */
import { describe, it, expect, vi } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { createRefreshRegistry, type RefreshFn } from "@/lib/planipret/refreshRegistry";

function Shell({ registry, children }: { registry: ReturnType<typeof createRefreshRegistry>; children: React.ReactNode }) {
  const handlePull = async () => {
    const fn = registry.current(); if (!fn) return;
    const g = registry.generation;
    await new Promise<void>((resolve) => {
      const off = registry.subscribe(() => { if (registry.generation !== g) { off(); resolve(); } });
      Promise.resolve().then(fn).catch(() => {}).finally(() => { off(); resolve(); });
    });
  };
  const { ref, refreshing } = usePullToRefresh(handlePull, 70, () => registry.current() != null);
  return <div ref={ref as any} data-testid="owner" style={{ overflowY: "auto" }}>{refreshing && <span data-testid="spin" />}{children}</div>;
}
function Panel({ registry, active, fn }: { registry: ReturnType<typeof createRefreshRegistry>; active: boolean; fn?: RefreshFn }) {
  useEffect(() => (active && fn ? registry.register(fn) : undefined), [active, fn, registry]);
  return null;
}
const t = (y: number) => ({ touches: [{ clientY: y }] });
async function pull(el: HTMLElement, opts: { multi?: boolean; cancel?: boolean } = {}) {
  await act(async () => {
    fireEvent.touchStart(el, opts.multi ? { touches: [{ clientY: 0 }, { clientY: 5 }] } : t(0));
    fireEvent.touchMove(el, t(120));
    await new Promise((r) => setTimeout(r, 20));
    if (opts.cancel) fireEvent.touchCancel(el); else fireEvent.touchEnd(el);
  });
}
function deferred() { let resolve!: () => void; const p = new Promise<void>((r) => { resolve = r; }); return { p, resolve }; }

function Messages({ registry, sub, sms }: any) {
  return <Shell registry={registry}>
    <Panel registry={registry} active={sub === "sms"} fn={sms} />
    {/* team / teams365 / emails / history : aucun owner */}
  </Shell>;
}

describe("Messages P2R intégré", () => {
  it("SMS : un geste = un seul load", async () => {
    const r = createRefreshRegistry(); const sms = vi.fn(async () => {});
    const { getByTestId } = render(<Messages registry={r} sub="sms" sms={sms} />);
    await pull(getByTestId("owner")); expect(sms).toHaveBeenCalledTimes(1);
  });
  it.each(["team", "teams365", "emails", "history"])("%s : aucun refresh, aucun spinner", async (sub) => {
    const r = createRefreshRegistry(); const sms = vi.fn();
    const { getByTestId, queryByTestId } = render(<Messages registry={r} sub={sub} sms={sms} />);
    await pull(getByTestId("owner")); expect(sms).not.toHaveBeenCalled(); expect(queryByTestId("spin")).toBeNull();
  });
  it("SMS → Teams pendant une promesse lente : spinner libéré, retour SMS = SMS seul", async () => {
    const r = createRefreshRegistry(); const d = deferred(); const sms = vi.fn(() => d.p);
    const { getByTestId, queryByTestId, rerender } = render(<Messages registry={r} sub="sms" sms={sms} />);
    await pull(getByTestId("owner")); expect(queryByTestId("spin")).not.toBeNull();
    await act(async () => { rerender(<Messages registry={r} sub="team" sms={sms} />); });
    expect(queryByTestId("spin")).toBeNull(); expect(r.size).toBe(0);
    await act(async () => { rerender(<Messages registry={r} sub="sms" sms={sms} />); });
    expect(r.size).toBe(1); d.resolve();
  });
  it("multi-touch, touchcancel, scroller enfant et feuille ouverte ignorés", async () => {
    const r = createRefreshRegistry(); const sms = vi.fn(async () => {});
    const { getByTestId } = render(<Shell registry={r}><Panel registry={r} active fn={sms} />
      <div data-testid="sheet" data-pp-sheet /></Shell>);
    await pull(getByTestId("owner"), { multi: true });
    await pull(getByTestId("owner"), { cancel: true });
    await act(async () => { fireEvent.touchStart(getByTestId("sheet"), t(0)); fireEvent.touchMove(getByTestId("sheet"), t(120)); fireEvent.touchEnd(getByTestId("sheet")); });
    expect(sms).not.toHaveBeenCalled();
  });
});

function Calls({ registry, tab, load, rec, vm }: any) {
  return <Shell registry={registry}>
    <Panel registry={registry} active={tab === "recents" || tab === "missed"} fn={load} />
    <Panel registry={registry} active={tab === "recordings"} fn={rec} />
    <Panel registry={registry} active={tab === "voicemails"} fn={vm} />
  </Shell>;
}
describe("Appels P2R intégré", () => {
  it.each([["recents", "load"], ["missed", "load"], ["recordings", "rec"], ["voicemails", "vm"]])("%s → %s seulement", async (tab, who) => {
    const r = createRefreshRegistry(); const f = { load: vi.fn(async () => {}), rec: vi.fn(async () => {}), vm: vi.fn(async () => {}) };
    const { getByTestId } = render(<Calls registry={r} tab={tab} {...f} />);
    await pull(getByTestId("owner"));
    for (const k of Object.keys(f)) expect((f as any)[k]).toHaveBeenCalledTimes(k === who ? 1 : 0);
  });
  it("double geste pendant refresh = une seule vague", async () => {
    const r = createRefreshRegistry(); const d = deferred(); const load = vi.fn(() => d.p);
    const { getByTestId } = render(<Calls registry={r} tab="recents" load={load} rec={vi.fn()} vm={vi.fn()} />);
    await pull(getByTestId("owner")); await pull(getByTestId("owner"));
    expect(load).toHaveBeenCalledTimes(1); await act(async () => { d.resolve(); });
  });
  it("changement d'onglet pendant refresh : spinner libéré", async () => {
    const r = createRefreshRegistry(); const d = deferred(); const load = vi.fn(() => d.p);
    const { getByTestId, queryByTestId, rerender } = render(<Calls registry={r} tab="recents" load={load} rec={vi.fn()} vm={vi.fn()} />);
    await pull(getByTestId("owner"));
    await act(async () => { rerender(<Calls registry={r} tab="recordings" load={load} rec={vi.fn()} vm={vi.fn()} />); });
    expect(queryByTestId("spin")).toBeNull(); d.resolve();
  });
});
