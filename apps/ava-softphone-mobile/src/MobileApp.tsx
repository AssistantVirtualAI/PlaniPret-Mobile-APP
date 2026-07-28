import { Component, useEffect, useMemo, useRef, useState, Suspense, lazy, type ReactNode } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { requestPermissionsAfterLogin, navLog, setPermissionLogContext } from './lib/requestPermissionsAfterLogin';
// Re-use battle-tested SIP hook from the desktop app
import { useSoftphone } from './hooks/useSoftphone';
import AuthScreen from './screens/AuthScreen';
import DashboardScreen from './screens/DashboardScreen';
import CallsScreen from './screens/CallsScreen';
// Lazy-loaded screens: only fetched when the user navigates to the tab.
// Keeps the initial bundle small for fast mobile boot.
const AVAChatScreen      = lazy(() => import('./screens/AVAChatScreen'));
const MoreScreen         = lazy(() => import('./screens/MoreScreen'));
const VoicemailScreen    = lazy(() => import('./screens/VoicemailScreen'));
const ContactsScreen     = lazy(() => import('./screens/ContactsScreen'));
const MessagesScreen     = lazy(() => import('./screens/MessagesScreen'));
const MessagesHubScreen  = lazy(() => import('./screens/MessagesHubScreen'));
const QueuesScreen       = lazy(() => import('./screens/QueuesScreen'));
const SettingsScreen     = lazy(() => import('./screens/SettingsScreen'));
const DialerScreen       = lazy(() => import('./screens/DialerScreen'));
const SpeedDialScreen    = lazy(() => import('./screens/SpeedDialScreen'));
const AudioDiagnosticsScreen = lazy(() => import('./screens/AudioDiagnosticsScreen'));
import BottomTabs, { Tab } from './components/BottomTabs';
import NotificationsSheet from './components/NotificationsSheet';
import { useTheme } from './lib/ThemeContext';
import { useT } from './lib/i18n';
import { Bell, Sun, Moon, Globe } from 'lucide-react';
import ActiveCallSheet from './components/ActiveCallSheet';
import SipDebugPanel from './components/SipDebugPanel';
import SplashAva from './components/SplashAva';
import SyncIndicator from './components/SyncIndicator';
import ProfileSheet from './components/ProfileSheet';
import MicPermissionWarning from './components/MicPermissionWarning';
import { useRealtimeCDR } from './hooks/useRealtimeCDR';
import { useDeviceNotifications } from './hooks/useDeviceNotifications';
import { initBackgroundSync } from './lib/backgroundSync';
import { useNotificationCounts } from './hooks/useNotificationCounts';
import { useStoredCreds, Creds, ensureStoredOrganizationId, hydrateSoftphoneCredentials } from './lib/creds';
import { gradients, colors } from './lib/theme';
import { ThemeProvider } from './lib/ThemeContext';
import { MobileI18nProvider } from './lib/i18n';
import { requestAllPermissions, checkAllPermissions } from './lib/permissions';
import { registerPush, sendPushTokenToBackend } from './lib/pushNotifications';
import { syncDeviceContacts } from './lib/contacts';
import { bootNative, onAppStateChange } from './lib/nativeBoot';
import { registerDeepLinkHandler, PENDING_CALL_KEY } from './lib/deepLink';
import { onNavigate as onAppNavigate, navigateTo } from './lib/appRouter';
import { dialNumber } from './lib/dialNumber';
import { configureMobileApi, setAuthToken } from './lib/mobileApi';


// Initialize immediately so API calls never go out without credentials
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';
configureMobileApi({
  portalUrl: 'https://gejxisrqtvxavbrfcoxz.supabase.co',
  anonKey: SUPABASE_ANON_KEY,
  accessToken: null,
});
import { configureAudit, audit } from './lib/audit';
import { edgeCall, supabase } from './lib/mobileSupabase';
import PerfOverlay from './components/PerfOverlay';
import IceDiagnosticsOverlay from './components/IceDiagnosticsOverlay';
import { ensureActivePcConfig } from './lib/sip/rtcConfig';
import ScreenSkeleton from './components/ScreenSkeleton';
import SessionExpired from './components/SessionExpired';
import { startPrefetch, prefetchForTab } from './lib/prefetch';

const isPreviewMode = (() => {
  try { return new URLSearchParams(window.location.search).get('preview') === '1'; }
  catch { return false; }
})();

