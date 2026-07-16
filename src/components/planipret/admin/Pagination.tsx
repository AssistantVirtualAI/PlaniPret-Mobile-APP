// Reusable pagination + page-size selector for Planiprêt admin tables.
// Identical behaviour on Courtiers, Appels, Messages, Enregistrements.
import { useMemo } from "react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  unit?: string; // e.g. "courtiers", "appels"
};

const SIZES = [25, 50, 100];

export default function Pagination({ page, pageSize, total, loading, onPageChange, onPageSizeChange, unit = "résultats" }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pages = useMemo(() => {
    const out: (number | "…")[] = [];
    const window = 1; // pages on each side of current
    const first = 1;
    const last = totalPages;
    const candidates = new Set<number>([first, last, safePage]);
    for (let i = safePage - window; i <= safePage + window; i++) {
      if (i >= first && i <= last) candidates.add(i);
    }
    const sorted = Array.from(candidates).sort((a, b) => a - b);
    let prev = 0;
    for (const n of sorted) {
      if (prev && n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }, [safePage, totalPages]);

  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? "#1A4A8A" : "#0D1F35",
    color: active ? "#fff" : "#8FA8C0",
    border: "1px solid var(--pp-bg-border-2)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "DM Sans, system-ui, sans-serif",
    cursor: active ? "default" : "pointer",
    minWidth: 32,
  });
  const disabled: React.CSSProperties = { opacity: 0.4, cursor: "not-allowed" };

  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3"
      style={{ padding: 16, borderTop: "1px solid #0A1E35", fontSize: 12, color: "var(--pp-text-muted)" }}
    >
      <span>
        {loading ? "Chargement…" : `Affichage de ${start}–${end} sur ${total} ${unit}`}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          style={{ ...btn(false), ...(safePage <= 1 ? disabled : {}) }}
        >
          ← Précédent
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ padding: "0 6px", color: "#8FA8C0" }}>…</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)} style={btn(p === safePage)}>
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          style={{ ...btn(false), ...(safePage >= totalPages ? disabled : {}) }}
        >
          Suivant →
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11 }}>Afficher</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{
            background: "#0D1F35",
            border: "1px solid var(--pp-bg-border-2)",
            color: "#8FA8C0",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          {SIZES.map((s) => (
            <option key={s} value={s} style={{ background: "var(--pp-bg-deep)" }}>{s}</option>
          ))}
        </select>
        <span style={{ fontSize: 11 }}>par page</span>
      </div>
    </div>
  );
}
