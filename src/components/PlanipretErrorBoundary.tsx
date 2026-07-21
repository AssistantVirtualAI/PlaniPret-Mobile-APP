import React from "react";

type State = { error: Error | null };

/**
 * Returns true if the thrown value is a non-fatal iOS Capacitor / React
 * internal artefact (e.g. the `{}` thrown by StatusBar UNIMPLEMENTED).
 * Uses Object.getOwnPropertyNames() to inspect ALL properties.
 */
function isEmptyNativeArtifact(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return !raw;
  const obj = raw as Record<string, unknown>;
  const keys = new Set([...Object.keys(obj), ...Object.getOwnPropertyNames(obj)]);
  for (const key of ['message', 'stack', 'name', 'code', 'details', 'hint', 'error']) {
    const value = obj[key] ?? Object.getOwnPropertyDescriptor(obj, key)?.value;
    if (value != null && String(value).trim()) return false;
  }
  return keys.size === 0;
}

export class PlanipretErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(raw: unknown): Partial<State> {
    if (isEmptyNativeArtifact(raw)) return {}; // No state change
    const err = raw instanceof Error ? raw : new Error(String((raw as any)?.message ?? 'Unknown error'));
    return { error: err };
  }
  componentDidCatch(raw: unknown, info: any) {
    if (isEmptyNativeArtifact(raw)) return;
    console.error("[PlanipretErrorBoundary]", raw, info);
  }
  render() {
    if (!this.state.error || isEmptyNativeArtifact(this.state.error)) return this.props.children;
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
