import { type ReactNode } from "react";

/**
 * Shared visual shell for every Planiprêt admin page.
 * Presentation only — no data, no behavior.
 * Styles live in src/index.css under `.planipret-admin-scope .pa-*`.
 */
export function PAPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pa-page ${className}`}>{children}</div>;
}

export function PAPageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pa-header">
      <div className="min-w-0">
        <h1 className="pa-header-title">
          {icon ? <span className="pa-header-icon">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? <p className="pa-header-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="pa-header-actions">{actions}</div> : null}
    </div>
  );
}

export function PATableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pa-scroll ${className}`}>{children}</div>;
}

/** Section card: optional head (title/subtitle/actions) + padded or raw body. */
export function PACard({
  title,
  subtitle,
  icon,
  actions,
  children,
  padded = true,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  const hasHead = title != null || actions != null;
  return (
    <section className={`pa-card ${className}`}>
      {hasHead ? (
        <div className="pa-card-head">
          <div className="min-w-0">
            {title != null ? (
              <h2 className="pa-card-title">
                {icon}
                <span className="truncate">{title}</span>
              </h2>
            ) : null}
            {subtitle != null ? <p className="pa-card-sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="pa-header-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "pa-card-pad" : ""}>{children}</div>
    </section>
  );
}

/** Filters / actions bar shared by list pages. */
export function PAToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pa-toolbar ${className}`}>{children}</div>;
}

/** Scrollable table with unified header/row styling. */
export function PATable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="pa-scroll">
      <table className={`pa-table ${className}`}>{children}</table>
    </div>
  );
}

export type PABadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function PABadge({
  tone = "neutral",
  children,
  className = "",
  title,
}: {
  tone?: PABadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const toneClass = tone === "neutral" ? "" : `pa-badge-${tone}`;
  return (
    <span className={`pa-badge ${toneClass} ${className}`} title={title}>
      {children}
    </span>
  );
}

export function PAStats({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pa-stats ${className}`}>{children}</div>;
}

export function PAStat({
  label,
  value,
  hint,
  icon,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="pa-stat-label">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="pa-stat-value">{value}</div>
      {hint != null ? <div className="pa-stat-hint">{hint}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="pa-stat text-left" onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className="pa-stat">{body}</div>;
}

export function PAEmpty({ children }: { children: ReactNode }) {
  return <div className="pa-empty">{children}</div>;
}

export default PAPage;
