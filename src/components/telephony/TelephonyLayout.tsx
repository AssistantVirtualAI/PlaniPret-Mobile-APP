import { ReactNode } from 'react';
import { ConnectionStatusBanner } from '@/components/telephony/ConnectionStatusBanner';

export function TelephonyLayout({ children, portal = false }: { children: ReactNode; portal?: boolean }) {
  return (
    <div className="space-y-4">
      <ConnectionStatusBanner settingsPath={portal ? '/org/lemtel/portal/settings' : '/org/lemtel/telephony/settings'} />
      {children}
    </div>
  );
}
