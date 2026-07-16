import { cn } from '@/lib/utils';

type Tone = 'on' | 'off' | 'warn' | 'err' | 'info';

export function StatusBadge({ tone = 'info', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const map: Record<Tone, string> = {
    on:   'bg-success/15 text-success border-success/30',
    off:  'bg-muted text-muted-foreground border-border',
    warn: 'bg-warning/15 text-warning-foreground border-warning/40',
    err:  'bg-destructive/15 text-destructive border-destructive/40',
    info: 'bg-primary/10 text-primary border-primary/30',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border', map[tone], className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', {
        on: 'bg-success', off: 'bg-muted-foreground', warn: 'bg-warning', err: 'bg-destructive', info: 'bg-primary',
      }[tone])} />
      {children}
    </span>
  );
}
