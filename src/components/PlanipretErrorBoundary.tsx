import React from "react";

type State = { error: Error | null };

function isEmptyNativeArtifact(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return !raw;

  const obj = raw as Record<string, unknown>;
  const message = String(obj.message ?? Object.getOwnPropertyDescriptor(obj, 'message')?.value ?? '').trim();
  const errorMessage = String(obj.errorMessage ?? Object.getOwnPropertyDescriptor(obj, 'errorMessage')?.value ?? '').trim();
  const code = String(obj.code ?? Object.getOwnPropertyDescriptor(obj, 'code')?.value ?? '').trim();
  if (!message && !errorMessage && !code && Object.keys(obj).length === 0) return true;
  if (code === 'UNIMPLEMENTED' && /not implemented/i.test(message || errorMessage)) return true;
  return false;
}

export class PlanipretErrorBoundary extends React.Component<{ children: React.ReactNode }, State & { retryKey: number }> {
  state: State & { retryKey: number } = { error: null, retryKey: 0 };
  static getDerivedStateFromError(error: Error) {
    if (isEmptyNativeArtifact(error)) return { error: null };
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    if (isEmptyNativeArtifact(error)) {
      // Empty native startup artifact — swallow AND remount subtree so the
      // app doesn't stay blank after React unmounts the failing tree.
      this.setState((s) => ({ error: null, retryKey: Math.min(s.retryKey + 1, 3) }));
      return;
    }
    console.error("[PlanipretErrorBoundary]", error, info);
  }
  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md bg-white rounded-xl shadow-md p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="font-semibold text-lg mb-2">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 mb-4">{this.state.error.message || "Le démarrage a été interrompu."}</p>
          <button onClick={() => { this.setState({ error: null, retryKey: this.state.retryKey + 1 }); location.reload(); }}
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
