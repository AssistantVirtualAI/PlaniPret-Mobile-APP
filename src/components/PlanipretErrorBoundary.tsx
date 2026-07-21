import React from "react";

type State = { error: Error | null };

/**
 * Extract a real message from any thrown value.
 * Returns null for empty/non-fatal iOS Capacitor artefacts (e.g. `{}`).
 */
function extractMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Error) return raw.message || null;
  if (typeof raw === 'string') return raw || null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (typeof raw === 'object') {
    const tryGet = (key: string): string | null => {
      try {
        const val = (raw as any)[key] ?? Object.getOwnPropertyDescriptor(raw, key)?.value;
        return val != null && String(val).trim() ? String(val).trim() : null;
      } catch { return null; }
    };
    return tryGet('message') || tryGet('hint') || tryGet('details') || tryGet('code') || null;
  }
  return null;
}

export class PlanipretErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(raw: unknown): Partial<State> {
    // iOS Capacitor throws empty {} at startup — ignore them completely.
    const msg = extractMessage(raw);
    if (!msg) {
      console.warn('[PlanipretErrorBoundary] Ignoring non-fatal empty error:', raw);
      return {}; // No state change — keep rendering children
    }
    const err = raw instanceof Error ? raw : new Error(msg);
    return { error: err };
  }
  componentDidCatch(raw: unknown, info: any) {
    const msg = extractMessage(raw);
    if (!msg) return; // Skip empty errors silently
    console.error("[PlanipretErrorBoundary]", raw, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md bg-white rounded-xl shadow-md p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="font-semibold text-lg mb-2">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 mb-4">{this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); location.reload(); }}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">Recharger</button>
        </div>
      </div>
    );
  }
}

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(typeof navigator !== "undefined" && !navigator.onLine);
  React.useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (!offline) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-[200] text-center py-2"
      style={{
        background: "rgba(245,166,35,0.12)",
        borderBottom: "1px solid rgba(245,166,35,0.3)",
        color: "#F5A623",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 600,
        fontSize: 12,
        backdropFilter: "blur(8px)",
      }}
    >
      📡 Connexion perdue — tentative de reconnexion…
    </div>
  );
}
