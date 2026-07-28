// Android SIP hook — uses FreeSWITCH Verto (port 8082) instead of JsSIP/WSS.
//
// Media flows through FreeSWITCH server-side, so no TURN is required — this
// unblocks calls on carriers (Bell Canada) that filter TURN DNS.
//
// Exposes the same UseSoftphoneReturn surface as useSoftphoneJsSip so the
// rest of the app (DialerScreen, ActiveCallSheet, SipDebugPanel, …) doesn't
// need to know which transport is active.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { SIPConfig } from '../lib/sip/jssipProvider';
import type { UseSoftphoneReturn, SIPStatus, CallState } from './useSoftphone';
import {
  appendSipLog, clearSipLog as clearPersistedLog, clearPersistedStatus, loadPersistedError,
  loadPersistedStatus, loadSipLog, savePersistedError, savePersistedStatus, SipLogEntry, PersistedSipError,
} from '../lib/sip/sipPersistence';
import { EMPTY_QUALITY, CallQuality } from '../lib/sip/callQuality';
import { AudioProfile, loadAudioProfile, saveAudioProfile } from '../lib/sip/audioProfile';
import { attachRemoteStream, toggleSpeaker } from '../lib/sip/audioOutput';
import { initVerto, getVertoClient, VertoDialog, VertoEvent } from '../lib/sip/vertoProvider';
import { normalizePhone } from '../lib/phoneNormalize';
import { attachNativeAutoReconnect } from '../lib/sip/nativeAutoReconnect';
import {
  getAndroidSipServiceStatus,
  onAndroidSipServiceStatus,
  onAndroidVertoServerMessage,
  answerAndroidNativeCall,
  hangupAndroidNativeCall,
  requestAndroidBatteryOptimizationExemption,
  startAndroidSipService,
  type AndroidSipServiceStatus,
} from '../lib/sip/nativeSipProvider';

/** Default Verto port used by FreeSWITCH. */
const DEFAULT_VERTO_PORT = 8082;

/**
 * Derive the Verto WebSocket host and port from the SIPConfig.
 *
 * Priority order:
 *  1. config.vertoHost / config.vertoPort  (explicit override)
 *  2. Hostname extracted from config.wssUrl (same server, port replaced with vertoPort)
 *  3. config.server (TCP SIP hint, often the same host)
 *  4. config.domain (SIP domain — may differ from the WS host, last resort)
 *
 * This ensures the app works on any PBX/domain without hardcoded values.
 */
function resolveVertoEndpoint(config: SIPConfig): { host: string; port: number } {
  const port = config.vertoPort ?? DEFAULT_VERTO_PORT;
  if (config.vertoHost) return { host: config.vertoHost, port };
  // Extract hostname from wssUrl: "wss://pbxnode.example.com:7443" → "pbxnode.example.com"
  if (config.wssUrl) {
    try {
      const url = new URL(config.wssUrl);
      if (url.hostname) return { host: url.hostname, port };
    } catch { /* ignore malformed URL */ }
  }
  if (config.server) return { host: config.server, port };
  return { host: config.domain, port };
}

