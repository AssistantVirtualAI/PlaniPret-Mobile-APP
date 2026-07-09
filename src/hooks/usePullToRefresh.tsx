import { useEffect, useRef, useState } from "react";

/**
 * Pull-to-refresh hook for mobile scrollable views.
 * Returns `ref` to attach to the scroll container, current `pullDist`, and `refreshing` flag.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>, threshold = 70) {
  const ref = useRef<HTMLDivElement>(null!);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0 || busy.current) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) setPullDist(Math.min(dy, threshold * 1.5));
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const dy = pullDist;
      startY.current = null;
      if (dy >= threshold && !busy.current) {
        busy.current = true;
        setRefreshing(true);
        try { await onRefresh(); } finally {
          busy.current = false;
          setRefreshing(false);
          setPullDist(0);
        }
      } else {
        setPullDist(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [onRefresh, threshold, pullDist]);

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
