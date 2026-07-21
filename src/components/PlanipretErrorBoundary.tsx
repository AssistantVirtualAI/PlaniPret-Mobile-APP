import React from "react";

type State = { hasError: boolean; isIgnorable: boolean; error: Error | null };

function isEmptyNativeArtifact(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (raw instanceof Error) return !String(raw.message ?? '').trim();
  if (typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(obj), ...Object.getOwnPropertyNames(obj)]);
  for (const key of ['message', 'errorMessage', 'code', 'details', 'hint', 'error', 'data']) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    const value = desc?.value ?? (obj as any)[key];
    if (value != null && String(value).trim() !== '' && String(value) !== '{}') return false;
  }
  const onlyGenerated = [...allKeys].every((k) =>
    ['stack', 'name', 'message', 'errorMessage', '__proto__', 'constructor'].includes(k)
  );
  return allKeys.size === 0 || onlyGenerated;
}

export class PlanipretErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, isIgnorable: false, error: null };

  static getDerivedStateFromError(raw: unknown): State {
    if (isEmptyNativeArtifact(raw)) {
      return { hasError: true, isIgnorable: true, error: null };
    }
    const error = raw instanceof Error ? raw : new Error(String(raw));
    return { hasError: true, isIgnorable: false, error };
  }

  componentDidCatch(raw: unknown, info: any) {
    if (isEmptyNativeArtifact(raw)) {
      console.warn("[PlanipretErrorBoundary] Ignored empty iOS Capacitor artefact");
      // Reset so children render normally on next paint
      this.setState({ hasError: false, isIgnorable: false, error: null });
      return;
    }
    console.error("[PlanipretErrorBoundary]", raw, info);
  }

  render() {
    const { hasError, isIgnorable, error } = this.state;

    // Ignorable artefact — render children as if nothing happened
    if (!hasError || isIgnorable) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md bg-white rounded-xl shadow-md p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="font-semibold text-lg mb-2">Une erreur est survenue</h2>
          <p className="text-sm text-slate-600 mb-4">{error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, isIgnorable: false, error: null }); location.reload(); }}
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