export default function MobileApp() {
  const { creds, setCreds, clearCreds, loading } = useStoredCreds();

  // Restore Supabase session on app launch so API calls are authenticated
  useEffect(() => {
    const token = creds?.accessToken;
    const refresh = creds?.refreshToken;
    if (!token || !refresh) return;
    supabase.auth.setSession({
      access_token: token,
      refresh_token: refresh,
    }).then(({ data, error }) => {
      if (error) {
        console.warn('[Auth] Session restore failed:', error.message);
        supabase.auth.refreshSession().then(({ data: r }) => {
          if (r?.session) {
            setCreds((prev: any) => ({ ...prev, accessToken: r.session!.access_token, refreshToken: r.session!.refresh_token }));
            setAuthToken(r.session!.access_token);
            configureMobileApi({ accessToken: r.session!.access_token });
          }
        });
      } else if (data?.session) {
        setAuthToken(data.session.access_token);
        configureMobileApi({ accessToken: data.session.access_token });
        console.log('[Auth] Session restored ✅');
      }
    });
  }, [creds?.accessToken, creds?.refreshToken]);
  const ALL_TABS: Tab[] = ['home','calls','ava','messages','more','voicemail','contacts','sms','queues','settings','chats','keypad','speeddial'];
  const initialTab = (() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
      if (t && ALL_TABS.includes(t)) return t;
    } catch {}
    return 'keypad' as Tab;
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  // Deep-link state for sub-routes inside CallsScreen (recordings | recents | voicemail | dial)
  // and an optional pre-filter applied to the recents list ('missed' on missed-call taps).
  const [callsSub, setCallsSub] = useState<'recents' | 'recordings' | 'voicemail' | 'dial' | undefined>(undefined);
  const [callsFilter, setCallsFilter] = useState<'all' | 'missed' | undefined>(undefined);
  const [booting, setBooting] = useState(!isPreviewMode);
  const preferC2C = false;

  useEffect(() => {
    let cancelled = false;
    bootNative().finally(() => {
      setTimeout(() => setBooting(false), 700);
    });
    initBackgroundSync().catch(() => {});
    // Sonde les endpoints TURN au démarrage pour basculer sur le fallback
    // si Metered.ca n'est pas joignable depuis ce réseau / cet OS.
    ensureActivePcConfig().catch(() => {});
    // Préchargement opportuniste des écrans les plus consultés.
    try { startPrefetch(); } catch {}
    let unsubDeepLink: (() => void) | undefined;
    registerDeepLinkHandler().then((u) => { unsubDeepLink = u; }).catch(() => {});

    // Accept navigation commands from /mobile-preview host.
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== 'ava-preview') return;
      if (d.type === 'set-tab' && typeof d.tab === 'string') setTab(d.tab as Tab);
    };
    window.addEventListener('message', onMsg);

    // In-app router: notification bell + native push + local notifications
    // all dispatch ava:navigate; we translate it into (tab, sub-tab) state.
    const unsubNav = onAppNavigate((r: any) => {
      if (!r?.tab) return;
      setTab(r.tab as Tab);
      if (r.tab === 'calls') {
        setCallsSub(r.sub || 'recents');
        setCallsFilter(r.filter);
      } else {
        setCallsSub(undefined);
        setCallsFilter(undefined);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMsg);
      unsubDeepLink?.();
      unsubNav();
    };
  }, []);


  useEffect(() => { void navLog('MobileApp render', { loading, booting, hasCreds: !!creds, tab }); }, [loading, booting, creds, tab]);

  if (loading || booting) return <SplashAva />;
  if (!creds) return <MobileI18nProvider><ThemeProvider><AuthScreen onAuthenticated={(c) => {
    void navLog('AuthScreen.onAuthenticated', { userId: c?.userId, hasExtension: !!c?.extension, hasSipPassword: !!c?.sipPassword, org: c?.organizationId });
    void setPermissionLogContext({ userId: c?.userId, extension: c?.extension, organizationId: c?.organizationId });
    setCreds(c);
    void navLog('setCreds done, calling requestPermissionsAfterLogin');
    requestPermissionsAfterLogin()
      .then(() => void navLog('requestPermissionsAfterLogin resolved'))
      .catch((e) => void navLog('requestPermissionsAfterLogin THREW', { error: String(e) }));
  }} /><PerfOverlay /><IceDiagnosticsOverlay /></ThemeProvider></MobileI18nProvider>;

  return <MobileI18nProvider><ThemeProvider><AuthenticatedShell creds={creds} setCreds={setCreds} tab={tab} setTab={setTab} callsSub={callsSub} callsFilter={callsFilter} onSignOut={clearCreds} preferClickToCall={preferC2C} onTogglePreferC2C={() => {}} /><PerfOverlay /><IceDiagnosticsOverlay /></ThemeProvider></MobileI18nProvider>;
}

