/**
 * Planiprêt Mobile — Standalone Capacitor app
 * Uses the exact same shell + routes + providers as /mplanipret on web.
 */
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
// (UI toaster removed — sonner is enough for the mobile app)
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { OrganizationProvider } from '@/context/OrganizationContext';
import { MplanipretGuard } from '@/components/auth/MplanipretGuard';
import { PlanipretErrorBoundary } from '@/components/PlanipretErrorBoundary';
import { LazyRouteBoundary } from '@/components/LazyRouteBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { prefetchAllMobileTabs } from '@/lib/routePrefetch';

// Kick off tab-chunk warm-up as soon as the app module loads, so switching
// tabs the first time is instant instead of showing a loading skeleton.
if (typeof window !== 'undefined') {
  prefetchAllMobileTabs();
}

const PlanipretMobile = lazyWithRetry(() => import('@/pages/planipret/PlanipretMobile'), 'PlanipretMobile');
const MHome = lazyWithRetry(() => import('@/pages/planipret/mobile/MHome'), 'MHome');
const MCalls = lazyWithRetry(() => import('@/pages/planipret/mobile/MCalls'), 'MCalls');
const MMessages = lazyWithRetry(() => import('@/pages/planipret/mobile/MMessages'), 'MMessages');
const MVoicemail = lazyWithRetry(() => import('@/pages/planipret/mobile/MVoicemail'), 'MVoicemail');
const MContacts = lazyWithRetry(() => import('@/pages/planipret/mobile/MContacts'), 'MContacts');
const MMore = lazyWithRetry(() => import('@/pages/planipret/mobile/MMore'), 'MMore');
const MPipeline = lazyWithRetry(() => import('@/pages/planipret/mobile/MPipeline'), 'MPipeline');
const MSearch = lazyWithRetry(() => import('@/pages/planipret/mobile/MSearch'), 'MSearch');
const MStats = lazyWithRetry(() => import('@/pages/planipret/mobile/MStats'), 'MStats');
const MAvaChat = lazyWithRetry(() => import('@/pages/planipret/mobile/MAvaChat'), 'MAvaChat');
const MAvaNotifications = lazyWithRetry(() => import('@/pages/planipret/mobile/MAvaNotifications'), 'MAvaNotifications');
const MExtensionSync = lazyWithRetry(() => import('@/pages/planipret/mobile/MExtensionSync'), 'MExtensionSync');
const Ms365Callback = lazyWithRetry(() => import('@/pages/planipret/Ms365Callback'), 'Ms365Callback');
const MMs365Diagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MMs365Diagnostics'), 'MMs365Diagnostics');
const MStyleDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MStyleDiagnostics'), 'MStyleDiagnostics');



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

function NativeDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const routeFromUrl = (rawUrl?: string | null) => {
      if (!rawUrl) return;
      try {
        const url = new URL(rawUrl);
        const pathWithHost = `/${[url.hostname, url.pathname].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
        // Intercepte capacitor://localhost/auth/microsoft/callback (scheme déclaré dans Info.plist)
        // ainsi que les URLs web normales
        const isMs365Callback =
          url.pathname === '/auth/microsoft/callback' ||
          url.pathname === '/auth/ms365/callback' ||
          pathWithHost === '/auth/microsoft/callback' ||
          pathWithHost === '/auth/ms365/callback' ||
          // capacitor://localhost/auth/microsoft/callback
          (url.protocol === 'capacitor:' && url.pathname === '/auth/microsoft/callback');

        if (isMs365Callback) {
          localStorage.setItem('pp_ms365_callback_url', rawUrl);
          navigate(`/auth/microsoft/callback${url.search}`, { replace: true });
        }
      } catch {
        // Ignore non-URL events.
      }
    };

    let unsubscribe: null | (() => void) = null;
    (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        const launch = await CapacitorApp.getLaunchUrl();
        routeFromUrl(launch?.url);
        const listener = await CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
          routeFromUrl(event.url);
        });
        unsubscribe = () => { try { listener.remove(); } catch {} };
      } catch {
        // Web preview: no native deep links.
      }
    })();

    return () => unsubscribe?.();
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster position="top-center" richColors />

            <OrganizationProvider>
              <PlanipretErrorBoundary>
                <LazyRouteBoundary>
                  <NativeDeepLinkBridge />
                  <Routes>
                    <Route path="/" element={<Navigate to="/mplanipret" replace />} />
                    <Route path="/login" element={<Navigate to="/mplanipret" replace />} />
                    <Route path="/auth/ms365/callback" element={<Ms365Callback />} />
                    <Route path="/auth/microsoft/callback" element={<Ms365Callback />} />
                    <Route
                      path="/mplanipret"
                      element={<MplanipretGuard><PlanipretMobile /></MplanipretGuard>}
                    >
                      <Route index element={<MHome />} />
                      <Route path="home" element={<MHome />} />
                      <Route path="calls" element={<MCalls />} />
                      <Route path="messages" element={<MMessages />} />
                      <Route path="voicemail" element={<MVoicemail />} />
                      <Route path="contacts" element={<MContacts />} />
                      <Route path="more" element={<MMore />} />
                      <Route path="pipeline" element={<MPipeline />} />
                      <Route path="search" element={<MSearch />} />
                      <Route path="stats" element={<MStats />} />
                      <Route path="ava" element={<MAvaChat />} />
                      <Route path="notifications" element={<MAvaNotifications />} />
                      <Route path="extension-sync" element={<MExtensionSync />} />
                      <Route path="ms365-diagnostics" element={<MMs365Diagnostics />} />
                      <Route path="style-diagnostics" element={<MStyleDiagnostics />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/mplanipret" replace />} />
                  </Routes>
                </LazyRouteBoundary>
              </PlanipretErrorBoundary>
            </OrganizationProvider>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
