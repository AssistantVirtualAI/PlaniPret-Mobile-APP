// Collapsible debug panel for admin pages.
// Shows the raw queries / row counts / errors / response times.
// Dev-only when ?debug=1 is in the URL (also visible to super_admins by default).
import { useState } from "react";

export type DebugEntry = {
  label: string;
  query?: string;
  count?: number | null;
  error?: string | null;
  ms?: number | null;
  sample?: unknown;
  meta?: Record<string, unknown>;
};

export default function DebugPanel({ entries }: { entries: DebugEntry[] }) {
  const [open, setOpen] = useState(false);
  const visible = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  if (!visible) return null;
  return (
    <div
      style={{
        background: "rgba(232, 76, 76, 0.06)",
        border: "1px dashed rgba(232, 76, 76, 0.35)",
        borderRadius: 12,
        padding: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
      }}
    >
      <button onClick={() => setOpen((o) => !o)} style={{ color: "#E84C4C", fontWeight: 600 }}>
        🐞 Debug ({entries.length}) — {open ? "Cacher" : "Afficher"}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {entries.map((e, i) => (
            <div key={i} style={{ background: "#0D1F35", padding: 10, borderRadius: 8 }}>
              <div style={{ color: "#E2E8F0", fontWeight: 700 }}>{e.label}</div>
              {e.query && <div style={{ color: "#8FA8C0" }}>query: <code>{e.query}</code></div>}
              {e.count !== undefined && <div style={{ color: "#00D4AA" }}>count: {String(e.count)}</div>}
              {e.ms != null && <div style={{ color: "#9B7FE8" }}>time: {e.ms}ms</div>}
              {e.error && <div style={{ color: "#E84C4C" }}>error: {e.error}</div>}
              {e.meta && <pre style={{ color: "#8FA8C0", whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(e.meta, null, 2)}</pre>}
              {e.sample != null && (
                <details>
                  <summary style={{ color: "#8FA8C0", cursor: "pointer" }}>sample (3 rows)</summary>
                  <pre style={{ color: "#cfe1ff", whiteSpace: "pre-wrap", margin: 0 }}>
                    {JSON.stringify(Array.isArray(e.sample) ? e.sample.slice(0, 3) : e.sample, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