function AuthenticatedShell({
  creds, setCreds, tab, setTab, callsSub, callsFilter, onSignOut, preferClickToCall, onTogglePreferC2C,
}: { creds: Creds; setCreds: (c: Creds) => void; tab: Tab; setTab: (t: Tab) => void; callsSub?: 'recents' | 'recordings' | 'voicemail' | 'dial'; callsFilter?: 'all' | 'missed'; onSignOut: () => void; preferClickToCall: boolean; onTogglePreferC2C: () => void }) {


  // permissions handled natively after login
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { void navLog('AuthenticatedShell mount', { userId: creds.userId, extension: creds.extension, hasSip: !!creds.sipPassword, tab }); return () => { void navLog('AuthenticatedShell unmount'); }; }, []);
  useEffect(() => { void navLog('tab change', { tab }); }, [tab]);
  useDeviceNotifications(creds);
  const [freshCredentialToken, setFreshCredentialToken] = useState('boot');
  const [authExpired, setAuthExpired] = useState(false);
  const passwordHealRef = useRef('');
  const hydratedTokenRef = useRef('');
  const [sipReady, setSipReady] = useState(false);

  // Hydrate SIP credentials BEFORE starting JsSIP
  useEffect(() => {
    if (!creds?.accessToken) return;
    if (hydratedTokenRef.current === creds.accessToken) {
      setSipReady(true);
      return;
    }
    hydrateSoftphoneCredentials('mobile').then((next) => {
      if (next) setCreds(next);
      hydratedTokenRef.current = creds.accessToken || '';
      setSipReady(true);
    }).catch(() => setSipReady(true));
  }, [creds?.accessToken]);

  // Restore Supabase session from stored creds so the mobile SDK can
  // auto-refresh tokens (and so realtime/edge calls always have a fresh JWT).
  useEffect(() => {
    if (!creds.accessToken || !creds.refreshToken) return;
    supabase.auth.setSession({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    }).then(({ error }) => {
      if (error) console.warn('[Auth] Session restore failed:', error.message);
      else console.log('[Auth] Session restored');
    }).catch((e) => console.warn('[Auth] setSession threw', e?.message || e));
  }, [creds.accessToken, creds.refreshToken]);

  // Keep stored creds in sync with token refreshes; sign-out clears the app.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        setCreds({ ...creds, accessToken: session.access_token, refreshToken: session.refresh_token });
        setAuthExpired(false);
      } else if (event === 'SIGNED_OUT') {
        onSignOut();
      }
    });
    return () => { sub?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a clear "Session expired" screen when API calls return 401/403.
  useEffect(() => {
    const onAuthReq = () => setAuthExpired(true);
    window.addEventListener('mobile-auth-required', onAuthReq);
    return () => window.removeEventListener('mobile-auth-required', onAuthReq);
  }, []);

  // Permissions are requested natively after login (see requestPermissionsAfterLogin).

  // Build SIP config from the same backend credentials used by desktop/portal.
  // iOS uses native PJSIP (CapacitorPjsip). Android uses JsSIP over WSS 7443,
  // and SipForegroundService keeps the WebView WebSocket alive in background.
  //
  // All connection parameters are derived from the credentials returned by the
  // backend — no hardcoded hostnames or domains. This makes the app work on any
  // PBX and any domain without code changes.
  const sipPassword = creds.sipPassword;

  // WSS URLs: credential-provided values take precedence. If none are stored,
  // fall back to deriving the WSS URL from the SIP domain (standard port 7443).
  const credentialWss = [creds.wssUrl, ...(creds.wssUrls || [])]
    .filter((url): url is string => typeof url === 'string' && url.startsWith('wss://'));
  const sipDomain = creds.sipDomain || '';
  // Derive a WSS URL from the SIP domain when no explicit URL is stored.
  // This covers the case where the backend only returns sipDomain.
  const derivedWss = sipDomain ? `wss://${sipDomain}:7443` : null;
  const WORKING_WSS = Array.from(new Set([
    ...credentialWss,
    ...(derivedWss ? [derivedWss] : []),
  ].filter(Boolean) as string[]));

  const credentialsReady = sipReady && !!(creds.extension && sipPassword && WORKING_WSS.length > 0);

  // Extract the server hostname from the primary WSS URL for the native SIP
  // service (used by Android's foreground service for WakeLock/WifiLock).
  const primaryWssHost = (() => {
    try { return WORKING_WSS[0] ? new URL(WORKING_WSS[0]).hostname : ''; } catch { return ''; }
  })();

  const sipConfig = credentialsReady && creds.extension && sipPassword
    ? {
        extension: creds.extension,
        displayName: creds.displayName || creds.email || 'User',
        password: sipPassword,
        domain: sipDomain,
        // server is the raw hostname used by the native Android foreground service.
        server: primaryWssHost,
        port: 7443,
        transport: 'WSS',
        wssUrl: WORKING_WSS[0],
        wssUrls: WORKING_WSS,
        authUsername: creds.authUsername || creds.extension,
        refreshNonce: freshCredentialToken,
        // No Verto-specific fields needed — Android now uses JsSIP over WSS 7443.
      }
    : null;

  const _sipProvider = Capacitor.getPlatform() === 'ios' ? 'native-pjsip' : 'jssip-wss';
  console.log('[SIP] sipConfig:', sipConfig
    ? `ext=${sipConfig.extension} domain=${sipConfig.domain} wss=${sipConfig.wssUrl} provider=${_sipProvider}`
    : 'NULL - missing: ' + [
        !creds.extension && 'extension',
        !sipPassword && 'password',
      ].filter(Boolean).join(', '));
  const softphone = useSoftphone(sipConfig);

  const vertoRoutingRepairRef = useRef<string | null>(null);
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    if (!credentialsReady || !creds.accessToken || !creds.organizationId || !creds.extension) return;
    const key = `${creds.organizationId}:${creds.extension}`;
    if (vertoRoutingRepairRef.current === key) return;
    vertoRoutingRepairRef.current = key;
    edgeCall('fusionpbx-proxy', creds.accessToken, {
      action: 'repair-verto-extension-routing',
      organization_id: creds.organizationId,
      params: { domain_uuid: creds.domainUuid, extension: creds.extension },
    }).then((res: any) => {
      console.log('[Verto] PBX routing repair checked', res);
    }).catch((e) => {
      console.warn('[Verto] PBX routing repair failed', e?.message || e);
      vertoRoutingRepairRef.current = null;
    });
  }, [credentialsReady, creds.accessToken, creds.domainUuid, creds.extension, creds.organizationId]);

  useEffect(() => {
    if (!creds.accessToken || !creds.extension || !softphone.sipError) return;
    if (!/authentication failed|403|401|407|forbidden|unauthor/i.test(softphone.sipError)) return;
    const key = `${creds.userId || creds.email}:${creds.extension}:${softphone.sipError}`;
    if (passwordHealRef.current === key) return;
    passwordHealRef.current = key;
    // 403/401 on REGISTER means the PBX rejected our creds. Force-push the
    // canonical local password back into FusionPBX (an earlier repair-routing
    // POST on Android could overwrite the extension row and blank the
    // password). This fixes iOS too because both platforms share the same
    // FusionPBX extension record.
    edgeCall('softphone-sync-password', creds.accessToken, { force_local_to_pbx: true })
      .then(() => hydrateSoftphoneCredentials('mobile'))
      .then((next) => { if (next) setCreds(next); })
      .catch((e) => console.warn('[SIP] password auto-sync failed', e?.message || e));
  }, [creds.accessToken, creds.email, creds.extension, creds.userId, setCreds, softphone.sipError]);

  const sp = useMemo(() => {
    const richCallState = softphone.isOnHold ? 'held' : softphone.callState === 'ringing' ? 'ringing-out' : softphone.callState;
    return {
      snap: {
        status: softphone.sipStatus,
        error: softphone.sipError,
        callState: richCallState,
        startedAt: softphone.callState === 'active' ? Date.now() - (softphone.callTimer || 0) * 1000 : null,
        // Prefer the raw number for remoteParty when callerName is a generic
        // placeholder ("Appel entrant", "unknown") so the UI shows the actual number.
        remoteParty: (() => {
          const n = softphone.callerName || '';
          const num = softphone.callerNumber || softphone.activeCallNumber || '';
          const isGeneric = !n || n === 'Appel entrant' || n.toLowerCase() === 'unknown' || n === num;
          return isGeneric ? (num || n) : n;
        })(),
        remoteUri: softphone.callerNumber || softphone.activeCallNumber,
        remoteNumber: softphone.callerNumber || softphone.activeCallNumber,
        callerName: softphone.callerName || '',
        callerNumber: softphone.callerNumber || softphone.activeCallNumber,
        muted: softphone.isMuted,
        onHold: softphone.isOnHold,
        recording: !!softphone.isRecording,
        contacts: [],
        recents: [],
        quality: softphone.quality,
        audioStatus: softphone.audioStatus,
        audioError: softphone.audioError,
        audioRestartAttempts: softphone.audioRestartAttempts,
        androidSipServiceStatus: softphone.androidSipServiceStatus || null,
      },
      sipConfig,
      sipStatus: softphone.sipStatus,
      sipError: softphone.sipError,
      sipProvider: _sipProvider,
      platform: Capacitor.getPlatform(),
      androidSipServiceStatus: softphone.androidSipServiceStatus || null,
      call: softphone.call,
      addCall: softphone.addCall || softphone.call,
      hangup: softphone.hangup,
      answer: softphone.answer,
      mute: softphone.mute,
      unmute: softphone.unmute,
      hold: softphone.hold,
      unhold: softphone.unhold,
      sendDtmf: softphone.sendDTMF,
      sendDTMF: softphone.sendDTMF,
      setStatus: softphone.setStatus,
      reconnect: softphone.reconnect,
      lastPersistedError: softphone.lastPersistedError,
      sipLog: softphone.sipLog,
      clearSipLog: softphone.clearSipLog,
      clearSipState: softphone.clearSipState,
      retryAttempt: softphone.retryAttempt,
      nextRetryAt: softphone.nextRetryAt,
      retryLimitReached: softphone.retryLimitReached,
      quality: softphone.quality,
      audioProfile: softphone.audioProfile,
      setAudioProfile: softphone.setAudioProfile,
      setAudioEl: (_el: HTMLAudioElement | null) => {},
      audioStatus: softphone.audioStatus,
      audioError: softphone.audioError,
      audioRestartAttempts: softphone.audioRestartAttempts,
      transfer: softphone.transfer || softphone.transferCall || ((_target?: string) => {}),
      park: softphone.park || softphone.parkCall || (() => {}),
      startRecord: softphone.startRecord || softphone.startRecording || (() => {}),
      stopRecord: softphone.stopRecord || softphone.stopRecording || (() => {}),
    };
  }, [softphone, sipConfig, _sipProvider]);

  const notif = useNotificationCounts({
    accessToken: creds.accessToken,
    organizationId: creds.organizationId,
    userId: creds.userId,
  });




  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { sp.setAudioEl(audioRef.current); }, [sp]);

  // Cold-launch from a notification tap: if the native SIP service reports
  // an `incoming` call before the JS Verto stack has processed the event,
  // pull the snapshot directly so the ActiveCallSheet renders immediately
  // instead of the normal dialer while the invite is being adopted.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let cancelled = false;
    (async () => {
      try {
        const { getAndroidSipServiceStatus } = await import('./lib/sip/nativeSipProvider');
        const s = await getAndroidSipServiceStatus();
        if (cancelled || !s) return;
        if (String(s.status || '').toLowerCase() === 'incoming') {
          (softphone as any).setNativeStatusDirectly?.(s);
        }
      } catch { /* not android or plugin unavailable */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle tel: deep links from iOS Recents / Contacts.
  // deepLink.ts dispatches 'ava:pendingCall' and stores the number in
  // sessionStorage. We listen here (where sp is available) and auto-dial
  // as soon as the SIP stack is registered.
  const spRef = useRef(sp);
  useEffect(() => { spRef.current = sp; }, [sp]);
  useEffect(() => {
    function tryDial(number: string) {
      if (spRef.current.snap.status === 'registered') {
        dialNumber(spRef.current, number);
        return;
      }
      // Wait up to 15 s for registration then dial.
      const start = Date.now();
      const iv = setInterval(() => {
        if (spRef.current.snap.status === 'registered') {
          clearInterval(iv);
          dialNumber(spRef.current, number);
        } else if (Date.now() - start > 15000) {
          clearInterval(iv);
        }
      }, 400);
    }
    // Check for a number stored before this component mounted (cold launch).
    // IMPORTANT: do NOT auto-dial if an incoming call is already ringing — the
    // PENDING_CALL_KEY may contain a stale number from a previous outgoing call
    // or a tel: deep link that arrived at the same time as the incoming INVITE.
    const stored = sessionStorage.getItem(PENDING_CALL_KEY);
    const currentCallState = spRef.current?.snap?.callState;
    const incomingActive = currentCallState === 'ringing-in' || currentCallState === 'active';
    if (stored && !incomingActive) { sessionStorage.removeItem(PENDING_CALL_KEY); tryDial(stored); }
    else if (stored && incomingActive) { sessionStorage.removeItem(PENDING_CALL_KEY); }
    // Listen for future tel: deep links while app is running.
    const handler = (e: Event) => {
      const number = (e as CustomEvent<{ number: string }>).detail?.number;
      if (number) { sessionStorage.removeItem(PENDING_CALL_KEY); tryDial(number); }
    };
    window.addEventListener('ava:pendingCall', handler);
    return () => window.removeEventListener('ava:pendingCall', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Configure the mobile API client with the Supabase Edge Functions host
  // (NOT the marketing portal URL — edge functions live on supabase.co).
  useEffect(() => {
    const SUPABASE_URL =
      (import.meta as any).env?.VITE_SUPABASE_URL ||
      'https://gejxisrqtvxavbrfcoxz.supabase.co';
    const SUPABASE_ANON =
      (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';
    configureMobileApi({
      portalUrl: SUPABASE_URL,
      accessToken: creds.accessToken || null,
      anonKey: SUPABASE_ANON,
    });
    configureAudit(async () => creds.accessToken || null);
    if (creds.accessToken) audit('softphone.signed_in', creds.userId, { extension: creds.extension });
    // Desktop/portal always fetch fresh SIP credentials from the backend.
    // Do the same on mobile once per session so stale cached SIP passwords from
    // prior logins cannot keep causing PBX auth failures.
    if (creds.accessToken && hydratedTokenRef.current !== creds.accessToken) {
      hydratedTokenRef.current = creds.accessToken;
      hydrateSoftphoneCredentials('mobile').then((next) => {
        if (next) setCreds(next);
        else if (!creds.organizationId) ensureStoredOrganizationId().catch(() => {});
        setFreshCredentialToken(`${Date.now()}`);
      }).catch(() => { setFreshCredentialToken(`${Date.now()}`); });
    }
  }, [creds]);



  // Once the permission gate is dismissed, finalize permissions + push.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const perms = await requestAllPermissions();
      if (cancelled) return;

      // Push notifications — register token with backend.
      registerPush({
        onToken: async (token, platform) => {
          await sendPushTokenToBackend({
            token, platform,
            portalUrl: (creds as any).portalUrl || 'https://avastatistic.ca',
            accessToken: creds.accessToken || '',
            extension: creds.extension,
          });
        },
        onAction: (p) => {
          // Deep-link: tap a push to open the right tab + sub-tab.
          const kind = p.data?.kind;
          const route = p.data?.route;
          if (kind === 'voicemail' || route === 'voicemail') navigateTo({ tab: 'voicemail' });
          else if (kind === 'recording' || route === 'recordings') navigateTo({ tab: 'calls', sub: 'recordings' });
          else if (kind === 'missed_call' || kind === 'missed') navigateTo({ tab: 'calls', sub: 'recents', filter: 'missed' });
          else if (kind === 'sms' || route === 'chats' || route === 'sms') navigateTo({ tab: 'sms' });
          else if (kind === 'call') navigateTo({ tab: 'calls', sub: 'recents' });
          else if (kind === 'ava') setTab('ava');
        },
      });

      // Contacts sync — only when the user has explicitly consented
      // (App Store 5.1.2). The consent sheet is shown on demand from the
      // Contacts / Dialer screens; syncDeviceContacts() itself is a no-op
      // without consent, so this call is safe.
      if (perms.contacts === 'granted') {
        syncDeviceContacts().catch(() => {});
      }

    })();

    // Re-register SIP when app comes back to foreground.
    // NOTE: JsSIP manages its own reconnection via connection_recovery_min/max_interval
    // and nativeAutoReconnect. Calling sp.reconnect() here destroys and recreates the
    // JsSIP UA on every app foreground event, causing a perpetual connecting→registered
    // loop. Only trigger a manual reconnect if SIP is in a terminal error state.
    let unsub: () => void = () => {};
    onAppStateChange((active) => {
      if (active && sp.snap?.status === 'error') {
        sp.reconnect?.();
      }
    }).then((u) => { unsub = u; });

    return () => { cancelled = true; unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds.extension]);


  const inCall =
    sp.snap.callState === 'active' ||
    sp.snap.callState === 'held' ||
    sp.snap.callState === 'ringing-in' ||
    sp.snap.callState === 'ringing-out';

  const haptic = async (style: ImpactStyle = ImpactStyle.Light) => {
    if (Capacitor.isNativePlatform()) {
      try { await Haptics.impact({ style }); } catch {}
    }
  };
  if (authExpired) return <SessionExpired onSignOut={onSignOut} />;



  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: gradients.app,
      paddingTop: 'calc(var(--safe-top) + 52px)',
      paddingBottom: 'var(--safe-bottom)',
      color: colors.textIce,
      position: 'relative',
    }}>
      <audio ref={(el) => { (audioRef as any).current = el; import('./lib/sip/audioOutput').then((m) => m.registerRemoteAudioElement(el)); }} autoPlay playsInline muted={false} />

      {/* Top header — centered logo + hamburger + title + actions */}
      <TopHeader
        tab={tab}
        onNavigate={(t) => { haptic(ImpactStyle.Light); setTab(t); }}
        haptic={haptic}
        creds={creds}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <MicPermissionWarning />









      <div key={tab} className="lemtel-page-enter" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        <ScreenErrorBoundary screen={tab} onRecover={() => setTab('keypad')} onNavigate={setTab as any} haptic={haptic} onOpenProfile={() => setProfileOpen(true)}>
          <Suspense fallback={<ScreenSkeleton />}>
            {tab === 'contacts'   && <ContactsScreen sp={sp} />}
            {tab === 'chats'      && <MessagesHubScreen accessToken={creds.accessToken || null} userId={creds.userId} sp={sp} haptic={haptic} channelUnread={notif.channelUnread} />}
            {tab === 'calls'      && <CallsScreen sp={sp} haptic={haptic} creds={creds} initialSub={callsSub} initialFilter={callsFilter} />}
            {tab === 'keypad'     && <DialerScreen sp={sp} haptic={haptic} />}
            {tab === 'speeddial'  && <SpeedDialScreen sp={sp} preferClickToCall={preferClickToCall} />}
            {/* legacy deep-link routes */}
            {tab === 'home'       && <DashboardScreen onNavigate={setTab as any} haptic={haptic} onOpenProfile={() => setProfileOpen(true)} />}
            {tab === 'ava'        && <AVAChatScreen />}
            {tab === 'messages'   && <MessagesHubScreen accessToken={creds.accessToken || null} userId={creds.userId} sp={sp} haptic={haptic} channelUnread={notif.channelUnread} />}
            {tab === 'settings'   && <SettingsScreen creds={creds} sp={sp} onSignOut={onSignOut} onNavigate={setTab as any} preferClickToCall={preferClickToCall} togglePreferC2C={onTogglePreferC2C} />}
            {tab === 'more'       && <MoreScreen creds={creds} sp={sp} onSignOut={onSignOut} haptic={haptic} />}
            {tab === 'voicemail'  && <VoicemailScreen haptic={haptic} />}
            {tab === 'sms'        && <MessagesScreen haptic={haptic} />}
            {tab === 'queues'     && <QueuesScreen />}
            {tab === 'audiodiag'  && <AudioDiagnosticsScreen />}
          </Suspense>
        </ScreenErrorBoundary>
      </div>


      <BottomTabs
        active={tab}
        onChange={(t) => {
          haptic(ImpactStyle.Light);
          if (t === 'calls') notif.markSeen('calls');
          if (t === 'voicemail') notif.markSeen('voicemail');
          try { prefetchForTab(t); } catch {}
          setTab(t);
        }}
        badges={{
          calls: notif.missedCalls + notif.voicemails,
          messages: notif.messages,
          voicemail: notif.voicemails,
        }}
      />

      {inCall && <ActiveCallSheet sp={sp} haptic={haptic} />}

      <SipDebugPanel
        sipStatus={softphone.sipStatus}
        sipLog={softphone.sipLog}
        onClear={softphone.clearSipLog}
      />



      {profileOpen && (
        <ProfileSheet
          creds={creds}
          onClose={() => setProfileOpen(false)}
          onSignOut={() => { setProfileOpen(false); onSignOut(); }}
          onCredsUpdate={setCreds}
        />
      )}
    </div>
  );
}

