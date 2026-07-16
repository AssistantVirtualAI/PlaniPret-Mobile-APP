import { type ReactNode } from "react";

export function PPSkeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`pp-skeleton rounded ${className}`}
      style={{
        background: "linear-gradient(90deg, var(--pp-bg-elevated) 0%, var(--pp-bg-surface) 50%, var(--pp-bg-elevated) 100%)",
        backgroundSize: "200% 100%",
        animation: "pp-shimmer 1.4s ease-in-out infinite",
        ...style,
      }} />
  );
}

export function PPEmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="mb-4 rounded-full p-4" style={{ background: "var(--pp-bg-elevated)", border: "1px solid var(--pp-bg-border)" }}>
          <div style={{ color: "var(--pp-text-muted)" }}>{icon}</div>
        </div>
      )}
      <p style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text-primary)" }}>{title}</p>
      {description && (
        <p style={{ fontSize: 12, color: "var(--pp-text-muted)", marginTop: 4, maxWidth: 360 }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
