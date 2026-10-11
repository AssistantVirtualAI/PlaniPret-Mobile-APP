/**
 * Callback-ref lifecycle: listeners attach once the element exists (even if it
 * appears after a loading state), detach on unmount / element replacement, and
 * are never doubled across re-renders.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { usePullToRefresh } from "./usePullToRefresh";

const EVENTS = ["touchstart", "touchmove", "touchend", "touchcancel"];

function spyEl(el: HTMLElement) {
  const live = new Map<string, Set<unknown>>();
  const add = el.addEventListener.bind(el);
  const rem = el.removeEventListener.bind(el);
  el.addEventListener = ((t: string, f: any, o?: any) => { (live.get(t) ?? live.set(t, new Set()).get(t)!).add(f); add(t, f, o); }) as any;
  el.removeEventListener = ((t: string, f: any, o?: any) => { live.get(t)?.delete(f); rem(t, f, o); }) as any;
  return (t: string) => live.get(t)?.size ?? 0;
}

const spies = new Map<string, (t: string) => number>();
function Harness({ loading, which, tick }: { loading: boolean; which: string; tick: number }) {
  const { ref } = usePullToRefresh(() => {}, 70);
  if (loading) return <div>loading</div>;
  return (
    <div data-tick={tick}>
      <div
        key={which}
        ref={(n) => { if (n && !spies.has(which)) spies.set(which, spyEl(n)); ref(n as HTMLDivElement); }}
      />
    </div>
  );
}

describe("usePullToRefresh — callback ref", () => {
  it("attaches after the scroll owner mounts late, once, and detaches on replace/unmount", () => {
    spies.clear();
    const r = render(<Harness loading which="a" tick={0} />);
    expect(spies.size).toBe(0);

    r.rerender(<Harness loading={false} which="a" tick={0} />);
    const a = spies.get("a")!;
    for (const e of EVENTS) expect(a(e)).toBe(1);

    for (let i = 1; i < 5; i++) r.rerender(<Harness loading={false} which="a" tick={i} />);
    for (const e of EVENTS) expect(a(e)).toBe(1);

    r.rerender(<Harness loading={false} which="b" tick={9} />);
    const b = spies.get("b")!;
    for (const e of EVENTS) { expect(a(e)).toBe(0); expect(b(e)).toBe(1); }

    r.unmount();
    for (const e of EVENTS) expect(b(e)).toBe(0);
  });

  it("the ref keeps a stable identity and exposes .current", () => {
    const seen: any[] = [];
    function H({ t }: { t: number }) { const { ref } = usePullToRefresh(vi.fn()); seen.push(ref); return <div data-t={t} ref={ref} />; }
    const r = render(<H t={0} />);
    r.rerender(<H t={1} />);
    expect(seen[0]).toBe(seen[seen.length - 1]);
    expect(seen[0].current).toBeInstanceOf(HTMLDivElement);
  });
});
