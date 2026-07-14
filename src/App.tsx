/**
 * Planiprêt Mobile — Standalone Capacitor app
 * Uses the exact same shell + routes + providers as /mplanipret on web.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
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
