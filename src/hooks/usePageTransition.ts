/**
 * usePageTransition — Smooth page transitions for Planiprêt Mobile.
 *
 * Returns CSS animation classes to apply on the page container.
 * The animation is a fast horizontal slide (200ms) that matches the
 * direction of navigation (forward = slide left, back = slide right).
 *
 * Usage:
 *   const { className, style } = usePageTransition();
 *   return <div className={className} style={style}>...</div>;
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// Tab order — used to determine slide direction
const TAB_ORDER = [
  "/mplanipret/home",
  "/mplanipret",
  "/mplanipret/calls",
  "/mplanipret/messages",
  "/mplanipret/voicemail",
  "/mplanipret/contacts",
  "/mplanipret/pipeline",
  "/mplanipret/stats",
  "/mplanipret/ava",
  "/mplanipret/more",
];

function tabIndex(path: string): number {
  const exact = TAB_ORDER.indexOf(path);
  if (exact !== -1) return exact;
  // Prefix match
  for (let i = TAB_ORDER.length - 1; i >= 0; i--) {
    if (path.startsWith(TAB_ORDER[i] + "/")) return i;
  }
  return -1;
}

type Direction = "forward" | "back" | "none";

export function usePageTransition() {
  const { pathname } = useLocation();
  const prevPath = useRef<string>(pathname);
  const [direction, setDirection] = useState<Direction>("none");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    const prevIdx = tabIndex(prevPath.current);
    const nextIdx = tabIndex(pathname);
    let dir: Direction = "none";
    if (prevIdx !== -1 && nextIdx !== -1) {
      dir = nextIdx > prevIdx ? "forward" : "back";
    }
    setDirection(dir);
    setVisible(false);
    // Tiny delay so the browser paints the "exit" frame before entering
    const t = requestAnimationFrame(() => {
      setVisible(true);
      prevPath.current = pathname;
    });
    return () => cancelAnimationFrame(t);
  }, [pathname]);

  const style: React.CSSProperties = {
    animation: visible
      ? direction === "forward"
        ? "pp-slide-in-right 200ms cubic-bezier(0.25,0.46,0.45,0.94) both"
        : direction === "back"
        ? "pp-slide-in-left 200ms cubic-bezier(0.25,0.46,0.45,0.94) both"
        : "pp-fade-in 150ms ease both"
      : "none",
  };

  return { style };
}

// Inject keyframes once into the document
if (typeof document !== "undefined") {
  const id = "__pp_page_transition_styles__";
  if (!document.getElementById(id)) {
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      @keyframes pp-slide-in-right {
        from { opacity: 0; transform: translateX(18px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes pp-slide-in-left {
        from { opacity: 0; transform: translateX(-18px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes pp-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `;
    document.head.appendChild(el);
  }
}
