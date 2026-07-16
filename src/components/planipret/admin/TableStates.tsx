// Standardized empty / error states for admin tables.
import type { ReactNode } from "react";

export function TableErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        margin: 16,
        padding: 16,
        background: "rgba(232,76,76,0.08)",
        border: "1px solid rgba(232,76,76,0.45)",
        borderRadius: 12,
        color: "#FCA5A5",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>❌ Impossible de charger les données</div>
      <div style={{ color: "#FECACA", whiteSpace: "pre-wrap", marginBottom: 10 }}>{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "#7F1D1D",
            color: "#fff",
            border: "1px solid #B91C1C",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

export function TableEmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--pp-text-faint)",
        fontSize: 13,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: "var(--pp-text-primary)", fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ marginBottom: 12, maxWidth: 480, margin: "0 auto 12px" }}>{hint}</div>}
      {action}
    </div>
  );
}
