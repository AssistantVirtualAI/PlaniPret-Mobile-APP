import { ReactNode } from 'react';
import { SyncStatusPill } from './SyncStatusPill';
import { ImpersonationBanner } from './ImpersonationBanner';
import DomainSwitcher from '@/components/lemtel/DomainSwitcher';

function ShellHeader({ label, withSwitcher }: { label: string; withSwitcher?: boolean }) {
  return (
    <div className="glass-panel flex items-center justify-between rounded-xl border border-border/50 bg-card/50 backdrop-blur-xl px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
        <h2 className="text-sm font-semibold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          {label}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {withSwitcher && <DomainSwitcher />}
        <SyncStatusPill />
      </div>
    </div>
  );
}


export function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <div className="space-y-5 w-full max-w-none min-w-0">
        <ShellHeader label="Lemtel Communications · Admin Portal" withSwitcher />
        <div className="w-full min-w-0">{children}</div>
      </div>
    </>
  );
}

export function UserPortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <div className="space-y-5 w-full max-w-none min-w-0">
        <ShellHeader label="My Workspace" />
        <div className="w-full min-w-0">{children}</div>
      </div>
    </>
  );
}