export function useSoftphoneVerto(config: SIPConfig | null): UseSoftphoneReturn {
  // Restore the last known status from storage so the UI never flashes 'idle'
  // on first render while hydration / Verto connect is still in progress.
  // 'registered' will be re-confirmed by initVerto; 'connecting'/'retrying'
  // are safe to show while reconnecting.
  const [sipStatus, setSipStatusState] = useState<SIPStatus>(() => {
    const persisted = loadPersistedStatus() as SIPStatus | null;
    if (persisted && persisted !== 'idle' && persisted !== 'error') return persisted;
    return 'idle';
  });
  const [sipError, setSipError] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [activeCallNumber, setActiveCallNumber] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerNumber, setCallerNumber] = useState('');
  const [lastPersistedError, setLastPersistedError] = useState<PersistedSipError | null>(() => loadPersistedError());
  const [sipLog, setSipLog] = useState<SipLogEntry[]>(() => loadSipLog());
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [audioProfile, setAudioProfileState] = useState<AudioProfile>(() => loadAudioProfile() || 'auto');
  const [androidSipServiceStatus, setAndroidSipServiceStatus] = useState<AndroidSipServiceStatus | null>(null);

  const activeDialogRef = useRef<VertoDialog | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef<SIPConfig | null>(config);
  const nativeInviteCallIdRef = useRef<string | null>(null);
  const nativeAnswerRequestedCallIdRef = useRef<string | null>(null);
  // Tracks calls already answered natively so the JS adoptNativeInboundInvite
  // loop does NOT send a second verto.answer after the native path already did.
  const nativeAnsweredCallIdRef = useRef<string | null>(null);
  // Mirror of androidSipServiceStatus as a ref so answer() / hangup() can
  // read the latest native state synchronously without stale closure issues.
  const androidSipServiceStatusRef = useRef<AndroidSipServiceStatus | null>(null);
  configRef.current = config;

  const log = useCallback((event: string, details?: any) => {
    const entry: SipLogEntry = {
      event,
      time: Date.now(),
      level: 'info',
      detail: details ? JSON.stringify(details) : undefined,
    };
    const next = appendSipLog(entry);
    setSipLog(next);
  }, []);

  const setStatus = useCallback((next: SIPStatus, err?: string) => {
    setSipStatusState(next);
    savePersistedStatus(next);
    if (err !== undefined) setSipError(err);
    if (next === 'error' && err) {
      const cfg = configRef.current;
      const persisted: PersistedSipError = {
        error: err,
        extension: cfg?.extension || '',
        domain: cfg?.domain || '',
        time: Date.now(),
      };
      savePersistedError(persisted);
      setLastPersistedError(persisted);
    }
    if (next === 'registered') {
      setSipError('');
    }
  }, []);

  const applyNativeStatus = useCallback((native: AndroidSipServiceStatus | null, source = 'event') => {
    if (!native) return;
    setAndroidSipServiceStatus(native);
    androidSipServiceStatusRef.current = native;
    log(source === 'poll' ? 'verto.native.poll' : 'verto.native.status', {
      status: native.status,
      reason: native.reason,
      loggedIn: native.loggedIn,
      wake: native.wakeLockHeld,
      wifi: native.wifiLockHeld,
      attempt: native.reconnectAttempt,
    });

    const nativeStatus = String(native.status || '').toLowerCase();
    if (nativeStatus === 'incoming') {
      const caller = native.callerNumber || native.callerName || native.reason || '';
      setStatus('registered');
      if (caller) setActiveCallNumber(caller);
      if (native.callerName) setCallerName(native.callerName);
      if (native.callerNumber) setCallerNumber(native.callerNumber);
      setCallState('ringing-in');
      const rawInvite = native.inviteParams;
      const inviteParams = typeof rawInvite === 'string'
        ? (() => { try { return rawInvite ? JSON.parse(rawInvite) : null; } catch { return null; } })()
        : rawInvite;
      const callID = inviteParams?.callID || native.callId;
      const shouldAnswer = native.reason === 'answer_requested' && callID && nativeAnswerRequestedCallIdRef.current !== callID;
      console.log('[verto] native incoming inviteParams present:', !!inviteParams?.sdp, 'callId:', callID, 'reason:', native.reason);
      if (inviteParams?.sdp && callID && nativeInviteCallIdRef.current !== callID) {
        nativeInviteCallIdRef.current = callID;
        // Pre-warm the inbound dialog IMMEDIATELY (getUserMedia + ICE) so the
        // SDP is ready by the time the user taps Answer. This runs in parallel
        // with the Verto WebSocket login, eliminating the 3-5 s delay.
        try { getVertoClient().preWarmInboundDialog(inviteParams); } catch { /* ignore */ }
        // Retry adoption in case the Verto WebSocket hasn't finished
        // logging in yet (app just launched from a notification tap).
        (async () => {
          for (let i = 0; i < 5; i++) {
            try {
              const client = getVertoClient();
              if (client?.isConnected?.()) {
                const dialog = await client.adoptNativeInboundInvite(
                  inviteParams,
                  async (sdp, dialogParams) => { await answerAndroidNativeCall(sdp, dialogParams); },
                  async () => { await hangupAndroidNativeCall(); },
                );
                if (dialog) {
                  activeDialogRef.current = dialog;
                  // Only answer via JS if the native path has NOT already answered.
                  // nativeAnsweredCallIdRef is set when the native service emits 'active'.
                  const alreadyAnsweredNatively = nativeAnsweredCallIdRef.current === callID;
                  // Also check if the user already tapped Answer (Path B in answer()):
                  // nativeAnswerRequestedCallIdRef is set by answer() when the dialog
                  // was not yet ready, so we must answer now that it is.
                  const userAlreadyTappedAnswer = nativeAnswerRequestedCallIdRef.current === callID;
                  if ((shouldAnswer || userAlreadyTappedAnswer) && !alreadyAnsweredNatively) {
                    nativeAnswerRequestedCallIdRef.current = callID;
                    dialog.answer();
                  }
                }
                return;
              }
            } catch (e: any) {
              log('verto.native.adopt.error', { message: e?.message || String(e), attempt: i });
            }
            await new Promise((r) => setTimeout(r, 300));
          }
          console.warn('[verto] adoptNativeInboundInvite: client not connected after retries');
        })();
      } else if (shouldAnswer && activeDialogRef.current && nativeAnsweredCallIdRef.current !== callID) {
        nativeAnswerRequestedCallIdRef.current = callID;
        activeDialogRef.current.answer();
      }
      return;
    }
    if (nativeStatus !== 'incoming') {
      nativeInviteCallIdRef.current = null;
      nativeAnswerRequestedCallIdRef.current = null;
    }
    if (nativeStatus === 'active') {
      setStatus('registered');
      setCallState((prev) => (prev === 'idle' ? 'active' : prev === 'ringing-in' ? 'active' : prev));
      // Mark this call as natively answered so the JS adoptNativeInboundInvite
      // loop does not send a redundant second verto.answer.
      if (native.callId) nativeAnsweredCallIdRef.current = native.callId;
      return;
    }
    if (nativeStatus === 'sdp_refresh_needed') {
      // The Kotlin service detected that the cached SDP is stale (> 3s old).
      // Force the JS vertoProvider to regenerate fresh ICE candidates by
      // resetting the __pendingAnswerTs timestamp to 0 on the active dialog.
      const callID = native.reason || native.callId;
      console.log('[verto] sdp_refresh_needed received for callID:', callID, '— resetting SDP timestamp');
      try {
        const client = getVertoClient();
        if (client && callID) {
          // Access the internal dialog record and reset the timestamp
          // so answerInbound() will regenerate the SDP
          (client as any).dialogs?.forEach?.((rec: any, id: string) => {
            if (id === callID && rec.wrapped) {
              (rec.wrapped as any).__pendingAnswerTs = 0;
              console.log('[verto] SDP timestamp reset for callID:', callID);
            }
          });
        }
      } catch (e) {
        console.warn('[verto] sdp_refresh_needed handler error:', e);
      }
      return;
    }
    if (nativeStatus === 'idle') {
      nativeAnsweredCallIdRef.current = null;
      nativeInviteCallIdRef.current = null;
      nativeAnswerRequestedCallIdRef.current = null;
      setCallState((prev) => {
        // Reset on any non-idle call state — including 'ended' which can get
        // stuck if the 800ms setTimeout in hangup() fires after a new call starts.
        if (prev === 'active' || prev === 'ringing-in' || prev === 'ringing-out' || prev === 'ended') {
          console.log('[verto] native idle received — resetting call state from', prev);
          setActiveCallNumber('');
          setCallerName('');
          setCallerNumber('');
          setIsMuted(false);
          setIsOnHold(false);
          activeDialogRef.current = null;
          return 'idle';
        }
        return prev;
      });
    }
    if (native.loggedIn || nativeStatus === 'registered' || nativeStatus === 'incoming') {
      setStatus('registered');
      return;
    }
    if (nativeStatus === 'connecting') {
      setStatus('connecting', native.reason || undefined);
      return;
    }
    if (nativeStatus === 'reconnecting' || nativeStatus === 'disconnected') {
      setStatus('retrying', native.reason || 'Native Verto reconnecting');
      return;
    }
    if (nativeStatus === 'error') {
      setStatus('error', native.reason || 'Native Verto service error');
    }
  }, [log, setStatus]);

  // ── Connect / register lifecycle ────────────────────────────────────────
  useEffect(() => {
    if (!config?.extension || !config?.password) {
      // Don't override a meaningful persisted status (e.g. 'connecting') while
      // hydration is still in progress — only reset to idle if we were already idle.
      if (sipStatus === 'idle') {
        console.log('[Verto] no config — staying idle');
      } else {
        console.log('[Verto] no config yet — keeping status:', sipStatus);
      }
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    // Resolve host/port dynamically from config — no hardcoded values.
    const { host: vertoHost, port: vertoPort } = resolveVertoEndpoint(config);
    console.log('[Verto] connecting to', vertoHost + ':' + vertoPort, 'ext=', config.extension);
    log('verto.connecting', { host: vertoHost, port: vertoPort, ext: config.extension });

    // Start the Android foreground service BEFORE opening the WebSocket so
    // WakeLock + WifiLock are held throughout register (and beyond). Keep it
    // running for the full lifetime of the hook — stopping it releases the
    // WakeLock and lets Doze mode kill the socket, which is exactly why the
    // app went 'unregistered' when the screen locked.
    startAndroidSipService({
      host: vertoHost,
      port: vertoPort,
      login: config.extension,
      password: config.password,
      domain: config.domain,
      displayName: config.displayName || config.extension,
    }).then((native) => applyNativeStatus(native, 'start')).catch(() => { /* ignore on non-Android */ });

    (async () => {
      try {
        await initVerto({
          host: vertoHost,
          port: vertoPort,
          login: config.extension,
          password: config.password,
          domain: config.domain,
          caller_id_name: config.displayName || config.extension,
          caller_id_number: config.extension,
        });
        if (cancelled) return;
        console.log('[Verto] registered ✅ ext=', config.extension);
        log('verto.registered');
        setStatus('registered');
        setRetryAttempt(0);
        // Start foreground service with native Kotlin WebSocket that maintains
        // Verto registration independently of the WebView — survives screen-off,
        // background throttling, and JS timer suspension on Android.
        startAndroidSipService({
          host: vertoHost,
          port: vertoPort,
          login: config.extension,
          password: config.password,
          domain: config.domain,
          displayName: config.displayName || config.extension,
        }).then((native) => applyNativeStatus(native, 'start')).catch(() => { /* ignore on non-Android */ });
        requestAndroidBatteryOptimizationExemption().catch(() => { /* ignore on non-Android */ });
      } catch (e: any) {

        if (cancelled) return;
        const msg = e?.message || 'Verto connection failed';
        console.error('[Verto] connection error:', msg);
        log('verto.error', { message: msg });
        setStatus('error', msg);
        // Auto-retry with exponential backoff: 5s → 10s → 20s → 30s (max).
        // This ensures ALL users register reliably even on slow/flaky networks
        // or when the server is temporarily overloaded (SQLite BUSY).
        setRetryAttempt((prev) => {
          const attempt = prev + 1;
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
          console.log(`[Verto] auto-retry in ${delay}ms (attempt ${attempt})`);
          setTimeout(() => {
            if (!cancelled) reconnect();
          }, delay);
          return attempt;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config?.extension, config?.password, config?.refreshNonce, log, setStatus]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    onAndroidSipServiceStatus((native) => {
      if (!cancelled) applyNativeStatus(native, 'event');
    }).then((fn) => { cleanup = fn; }).catch(() => {});

    const poll = setInterval(() => {
      getAndroidSipServiceStatus()
        .then((native) => { if (!cancelled && native) applyNativeStatus(native, 'poll'); })
        .catch((e) => log('verto.native.error', { message: e?.message || String(e) }));
    }, 15000);

    getAndroidSipServiceStatus()
      .then((native) => { if (!cancelled && native) applyNativeStatus(native, 'poll'); })
      .catch(() => {});

    return () => {
      cancelled = true;
      clearInterval(poll);
      cleanup?.();
    };
  }, [applyNativeStatus, log]);

  // Ask the OS for battery-optimization exemption as soon as the hook mounts
  // (not only after a successful JS connect). Without this, Doze can kill the
  // foreground service before the first REGISTER even completes, and incoming
  // calls silently go to voicemail.
  useEffect(() => {
    requestAndroidBatteryOptimizationExemption().catch(() => {});
  }, []);

  // Bridge: relay raw Verto server messages from the Kotlin WebSocket to the
  // JS VertoClient. When the native socket reconnects to send verto.answer,
  // FreeSWITCH sends the answer SDP and subsequent verto.bye back on that
  // Kotlin socket — not the JS WebSocket. Without this relay, the
  // RTCPeerConnection never gets setRemoteDescription and the UI never
  // receives the hangup event.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    onAndroidVertoServerMessage((rawJson) => {
      if (cancelled) return;
      try {
        const client = getVertoClient();
        if (client) {
          client.injectServerMessage(rawJson);
        } else {
          console.warn('[verto] injectServerMessage: no active VertoClient');
        }
      } catch (e) {
        console.warn('[verto] injectServerMessage error:', e);
      }
    }).then((fn) => { unsubscribe = fn; }).catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (state) => {
      if (cancelled) return;
      if (state.isActive) {
        log('verto.app.foreground.sync');
        getAndroidSipServiceStatus().then((native) => applyNativeStatus(native, 'poll')).catch(() => {});
      } else {
        log('verto.app.background.native-hold');
      }
    })).then((handle) => { cleanup = () => { handle.remove().catch(() => {}); }; }).catch(() => {});
    return () => { cancelled = true; cleanup?.(); };
  }, [applyNativeStatus, log]);

  // ── Verto event stream → local state ────────────────────────────────────
  useEffect(() => {
    const client = getVertoClient();
    const off = client.on((e: VertoEvent) => {
      switch (e.type) {
        case 'registered':
          setStatus('registered');
          break;
        case 'disconnected':
          log('verto.disconnected', { reason: e.reason });
          if (androidSipServiceStatus?.loggedIn || androidSipServiceStatus?.status === 'registered') {
            log('verto.disconnected.native-held', { reason: e.reason });
            setStatus('registered');
          } else {
            setStatus('retrying', 'WebSocket disconnected');
          }
          // Keep the foreground service RUNNING so WakeLock/WifiLock stay
          // held while the Verto client auto-reconnects. Stopping the
          // service here was letting Android Doze mode kill the socket and
          // block reconnection until the app was re-opened.
          break;

        case 'error':
          log('verto.error', { message: e.error });
          setStatus('error', e.error);
          break;
        case 'incoming':
          activeDialogRef.current = e.dialog;
          setActiveCallNumber(e.from);
          setCallerNumber(e.from);
          if ((e as any).fromName) setCallerName((e as any).fromName);
          setCallState('ringing-in');
          log('verto.incoming', { from: e.from });
          break;
        case 'progress':
          setCallState((prev) => prev === 'ringing-in' ? prev : 'ringing-out');
          break;
        case 'answered':
          activeDialogRef.current = e.dialog;
          setCallState('active');
          setCallTimer(0);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
          log('verto.answered', { callID: e.dialog.callID });
          break;
        case 'media':
          try { attachRemoteStream(e.stream); } catch (err) { console.warn('[verto] attach remote stream failed', err); }
          break;
        case 'hangup':
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          activeDialogRef.current = null;
          setCallState('ended');
          setIsMuted(false);
          setIsOnHold(false);
          setActiveCallNumber('');
          log('verto.hangup', { cause: e.cause });
          setTimeout(() => setCallState('idle'), 800);
          break;
      }
    });
    return () => { off(); };
  }, [androidSipServiceStatus, log, setStatus]);

  // ── Actions ────────────────────────────────────────────────────────────
  const call = useCallback((number: string): boolean => {
    const cfg = configRef.current;
    if (!cfg?.extension) return false;
    // Only normalize external PSTN numbers (10+ digits or +E.164).
    // Internal extensions (3-4 digits) and star feature codes (*97, *72, *0…)
    // must be passed through untouched — normalizePhone would strip `*` and
    // return null for short numbers, breaking feature codes entirely.
    const digitsOnly = number.replace(/\D/g, '');
    const isExternal = /^\+/.test(number) || digitsOnly.length >= 10;
    const normalized = isExternal ? (normalizePhone(number) || number) : number;
    console.log('[verto][DIAG] call() normalizing:', number, '->', normalized, 'external=', isExternal);
    // vertoProvider.call() handles getUserMedia internally with a silent-track
    // fallback for emulators. A pre-flight getUserMedia here would cause a
    // double mic acquisition which corrupts the WebRTC audio send stream
    // (min_bitrate_bps=-1 / max_bitrate_bps=-1) and causes immediate hang-up.
    getVertoClient().call(normalized, cfg.displayName || cfg.extension, cfg.extension)
      .then((d) => {
        if (d) {
          activeDialogRef.current = d;
          setActiveCallNumber(number);
          setCallState('ringing-out');
          log('verto.call.out', { to: number, callID: d.callID });
        } else {
          setSipError('Verto refused to place the call');
        }
      })
      .catch((err: any) => {
        const msg = err?.message || 'Call failed';
        log('verto.call.error', { message: msg });
        setSipError(msg);
      });
    return true;
  }, [log]);

  const hangup = useCallback(() => {
    const d = activeDialogRef.current;
    // On Android, ALWAYS send verto.bye via the native WebSocket first.
    // The JS WebSocket may be disconnected (screen-off, doze mode, background
    // throttling), in which case rpc('verto.bye') would be silently dropped.
    // The native Kotlin WebSocket in SipConnectionService is always alive.
    if (Capacitor.getPlatform() === 'android') {
      hangupAndroidNativeCall().catch(() => { /* ignore */ });
    }
    // Also hang up the JS dialog so the JS-side verto.bye is sent as a
    // belt-and-suspenders fallback in case the native path misses it.
    if (d) { try { d.hangup(); } catch { /* ignore */ } }
    else { try { getVertoClient().hangupAll(); } catch { /* ignore */ } }
    activeDialogRef.current = null;
    // Clear native invite tracking so a stale re-invite from the same
    // callID doesn't accidentally re-adopt after we've hung up.
    nativeInviteCallIdRef.current = null;
    nativeAnswerRequestedCallIdRef.current = null;
    nativeAnsweredCallIdRef.current = null;

    // Immediately reset local call state so the UI doesn't freeze waiting
    // for a server-side hangup event that may never arrive on flaky networks.
    setCallState('ended');
    setIsMuted(false);
    setIsOnHold(false);
    setActiveCallNumber('');
    setCallerName('');
    setCallerNumber('');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimeout(() => setCallState('idle'), 800);

    // Safety watchdog: if for any reason callState is still active/ringing
    // 3s after hangup was requested, force it to idle so the ActiveCallSheet
    // never gets stuck on flaky networks.
    setTimeout(() => {
      setCallState((prev) =>
        (prev === 'active' || prev === 'ringing' || prev === 'ringing-in' || prev === 'ringing-out')
          ? 'idle' : prev
      );
    }, 3000);
  }, []);

  const answer = useCallback(async () => {
    if (Capacitor.getPlatform() === 'android') {
      const d = activeDialogRef.current as any;
      // Path A: dialog already adopted — use its pre-gathered SDP.
      if (d?.__pendingAnswer) {
        try {
          await answerAndroidNativeCall(d.__pendingAnswer, d.__params || {});
          setCallState('active');
          return;
        } catch (e) {
          console.warn('[verto] native answer (path A) failed:', e);
        }
      }
      // Path B: dialog not yet adopted (adoptNativeInboundInvite still running).
      // The native service CANNOT generate a WebRTC answer SDP — only the JS
      // WebRTC stack can. Set nativeAnswerRequestedCallIdRef so the adoption
      // loop calls dialog.answer() immediately when __pendingAnswer is ready
      // (typically within 500ms of ICE gathering completing).
      const nativeStatus = androidSipServiceStatusRef.current;
      const rawInvite = nativeStatus?.inviteParams;
      const inviteParams = typeof rawInvite === 'string'
        ? (() => { try { return rawInvite ? JSON.parse(rawInvite) : null; } catch { return null; } })()
        : rawInvite;
      const pendingCallID = inviteParams?.callID || nativeStatus?.callId;
      if (pendingCallID) {
        // Flag this callID so adoptNativeInboundInvite answers immediately
        // when the WebRTC dialog is ready (avoids the 2-3 s wait).
        nativeAnswerRequestedCallIdRef.current = pendingCallID;
        console.log('[verto] answer() Path B: flagged callID for deferred answer:', pendingCallID);
        // Optimistically show active state — audio connects within ~500ms.
        setCallState('active');
        return;
      }
      // Path C: last resort — call answer on existing dialog if available.
      if (d) { try { d.answer(); } catch { /* ignore */ } }
      return;
    }
    activeDialogRef.current?.answer();
  }, []);

  const setNativeStatusDirectly = useCallback((native: AndroidSipServiceStatus) => {
    applyNativeStatus(native, 'direct');
  }, [applyNativeStatus]);

  const mute = useCallback(() => {
    const d = activeDialogRef.current;
    if (d) { try { d.mute(); } catch { /* ignore */ } }
    setIsMuted(true);
  }, []);
  const unmute = useCallback(() => {
    const d = activeDialogRef.current;
    if (d) { try { d.unmute(); } catch { /* ignore */ } }
    setIsMuted(false);
  }, []);
  const hold = useCallback(() => { activeDialogRef.current?.hold(); setIsOnHold(true); }, []);
  const unhold = useCallback(() => { activeDialogRef.current?.unhold(); setIsOnHold(false); }, []);
  const sendDTMF = useCallback((k: string) => { activeDialogRef.current?.dtmf(k); }, []);

  const transfer = useCallback((target: string) => {
    const d = activeDialogRef.current;
    if (d) { try { d.transfer(target); } catch { /* ignore */ } }
  }, []);

  const toggleSpeakerFn = useCallback(async () => {
    try { await toggleSpeaker(); } catch (e) { console.warn('[verto] toggleSpeaker failed', e); }
  }, []);

  const setStatusPresence = useCallback((_s: string) => { /* presence not wired to Verto */ }, []);
  const reconnect = useCallback(() => {
    if (!configRef.current) return;
    log('verto.reconnect');
    setRetryAttempt((a) => a + 1);
    // Trigger re-connect by nudging status; the connect effect re-runs when
    // refreshNonce changes upstream. Here we simply try a fresh connect.
    getVertoClient().disconnect();
    setStatus('connecting');
    const { host: rHost, port: rPort } = resolveVertoEndpoint(configRef.current);
    initVerto({
      host: rHost,
      port: rPort,
      login: configRef.current.extension,
      password: configRef.current.password,
      domain: configRef.current.domain,
      caller_id_name: configRef.current.displayName || configRef.current.extension,
      caller_id_number: configRef.current.extension,
    }).then(() => setStatus('registered')).catch((e) => setStatus('error', e?.message));
  }, [log, setStatus]);

  // ── WiFi ↔ LTE handover: re-register Verto when network changes ────────────
  // nativeAutoReconnect listens to @capacitor/network networkStatusChange and
  // App appStateChange events. When the network changes (e.g. WiFi → LTE),
  // it calls reconnect() after a debounce so the Verto WebSocket is re-opened
  // on the new interface. This prevents silent call drops on network handover.
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    attachNativeAutoReconnect(() => {
      console.log('[Verto] network/app-state change → reconnecting');
      reconnectRef.current();
    }).then((fn) => { cleanup = fn; }).catch(() => {});
    return () => { cleanup?.(); };
  }, []); // run once on mount

  const clearSipLog = useCallback(() => { clearPersistedLog(); setSipLog([]); }, []);
  const clearSipState = useCallback(() => {
    clearPersistedStatus();
    setLastPersistedError(null);
    setSipError('');
  }, []);

  const setAudioProfile = useCallback((p: AudioProfile) => {
    setAudioProfileState(p);
    saveAudioProfile(p);
  }, []);

  return useMemo<UseSoftphoneReturn>(() => ({
    sipStatus, sipError, callState, callTimer, isMuted, isOnHold, activeCallNumber,
    call, hangup, answer, mute, unmute, hold, unhold, sendDTMF,
    setStatus: setStatusPresence, reconnect,
    lastPersistedError, sipLog, clearSipLog, clearSipState,
    retryAttempt, nextRetryAt: null, retryLimitReached: false,
    quality: EMPTY_QUALITY as CallQuality,
    audioProfile, setAudioProfile,
    offeredCodecs: ['opus/48000/2', 'PCMU/8000'],
    negotiatedCodec: callState === 'active' ? 'opus/48000/2' : null,
    transfer,
    transferCall: transfer,
    addCall: toggleSpeakerFn, // speaker toggle exposed via addCall slot for Android
    androidSipServiceStatus,
    setNativeStatusDirectly,
    callerName,
    callerNumber,
  } as any), [
    sipStatus, sipError, callState, callTimer, isMuted, isOnHold, activeCallNumber,
    call, hangup, answer, mute, unmute, hold, unhold, sendDTMF, setStatusPresence, reconnect,
    lastPersistedError, sipLog, clearSipLog, clearSipState, retryAttempt,
    audioProfile, setAudioProfile, transfer, toggleSpeakerFn, androidSipServiceStatus,
    setNativeStatusDirectly, callerName, callerNumber,
  ]);
}
