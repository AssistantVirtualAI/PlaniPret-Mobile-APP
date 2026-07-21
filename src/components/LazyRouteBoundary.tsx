import React, { Suspense } from "react";
import MobileScreenSkeleton from "@/components/planipret/mobile/MobileScreenSkeleton";

type State = { error: Error | null; retryKey: number };

function isEmptyNativeArtifact(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return !raw;
  if (raw instanceof Error && !String(raw.message ?? '').trim()) return true;
  const obj = raw as Record<string, unknown>;
  const keys = new Set([...Object.keys(obj), ...Object.getOwnPropertyNames(obj)]);
  const message = String(obj.message ?? Object.getOwnPropertyDescriptor(obj, 'message')?.value ?? '').trim();
  const errorMessage = String(obj.errorMessage ?? Object.getOwnPropertyDescriptor(obj, 'errorMessage')?.value ?? '').trim();
  const code = String(obj.code ?? Object.getOwnPropertyDescriptor(obj, 'code')?.value ?? '').trim();
  if (code === 'UNIMPLEMENTED' && /not implemented/i.test(message || errorMessage)) return true;
  const hasOnlyGeneratedErrorFields = [...keys].every((key) =>
    ['stack', 'name', 'message', 'errorMessage', 'code', 'data'].includes(key)
  );
  for (const key of ['message', 'errorMessage', 'code', 'details', 'hint', 'error']) {
    const value = obj[key] ?? Object.getOwnPropertyDescriptor(obj, key)?.value;
    if (value != null && String(value).trim()) return false;
  }
  return keys.size === 0 || hasOnlyGeneratedErrorFields;
}

/**
 * Error boundary tailored for lazy-loaded route chunks in the mobile app.
 * - Shows MobileScreenSkeleton while the chunk is loading.
 * - On chunk load failure or render error: shows a dark, on-brand fallback
 *   with a retry button that remounts the Suspense subtree (re-imports the
 *   chunk) instead of a full page reload.
 * - As a last resort ("Recharger l'application") we do a hard reload to
 *   pick up fresh chunk hashes after a redeploy.
 */
export class LazyRouteBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> | null {
    if (isEmptyNativeArtifact(error)) return null;
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isEmptyNativeArtifact(error)) return;
    console.error("[LazyRouteBoundary]", error, info);
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
  };

  private handleReload = () => {
    try {
      // Clear the one-time lazy-retry flags so lazyWithRetry can reload again.
      for (const k of Object.keys(sessionStorage)) {
        if (k.startsWith("__pp_lazy_retry_")) sessionStorage.removeItem(k);
      }
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message ?? "");
      const isChunk =
        /Importing a module script failed/i.test(msg) ||
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /ChunkLoadError/i.test(msg) ||
        /error loading dynamically imported module/i.test(msg);

      return (
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "linear-gradient(160deg, #060D1A 0%, #0A1425 100%)",
            color: "#E6F0FF",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: 360,
              padding: 22,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {isChunk ? "Chargement interrompu" : "Une erreur est survenue"}
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.75,
                marginBottom: 16,
                wordBreak: "break-word",
              }}
            >
              {isChunk
                ? "Impossible de télécharger cette section. Vérifiez votre connexion."
                : msg || "Erreur inattendue."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={this.handleRetry}
                style={{
                  background: "#2E9BDC",
                  border: "none",
                  borderRadius: 10,
                  color: "white",
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 10,
                  color: "#E6F0FF",
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Recharger l'application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Suspense key={this.state.retryKey} fallback={<MobileScreenSkeleton />}>
        {this.props.children}
      </Suspense>
    );
  }
}

export default LazyRouteBoundary;
