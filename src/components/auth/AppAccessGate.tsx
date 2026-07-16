import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hides children (typically <SoftphoneWidget/>) when the current user has been
 * denied app access by an admin via `pbx_softphone_users.app_access_enabled`.
 * Defaults to ALLOWED while loading or if the user has no extension at all
 * (back-office users without a softphone are unaffected).
 */
function detectAccessPlatform(): 'app' | 'desktop' | 'mobile' {
  if (typeof window === 'undefined') return 'app';
  const w = window as any;
  const ua = navigator.userAgent || '';
  if (w.electron || w.__TAURI__ || /Electron|Tauri|AVA Desktop/i.test(ua)) return 'desktop';
  if (w.Capacitor || w.cordova || /Capacitor|Cordova|ReactNative|AVA Mobile/i.test(ua)) return 'mobile';
  return 'app';
}

export function AppAccessGate({ children, platform }: { children: ReactNode; platform?: 'app' | 'desktop' | 'mobile' }) {
  const effectivePlatform = platform || detectAccessPlatform();
  const { data: allowed = true } = useQuery({
    queryKey: ['app-access-allowed', effectivePlatform],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('my_platform_access_allowed', { _platform: effectivePlatform });
      return data !== false;
    },
    staleTime: 60_000,
  });
  if (!allowed) return null;
  return <>{children}</>;
}
