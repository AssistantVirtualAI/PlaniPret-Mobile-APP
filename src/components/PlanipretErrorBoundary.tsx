import React from "react";

type State = { message: string };

function getErrorMessage(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (raw instanceof Error) return (raw.message || '').trim();
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['message', 'hint', 'details', 'reason', 'description']) {
      try {
        const val = obj[key];
        if (val && typeof val === 'string' && val.trim() && val !== 'undefined') return val.trim();
      } catch { /* ignore */ }
    }
    for (const key of ['message', 'stack', 'name']) {
      try {
        const desc = Object.getOwnPropertyDescriptor(raw, key);
        const val = desc?.value;
        if (val && typeof val === 'string' && val.trim() && val !== 'Error' && val !== 'undefined') return val.trim();
      } catch { /* ignore */ }
    }
  }
  return '';
}

export class PlanipretErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { message: '' };

  static getDerivedStateFromError(raw: unknown): Partial<State> {
    const message = getErrorMessage(raw);
    if (!message) {
      console.warn('[PlanipretErrorBoundary] Swallowed empty iOS error:', raw);
      return {}; // No state change
    }
    return { message };
  }

  componentDidCatch(raw: unknown, info: any) {
    const message = getErrorMessage(raw);
    if (!message) return;
    console.error("[PlanipretErrorBoundary]", message, info);
  }

  render() {
    // Only show crash screen if there is a real non-empty message
    if (!this.state.message) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md bg-white rounded-xl shadow-md p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="font-semibold text-lg mb-2">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 mb-4">{this.state.message}</p>
          <button
            onClick={() => { this.setState({ message: '' }); location.reload(); }}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            Recharger
          </button>
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
