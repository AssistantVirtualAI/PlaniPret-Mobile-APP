import { cn } from '@/lib/utils';
import { MessageSquare, BarChart3, Bot, Settings, LayoutDashboard } from 'lucide-react';

interface BrandingPreviewProps {
  surface: 'admin' | 'client';
  primaryColor: string;
  logoUrl?: string;
  title?: string;
}

/**
 * Lightweight live mock of the admin / client portal chrome so users can
 * see how their branding choices will look.
 */
export function BrandingPreview({ surface, primaryColor, logoUrl, title }: BrandingPreviewProps) {
  const items =
    surface === 'admin'
      ? [
          { icon: LayoutDashboard, label: 'Dashboard' },
          { icon: Bot, label: 'Agents' },
          { icon: MessageSquare, label: 'Conversations' },
          { icon: BarChart3, label: 'Analytics' },
          { icon: Settings, label: 'Settings' },
        ]
      : [
          { icon: LayoutDashboard, label: 'Portail' },
          { icon: MessageSquare, label: 'Conversations' },
          { icon: BarChart3, label: 'Statistiques' },
        ];

  const displayTitle = title || (surface === 'admin' ? 'Admin Portal' : 'Client Portal');

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      <div className="flex h-[260px]">
        {/* Sidebar */}
        <div className="w-40 border-r border-border bg-muted/30 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-3 px-1">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-7 h-7 rounded object-contain" />
            ) : (
              <div
                className="w-7 h-7 rounded"
                style={{ background: primaryColor }}
              />
            )}
            <span className="text-xs font-semibold truncate">{displayTitle}</span>
          </div>
          {items.map((it, i) => (
            <div
              key={it.label}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded text-[11px]',
                i === 0 ? 'text-white' : 'text-muted-foreground hover:bg-muted',
              )}
              style={i === 0 ? { background: primaryColor } : undefined}
            >
              <it.icon className="w-3.5 h-3.5" />
              <span className="truncate">{it.label}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-4 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-2 w-40 rounded bg-muted/60" />
            </div>
            <button
              className="text-[11px] text-white px-3 py-1.5 rounded-md font-medium"
              style={{ background: primaryColor }}
            >
              Action
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border p-2 space-y-1">
                <div
                  className="h-1.5 w-8 rounded"
                  style={{ background: primaryColor, opacity: 0.6 }}
                />
                <div className="h-3 w-12 rounded bg-foreground/80" />
                <div className="h-2 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border p-2 space-y-1.5">
            <div className="h-2 w-20 rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full"
                style={{ background: primaryColor }}
              />
              <div className="flex-1 space-y-1">
                <div className="h-2 w-1/2 rounded bg-muted" />
                <div className="h-2 w-1/3 rounded bg-muted/70" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
