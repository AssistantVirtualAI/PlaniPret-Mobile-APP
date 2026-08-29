/**
 * Planiprêt Mobile — Standalone Capacitor app
 * Uses the exact same shell + routes + providers as /mplanipret on web.
 */
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AiConsentHost from "@/components/planipret/mobile/AiConsentHost";
import { handleIncomingDeepLink } from '@/lib/deepLinkDebug';
import { useEffect } from 'react';
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
import RemoteConfigGate from '@/components/planipret/mobile/RemoteConfigGate';

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
const MAvaDirectory = lazyWithRetry(() => import('@/pages/planipret/mobile/MAvaDirectory'), 'MAvaDirectory');
const MStats = lazyWithRetry(() => import('@/pages/planipret/mobile/MStats'), 'MStats');
const MCommissions = lazyWithRetry(() => import('@/pages/planipret/mobile/MCommissions'), 'MCommissions');
const MTasks = lazyWithRetry(() => import('@/pages/planipret/mobile/MTasks'), 'MTasks');
const MAvaChat = lazyWithRetry(() => import('@/pages/planipret/mobile/MAvaChat'), 'MAvaChat');
const MAvaNotifications = lazyWithRetry(() => import('@/pages/planipret/mobile/MAvaNotifications'), 'MAvaNotifications');
const MExtensionSync = lazyWithRetry(() => import('@/pages/planipret/mobile/MExtensionSync'), 'MExtensionSync');
const MConnections = lazyWithRetry(() => import('@/pages/planipret/mobile/MConnections'), 'MConnections');
const MMaestroSync = lazyWithRetry(() => import('@/pages/planipret/mobile/MMaestroSync'), 'MMaestroSync');
const Ms365Callback = lazyWithRetry(() => import('@/pages/planipret/Ms365Callback'), 'Ms365Callback');
const MaestroCallback = lazyWithRetry(() => import('@/pages/planipret/MaestroCallback'), 'MaestroCallback');
const MMs365Diagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MMs365Diagnostics'), 'MMs365Diagnostics');
const MStyleDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MStyleDiagnostics'), 'MStyleDiagnostics');
const MDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MDiagnostics'), 'MDiagnostics');
const MBuildDiagnostics = lazyWithRetry(() => import('@/pages/planipret/mobile/MBuildDiagnostics'), 'MBuildDiagnostics');
const MSipDebug = lazyWithRetry(() => import('@/pages/planipret/mobile/MSipDebug'), 'MSipDebug');
const MKpiAudit = lazyWithRetry(() => import('@/pages/planipret/mobile/MKpiAudit'), 'MKpiAudit');
const MLayoutQA = lazyWithRetry(() => import('@/pages/planipret/mobile/MLayoutQA'), 'MLayoutQA');
const MDeepLinkDebug = lazyWithRetry(() => import('@/pages/planipret/mobile/MDeepLinkDebug'), 'MDeepLinkDebug');
const MChangePassword = lazyWithRetry(() => import('@/pages/planipret/mobile/MChangePassword'), 'MChangePassword');
const PlanipretPrivacy = lazyWithRetry(() => import('@/pages/planipret/PlanipretPrivacy'), 'PlanipretPrivacy');




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
    const routeFromUrl = async (rawUrl?: string | null, source = "unknown") => {
      await handleIncomingDeepLink(rawUrl, source, navigate);
    };

    // ASWebAuthenticationSession (iOS) returns the callback URL in-process
    // instead of re-opening the app through a deep link.
    const onAuthSessionCallback = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      void routeFromUrl(url, "authSession");
    };
    window.addEventListener("pp-oauth-callback", onAuthSessionCallback);

    // Reprise après un redémarrage du WebView pendant l'OAuth Maestro :
    // le code d'autorisation est conservé en localStorage, on le rejoue.
    try {
      const pending = localStorage.getItem("pp_maestro_callback_url");
      if (pending) void routeFromUrl(pending, "pendingMaestroCallback");
    } catch {}

    let unsubscribe: null | (() => void) = null;
    (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        // Only route on real deep links (appUrlOpen) and the initial launch URL.
        // Do NOT re-route on appStateChange — iOS fires "active" every time the
        // in-app Browser (SFSafariViewController) is presented/dismissed, which
        // would replay a stale launchUrl or cached callback and close the
        // Maestro/Microsoft login before the user finishes signing in.
        const launch = await CapacitorApp.getLaunchUrl();
        void routeFromUrl(launch?.url, "launchUrl");
        const listener = await CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => {
          void routeFromUrl(event.url, "appUrlOpen");
        });
        unsubscribe = () => { try { listener.remove(); } catch {} };
      } catch {
        // Web preview: no native deep links.
      }
    })();

    return () => {
      window.removeEventListener("pp-oauth-callback", onAuthSessionCallback);
      unsubscribe?.();
    };
  }, [navigate]);

  return null;
}

function NativeBootMarker() {
  useEffect(() => {
    const markReady = (window as any).__PP_MARK_BOOT_READY__;
    if (typeof markReady === 'function') markReady();
    else {
      (window as any).__PP_REACT_BOOTED__ = true;
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
            <AiConsentHost />
            <PlanipretErrorBoundary>
              <RemoteConfigGate>
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
                    <Route path="directory" element={<MAvaDirectory />} />
                    <Route path="stats" element={<MStats />} />
                    <Route path="commissions" element={<MCommissions />} />
                    <Route path="tasks" element={<MTasks />} />
                    <Route path="ava" element={<MAvaChat />} />
                    <Route path="change-password" element={<MChangePassword />} />
                    <Route path="privacy" element={<PlanipretPrivacy />} />

                    <Route path="notifications" element={<MAvaNotifications />} />
                    <Route path="extension-sync" element={<MExtensionSync />} />
                    <Route path="connections" element={<MConnections />} />
                    <Route path="maestro-sync" element={<MMaestroSync />} />
                    <Route path="ms365-diagnostics" element={<MMs365Diagnostics />} />
                    <Route path="style-diagnostics" element={<MStyleDiagnostics />} />
                    <Route path="diagnostics" element={<MDiagnostics />} />
                    <Route path="build-diagnostics" element={<MBuildDiagnostics />} />
                    <Route path="sip-debug" element={<MSipDebug />} />
                    <Route path="kpi-audit" element={<MKpiAudit />} />
                    <Route path="qa/layout" element={<MLayoutQA />} />
                    <Route path="deep-link-debug" element={<MDeepLinkDebug />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/mplanipret" replace />} />
                </Routes>
              </LazyRouteBoundary>
              </RemoteConfigGate>
            </PlanipretErrorBoundary>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
