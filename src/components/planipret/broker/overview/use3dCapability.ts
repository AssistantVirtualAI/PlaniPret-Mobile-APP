import { useEffect, useRef, useState } from "react";

/**
 * Detects whether the device can comfortably render the layered 3D charts.
 * Falls back to an accessible flat 2D rendering on low-end / reduced-motion
 * devices, or when the user forced the "flat" 3D intensity level.
 */
export function useSupports3D() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const compute = () => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const nav = navigator as Navigator & { deviceMemory?: number };
      const lowMem = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 3;
      const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 3;
      const forcedFlat =
        getComputedStyle(document.documentElement).getPropertyValue("--ov3d-d").trim() === "0";
      // High readability mode always renders the accessible flat charts.
      const highReadability = document.documentElement.getAttribute("data-pp-hr") === "1";
      // SVG filters (used for the extrusion) are the expensive part.
      const noFilters = typeof CSS !== "undefined" && CSS.supports && !CSS.supports("filter", "url(#x)");
      setOk(!(reduced || lowMem || lowCpu || forcedFlat || highReadability || noFilters));
    };

    compute();
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", compute);
    // React to the user changing the 3D intensity control / readability mode.
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-pp-hr"] });
    return () => { mq?.removeEventListener?.("change", compute); mo.disconnect(); };

  }, []);

  return ok;
}

/**
 * Mounts heavy chart subtrees only once they approach the viewport.
 * Returns [ref, visible] — visible stays true once seen (no unmount churn).
 */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(rootMargin = "220px") {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return [ref, visible] as const;
}
