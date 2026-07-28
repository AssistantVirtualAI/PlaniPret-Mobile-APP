/**
 * Planiprêt Mobile — Standalone Capacitor app
 * Uses the exact same shell + routes + providers as /mplanipret on web.
 */
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { handleIncomingDeepLink } from '@/lib/deepLinkDebug';
import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
// (UI toaster removed — sonner is enough for the mobile app)
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { MplanipretGuard } from '@/components/auth/MplanipretGuard';
import { PlanipretErrorBoundary } from '@/components/PlanipretErrorBoundary';
import { LazyRouteBoundary } from '@/components/LazyRouteBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { scheduleIdlePrefetch, CORE_MOBILE_TAB_PATHS } from '@/lib/routePrefetch';

// Do not start route prefetching while React is still mounting on iOS WKWebView.
// It can race lazy route resolution during cold native startup and leave the
// root empty with only the index.html "Chargement..." fallback visible.

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
const MaestroCallback = lazyWithRetry(() => import('@/pages/planipret/MaestroCallback'), 'MaestroCallback');
const MMs365Diagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MMs365Diagnostics'), 'MMs365Diagnostics');
const MStyleDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MStyleDiagnostics'), 'MStyleDiagnostics');
const MDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MDiagnostics'), 'MDiagnostics');
const MSipDebug = lazyWithRetry(() => import('@/pages/planipret/mobile/MSipDebug'), 'MSipDebug');
const MKpiAudit = lazyWithRetry(() => import('@/pages/planipret/mobile/MKpiAudit'), 'MKpiAudit');
const MLayoutQA = lazyWithRetry(() => import('@/pages/planipret/mobile/MLayoutQA'), 'MLayoutQA');
const MDeepLinkDebug = lazyWithRetry(() => import('@/pages/planipret/mobile/MDeepLinkDebug'), 'MDeepLinkDebug');

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

// ─── Module-level singletons ────────────────────────────────────────────────
// iOS never clears getLaunchUrl() — it keeps returning the same OAuth callback
// URL on every subsequent call until the app is fully killed. If we read it
// inside a useEffect that depends on `navigate` (which changes reference on
// every React re-render / route change), we end up replaying the same stale
// callback URL in an infinite loop. We solve this by:
//   1. Reading getLaunchUrl() exactly ONCE per app cold-start (_launchUrlConsumed).
//   2. Registering the appUrlOpen listener exactly ONCE (_appUrlListener).
//   3. Keeping a navigateRef so the listener always calls the latest navigate
//      without needing to re-register.
let _launchUrlConsumed = false;
let _appUrlListenerRegistered = false;

function NativeDeepLinkBridge() {
  const navigate = useNavigate();
  // Stable ref — updated on every render so the listener always has the latest navigate.
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });

  useEffect(() => {
    // Guard: only initialise once per app session.
    if (_appUrlListenerRegistered) return;
    _appUrlListenerRegistered = true;

    (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');

        // Read getLaunchUrl exactly once — iOS keeps returning the same URL on
        // every subsequent call, so reading it again after a route change would
        // replay the stale OAuth callback and create an infinite loop.
        if (!_launchUrlConsumed) {
          _launchUrlConsumed = true;
          const launch = await CapacitorApp.getLaunchUrl();
          if (launch?.url) {
            await handleIncomingDeepLink(launch.url, 'launchUrl', navigateRef.current);
          }
        }

        // appUrlOpen fires for every new deep-link while the app is running.
        // Only route on real deep links — do NOT re-route on appStateChange.
        // iOS fires "active" every time the in-app Browser (SFSafariViewController)
        // is presented/dismissed, which would replay a stale callback and close
        // the Maestro/Microsoft login before the user finishes signing in.
        await CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
          void handleIncomingDeepLink(event.url, 'appUrlOpen', navigateRef.current);
        });
      } catch {
        // Web preview: no native deep links.
      }
    })();

    // Do NOT remove the listener on unmount — NativeDeepLinkBridge must survive
    // React re-renders and route changes to keep receiving deep links.
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once

  return null;
}

function NativeBootMarker() {
  useEffect(() => {
    const markReady = (window as any).__PP_MARK_BOOT_READY__;
    if (typeof markReady === 'function') markReady();
    else {
      (window as any).__PP_REACT_BOOTED__ = true;
      const fallback = document.getElementById('pp-native-boot-fallback');
      if (fallback) fallback.style.display = 'none';
    }
  }, []);
  return null;
}

export default function App() {
  useEffect(() => {
    const t = window.setTimeout(() => scheduleIdlePrefetch(CORE_MOBILE_TAB_PATHS), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster position="top-center" richColors />
            <NativeBootMarker />
            <PlanipretErrorBoundary>
              <LazyRouteBoundary>
                <NativeDeepLinkBridge />
                <Routes>
                  <Route path="/" element={<Navigate to="/mplanipret" replace />} />
                  <Route path="/login" element={<Navigate to="/mplanipret" replace />} />
                  <Route path="/auth/ms365/callback" element={<Ms365Callback />} />
                  <Route path="/auth/microsoft/callback" element={<Ms365Callback />} />
                  <Route path="/auth/maestro/callback" element={<MaestroCallback />} />
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
                    <Route path="diagnostics" element={<MDiagnostics />} />
                    <Route path="sip-debug" element={<MSipDebug />} />
                    <Route path="kpi-audit" element={<MKpiAudit />} />
                    <Route path="qa/layout" element={<MLayoutQA />} />
                    <Route path="deep-link-debug" element={<MDeepLinkDebug />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/mplanipret" replace />} />
                </Routes>
              </LazyRouteBoundary>
            </PlanipretErrorBoundary>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
