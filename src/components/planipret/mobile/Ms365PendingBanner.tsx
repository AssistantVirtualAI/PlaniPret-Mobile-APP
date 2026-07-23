import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { getMs365PendingStartedAt, clearMs365Pending } from "@/lib/ms365Pending";

/**
 * Watches for a pending Microsoft SSO attempt that never completed:
 * user tapped "Continuer", was sent to Entra, then returned to the app
 * without the deep-link callback firing. Shows a retry banner.
 */
export function Ms365PendingBanner({ onRetry }: { onRetry: () => void | Promise<void> }) {
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    const startedAt = await getMs365PendingStartedAt();
    if (!startedAt) { setVisible(false); return; }
    // If the user returned within 3s the callback might still be routing;
    // wait a bit longer before showing retry.
    const age = Date.now() - startedAt;
    if (age > 4000) setVisible(true);
  }, []);

  useEffect(() => {
    void check();
    let unsub: null | (() => void) = null;
    (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { App } = await import("@capacitor/app");
          const listener = await App.addListener("appStateChange", (state: { isActive: boolean }) => {
            if (state.isActive) void check();
          });
          unsub = () => { try { listener.remove(); } catch {} };
        } catch {}
      } else {
        const handler = () => { if (document.visibilityState === "visible") void check(); };
        document.addEventListener("visibilitychange", handler);
        unsub = () => document.removeEventListener("visibilitychange", handler);
      }
    })();
    return () => unsub?.();
  }, [check]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      style={{
        margin: "8px 16px",
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(234,179,8,0.12)",
        border: "1px solid rgba(234,179,8,0.4)",
        color: "var(--pp-text-primary, #f8fafc)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
      }}
    >
      <AlertTriangle size={16} style={{ color: "#facc15", flexShrink: 0 }} />
      <div style={{ flex: 1, lineHeight: 1.3 }}>
        Connexion Microsoft interrompue. Cliquez sur « Réessayer » pour terminer l'approbation.
      </div>
      <button
        onClick={async () => { setVisible(false); await onRetry(); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "6px 10px", borderRadius: 8, fontWeight: 700,
          background: "#2E9BDC", color: "white", fontSize: 12,
        }}
      >
        <RotateCw size={13} /> Réessayer
      </button>
      <button
        aria-label="Fermer"
        onClick={() => { clearMs365Pending(); setVisible(false); }}
        style={{ padding: 4, color: "var(--pp-text-muted, #94a3b8)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
