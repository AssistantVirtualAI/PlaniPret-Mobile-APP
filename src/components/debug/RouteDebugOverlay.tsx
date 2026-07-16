import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getNavLog,
  isNavDebugEnabled,
  setNavDebug,
  subscribeNavLog,
  clearNavLog,
  type NavEvent,
} from "@/lib/debug/navDebug";

/**
 * Floating overlay that shows the current route and the last redirects with
 * their source (guard, auth, missing profile, …). Renders only when nav
 * debug is enabled (see navDebug.ts).
 *
 * Toggle at runtime in the browser console:
 *   localStorage.setItem('lovable_nav_debug','1'); location.reload();
 */
export default function RouteDebugOverlay() {
  const location = useLocation();
  const [enabled, setEnabled] = useState<boolean>(() => isNavDebugEnabled());
  const [events, setEvents] = useState<NavEvent[]>(() => getNavLog());
  const [open, setOpen] = useState(true);

  useEffect(() => subscribeNavLog(() => setEvents(getNavLog())), []);

  // Keyboard shortcut: Ctrl/Cmd + Alt + D to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "d" || e.key === "D")) {
        const next = !isNavDebugEnabled();
        setNavDebug(next);
        setEnabled(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        width: open ? 360 : 140,
        maxHeight: open ? 320 : 36,
        overflow: "hidden",
        background: "rgba(8,12,24,0.92)",
        color: "#E6F0FF",
        border: "1px solid rgba(120,170,255,0.35)",
        borderRadius: 10,
        font: "11px/1.4 ui-monospace, Menlo, monospace",
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        backdropFilter: "blur(8px)",
      }}
      data-testid="route-debug-overlay"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "rgba(60,110,200,0.25)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>NAV DEBUG</span>
        <span>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: 10 }}>
          <div style={{ marginBottom: 6, opacity: 0.85 }}>
            <b>route:</b>{" "}
            <span data-testid="route-debug-current" style={{ color: "#9bd6ff" }}>
              {location.pathname}
              {location.search}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button
              onClick={clearNavLog}
              style={{
                padding: "2px 8px",
                background: "rgba(255,255,255,0.08)",
                color: "#E6F0FF",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              clear
            </button>
            <button
              onClick={() => { setNavDebug(false); setEnabled(false); }}
              style={{
                padding: "2px 8px",
                background: "rgba(255,255,255,0.08)",
                color: "#E6F0FF",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              disable
            </button>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {events.length === 0 && <div style={{ opacity: 0.6 }}>no redirects recorded</div>}
            {events.slice().reverse().map((ev, i) => (
              <div key={i} style={{ padding: "4px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <div style={{ color: "#ffd28a" }}>{ev.source}</div>
                <div>
                  <span style={{ opacity: 0.7 }}>{ev.from}</span>
                  {" → "}
                  <span style={{ color: "#9bd6ff" }}>{ev.to}</span>
                </div>
                {ev.reason && <div style={{ opacity: 0.65 }}>{ev.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