class ScreenErrorBoundary extends Component<
  { children: ReactNode; screen: Tab; onRecover: () => void; onNavigate?: (t: Tab) => void; haptic?: (s?: ImpactStyle) => Promise<void>; onOpenProfile?: () => void },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[MobileScreenError]', this.props.screen, error); }
  componentDidUpdate(prevProps: { screen: Tab }) {
    // A screen-level crash must not poison the next page. Reset the boundary
    // whenever the user navigates to another tab so Home/Calls/Settings can
    // render again after a transient data/API error.
    if (prevProps.screen !== this.props.screen && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.screen === 'home') {
      return (
        <DashboardScreen
          onNavigate={this.props.onNavigate || (() => {})}
          haptic={this.props.haptic || (async () => {})}
          onOpenProfile={this.props.onOpenProfile}
        />
      );
    }
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, color: colors.textIce }}>
        <div style={{ maxWidth: 320, textAlign: 'center', padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Page indisponible</div>
          <div style={{ fontSize: 12, color: colors.textSub, marginBottom: 14 }}>La page a rencontré une donnée inattendue. Réessayez ou retournez au clavier.</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ border: 0, borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#fff', background: colors.lemtelBlue, marginRight: 8 }}
          >Réessayer</button>
          <button
            onClick={this.props.onRecover}
            style={{ border: 0, borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 800, color: colors.textIce, background: 'rgba(255,255,255,0.12)' }}
          >Clavier</button>
        </div>
      </div>
    );
  }
}

