import { type ReactNode } from "react";

/**
 * Shared visual shell for every Planiprêt admin page.
 * Presentation only — no data, no behavior.
 */
export function PAPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`pa-page space-y-5 ${className}`}>{children}</div>;
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

export default PAPage;
