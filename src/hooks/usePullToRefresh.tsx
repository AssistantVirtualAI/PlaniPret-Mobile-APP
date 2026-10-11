import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Pull-to-refresh for the single active vertical scroll owner.
 *
 * - startY, distance, busy flag and callbacks live in refs: listeners are attached
 *   once per element/threshold, never per pixel of drag.
 * - Multi-touch is ignored; touchcancel resets without refreshing.
 * - Armed only when the owner is at scrollTop 0, a refresh is registered
 *   (`canRefresh()`), and the gesture did not start inside a nested scrollable
 *   descendant or an open sheet/dialog.
 * - Visual state is throttled to one update per animation frame.
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  threshold = 70,
  canRefresh: () => boolean = () => true,
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  // Function ref that also exposes `.current` for legacy callers.
  const ref = useMemo(() => {
    const f = ((node: HTMLDivElement | null) => { f.current = node as HTMLDivElement; setEl(node); }) as ((node: HTMLDivElement | null) => void) & { current: HTMLDivElement };
    f.current = null as unknown as HTMLDivElement;
    return f;
  }, []);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const dist = useRef(0);
  const busy = useRef(false);
  const frame = useRef<number | null>(null);
  const mounted = useRef(true);
  const onRefreshRef = useRef(onRefresh);
  const canRefreshRef = useRef(canRefresh);
  onRefreshRef.current = onRefresh;
  canRefreshRef.current = canRefresh;

  useEffect(() => {
    mounted.current = true;
    if (!el) return;

    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id: number) => clearTimeout(id);
    const paint = () => {
      if (frame.current != null) return;
      frame.current = raf(() => { frame.current = null; if (mounted.current) setPullDist(dist.current); });
    };
    const reset = () => {
      startY.current = null;
      dist.current = 0;
      if (frame.current != null) { caf(frame.current); frame.current = null; }
      if (mounted.current) setPullDist(0);
    };

    const startedInNonOwner = (target: EventTarget | null) => {
      let n = target instanceof Element ? target : null;
      while (n && n !== el) {
        if (n.closest?.('[role="dialog"],[data-pp-sheet]') && el.contains(n)) return true;
        const h = n as HTMLElement;
        if (h.scrollHeight > h.clientHeight + 1) {
          const oy = typeof getComputedStyle === "function" ? getComputedStyle(h).overflowY : "";
          if (oy === "auto" || oy === "scroll") return true;
        }
        n = n.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { if (startY.current != null) reset(); return; }
      if (busy.current || el.scrollTop > 0 || !canRefreshRef.current()) return;
      if (startedInNonOwner(e.target)) return;
      startY.current = e.touches[0].clientY;
      dist.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      if (e.touches.length !== 1) { reset(); return; }
      const dy = e.touches[0].clientY - startY.current;
      dist.current = dy > 0 ? Math.min(dy, threshold * 1.5) : 0;
      paint();
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const dy = dist.current;
      reset();
      if (dy < threshold || busy.current || !canRefreshRef.current()) return;
      busy.current = true;
      if (mounted.current) setRefreshing(true);
      try { await onRefreshRef.current(); } finally {
        busy.current = false;
        if (mounted.current) setRefreshing(false);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", reset);
    return () => {
      mounted.current = false;
      if (frame.current != null) { caf(frame.current); frame.current = null; }
      startY.current = null;
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", reset);
    };
  }, [threshold, el]);

  return { ref, pullDist, refreshing, threshold };
}

/** Visual indicator rendered above the scroll content. */
export function PullIndicator({ pullDist, refreshing, threshold = 70, color }: { pullDist: number; refreshing: boolean; threshold?: number; color?: string }) {
  const visible = pullDist > 0 || refreshing;
  if (!visible) return null;
  const progress = Math.min(pullDist / threshold, 1);
  return (
    <div
      style={{ height: Math.max(pullDist, refreshing ? 40 : 0), opacity: refreshing ? 1 : progress, color }}
      className="flex items-center justify-center text-xs text-muted-foreground transition-opacity"
      aria-hidden={!visible}
    >
      {refreshing ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <span>{progress >= 1 ? "Relâcher" : "Tirer pour actualiser"}</span>
      )}
    </div>
  );
}
