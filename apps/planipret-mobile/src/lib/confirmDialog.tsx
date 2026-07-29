// Portal-based imperative confirmation dialog — replaces window.confirm which
// is blocked/asynchronous in iOS/Android WebViews. Includes anti-double-tap
// guard on the confirm button.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

type Opts = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirmDialog(opts: Opts | string): Promise<boolean> {
  const o: Opts = typeof opts === "string" ? { message: opts } : opts;
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (v: boolean) => {
      try { root.unmount(); } catch {}
      try { host.remove(); } catch {}
      resolve(v);
    };
    root.render(<ConfirmUI opts={o} onResolve={finish} />);
  });
}

function ConfirmUI({ opts, onResolve }: { opts: Opts; onResolve: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(true); }, []);

  const confirm = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => onResolve(true), 30);
  };
  const cancel = () => { if (busy) return; onResolve(false); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={cancel}
      style={{
        position: "fixed", inset: 0, zIndex: 100000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, opacity: open ? 1 : 0, transition: "opacity 120ms",
        paddingTop: "env(safe-area-inset-top,0px)",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, maxWidth: 420, width: "100%",
          padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {opts.title && (
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#111" }}>
            {opts.title}
          </div>
        )}
        <div style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>
          {opts.message}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            type="button" onClick={cancel} disabled={busy}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "1px solid #d5d5d5", background: "#fff",
              fontSize: 14, fontWeight: 600, color: "#333",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {opts.cancelLabel ?? "Annuler"}
          </button>
          <button
            type="button" onClick={confirm} disabled={busy}
            style={{
              padding: "10px 16px", borderRadius: 10, border: "none",
              background: opts.destructive ? "#DC2626" : "#1A4A8A", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1, minWidth: 96,
            }}
          >
            {busy ? "…" : (opts.confirmLabel ?? "Confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
