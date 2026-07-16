import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import MascotRobot from "./MascotRobot";

const MascotPanel = lazy(() => import("./MascotPanel"));

const HIDE_PREFIXES = [
  "/",
  "/login", "/signup", "/auth",
  "/portals", "/end-user", "/extension/login",
  "/portal/", "/client/portal", "/p/",
  "/features", "/demo-request", "/contact", "/download",
];

function shouldShow(pathname: string): boolean {
  if (pathname === "/") return false;
  for (const p of HIDE_PREFIXES) {
    if (p === "/") continue;
    if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p)) {
      return false;
    }
  }
  return true;
}

export default function MascotProvider() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => { setHidden(!shouldShow(pathname)); }, [pathname]);
  if (hidden) return null;

  return (
    <>
      <Suspense fallback={null}>
        {open && (
          <MascotPanel
            open={open}
            onClose={() => setOpen(false)}
            onMinimize={() => setOpen(false)}
          />
        )}
      </Suspense>
      {/* Launcher — small, cute, top-right, never overlapping bottom-right softphone */}
      <button
        type="button"
        aria-label="Open Lemtel assistant"
        onClick={() => setOpen((v) => !v)}
        className="group fixed top-3 right-3 z-[60] w-16 h-16 rounded-full bg-background/80 backdrop-blur-xl border border-primary/40 shadow-[0_6px_24px_hsl(var(--primary)/0.4)] hover:scale-110 active:scale-95 transition-transform overflow-hidden"
      >
        <MascotRobot listening={!open} compact />
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-background" />
      </button>
      <span className="fixed top-[76px] right-3 z-[60] pointer-events-none text-[10px] font-semibold text-foreground/70 bg-background/80 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100">
        Hi! 👋
      </span>
    </>
  );
}