/* ─── Top header with hamburger dropdown + actions ─────────────────────── */
function TopHeader({
  tab, onNavigate, haptic, creds, onOpenProfile,
}: { tab: Tab; onNavigate: (t: Tab) => void; haptic: (s?: ImpactStyle) => Promise<void>; creds: Creds; onOpenProfile: () => void }) {
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { mode, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang, t: tr } = useT();
  const [presence, setPresence] = useState<{ status: string; color: string }>({ status: 'available', color: '#22c55e' });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!creds?.accessToken || !creds?.userId) return;
    let cancelled = false;
    const STATUS_COLORS: Record<string, string> = {
      available: '#22c55e', busy: '#f59e0b', on_call: '#3b82f6', meeting: '#8b5cf6',
      lunch: '#f97316', break: '#14b8a6', dnd: '#ef4444', away: '#94a3b8',
      out_of_office: '#6366f1', offline: '#64748b',
    };
    (async () => {
      try {
        const [{ data: pres }, { data: prof }] = await Promise.all([
          supabase.from('user_presence').select('status').eq('user_id', creds.userId!).maybeSingle(),
          supabase.from('profiles').select('avatar_url').eq('id', creds.userId!).maybeSingle(),
        ]);
        if (cancelled) return;
        const s = (pres?.status as string) || 'available';
        setPresence({ status: s, color: STATUS_COLORS[s] || '#22c55e' });
        if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
      } catch {}
    })();
    const ch = supabase.channel(`presence-self-${creds.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${creds.userId}` }, (payload: any) => {
        const s = payload?.new?.status || 'available';
        setPresence({ status: s, color: STATUS_COLORS[s] || '#22c55e' });
      })
      .subscribe();
    return () => { cancelled = true; try { supabase.removeChannel(ch); } catch {} };
  }, [creds?.accessToken, creds?.userId]);

  const initials = (creds?.email || creds?.extension || 'U').slice(0, 2).toUpperCase();
  const titles: Partial<Record<Tab, string>> = {
    contacts: tr('tabs.contacts' as any),
    chats: tr('tabs.chats' as any),
    calls: tr('tabs.calls' as any),
    keypad: tr('tabs.keypad' as any),
    speeddial: tr('tabs.speeddial' as any),
    settings: tr('tabs.settings' as any),
    home: tr('tabs.home' as any),
  };
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: 'home',     label: tr('tabs.home' as any),     icon: '🏠' },
    { id: 'contacts', label: tr('tabs.contacts' as any), icon: '👤' },
    { id: 'chats',    label: tr('tabs.chats' as any),    icon: '💬' },
    { id: 'calls',    label: tr('tabs.calls' as any),    icon: '📞' },
    { id: 'keypad',   label: tr('tabs.keypad' as any),   icon: '⌨️' },
    { id: 'settings', label: tr('tabs.settings' as any), icon: '⚙️' },
  ];

  const iconBtn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: colors.textIce, WebkitTapHighlightColor: 'transparent',
    padding: 0,
  };

  return (
    <header style={{ position: 'relative', padding: '8px 12px 6px' }}>
      {/* Centered logo at the very top of every page */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 36 }}>
        <img
          src="/ava-logo.png"
          alt="AVA"
          width={32}
          height={32}
          style={{ width: 32, height: 32, borderRadius: 8, boxShadow: `0 6px 18px -8px ${colors.lemtelBlue}` }}
        />
      </div>

      {/* Title row: hamburger | title | (lang, theme, bell) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 4, minHeight: 48,
      }}>
        <button
          onClick={() => { haptic(ImpactStyle.Light); setOpen((v) => !v); }}
          aria-label="Open menu"
          style={{
            position: 'relative',
            width: 44, height: 44, borderRadius: 12,
            background: open ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: 'none', display: 'grid', placeItems: 'center',
            cursor: 'pointer', color: colors.textIce,
            WebkitTapHighlightColor: 'transparent', padding: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="4" y1="7"  x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="14" y2="17" />
          </svg>
          <span style={{
            position: 'absolute', right: 6, top: 6, width: 8, height: 8,
            borderRadius: '50%', background: colors.lemtelBlue,
          }} />
        </button>

        <span style={{
          flex: 1, marginLeft: 4,
          fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
          letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {titles[tab] || ''}
        </span>

        <button
          onClick={() => { haptic(ImpactStyle.Light); onOpenProfile(); }}
          aria-label="Profile and status"
          title={`Profile · ${presence.status.replace('_', ' ')}`}
          style={{
            position: 'relative', width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
            color: colors.textIce, WebkitTapHighlightColor: 'transparent', padding: 0,
            overflow: 'hidden',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>{initials}</span>
          )}
          <span style={{
            position: 'absolute', right: -1, bottom: -1, width: 11, height: 11,
            borderRadius: '50%', background: presence.color,
            boxShadow: '0 0 0 2px rgba(8,12,30,0.92)',
          }} />
        </button>
        <button
          onClick={() => { haptic(ImpactStyle.Light); toggleLang(); }}
          aria-label="Switch language"
          title="Switch language"
          style={{ ...iconBtn, gap: 4, width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}
        >
          <Globe size={14} />
          <span style={{ textTransform: 'uppercase' }}>{lang}</span>
        </button>
        <button
          onClick={() => { haptic(ImpactStyle.Light); toggleTheme(); }}
          aria-label="Toggle theme"
          title="Toggle theme"
          style={iconBtn}
        >
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          onClick={() => { haptic(ImpactStyle.Light); setNotifOpen(true); }}
          aria-label="Notifications"
          title="Notifications"
          style={iconBtn}
        >
          <Bell size={16} />
        </button>
      </div>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'transparent' }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute', top: 92, left: 12, zIndex: 71,
              minWidth: 220, padding: 6,
              borderRadius: 14,
              background: 'rgba(20,28,52,0.96)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {items.map((it) => {
              const active = tab === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => { setOpen(false); onNavigate(it.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '10px 12px',
                    borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: active ? 'rgba(0,120,255,0.18)' : 'transparent',
                    color: active ? '#7ab8ff' : colors.textIce,
                    fontSize: 15, fontWeight: active ? 700 : 500,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{it.icon}</span>
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <NotificationsSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onNavigate={(t) => { setNotifOpen(false); onNavigate(t); }}
      />
    </header>
  );
}



