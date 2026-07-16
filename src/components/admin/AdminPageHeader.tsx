import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export function AdminPageHeader({
  icon: Icon, title, subtitle, actions,
}: { icon: LucideIcon; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-border/60">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md"
          style={{ background: 'var(--gradient-primary)' }}
        >
          <Icon className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
