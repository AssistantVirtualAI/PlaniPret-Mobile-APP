/**
 * useSoftphoneNative — Native PJSIP-backed implementation of UseSoftphoneReturn.
 *
 * Activated when VITE_NATIVE_SIP=true. Provides the same surface as the
 * JsSIP-based `useSoftphone` hook so the rest of the app is unchanged.
 * Many advanced fields (sipLog, retries, quality sampler) are stubbed for now
 * and will be enriched once the Swift/Kotlin plugin emits richer events.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SIPConfig } from '../lib/sip/jssipProvider';
import { Capacitor } from '@capacitor/core';
import { CapacitorPjsip, onNativeSipEvent, getIosSipServiceStatus } from '../lib/sip/nativeSipProvider';

import { EMPTY_QUALITY, type CallQuality } from '../lib/sip/callQuality';
import { loadAudioProfile, saveAudioProfile, type AudioProfile } from '../lib/sip/audioProfile';
import { startNativeSipTracking, setNativeRegStatus } from '../lib/sip/nativeSipState';
import { notifySipDispatcherLoaded } from '../lib/sip/bootSipGuard';
import { attachNativeAutoReconnect } from '../lib/sip/nativeAutoReconnect';
import { startRingback, stopRingback, describeEndReason } from '../lib/sip/ringback';
import type { UseSoftphoneReturn, SIPStatus, CallState } from './useSoftphone';

type NativeCallDirection = 'in' | 'out' | null;
export type CallPhase = 'idle' | 'dialing' | 'ringing' | 'early-media' | 'active' | 'ended';
type NativeCallSnapshot = {
  callState: CallState;
  activeCallNumber: string;
  callerName: string;
  callerNumber: string;
  isMuted: boolean;
  isOnHold: boolean;
  isRecording: boolean;
  direction: NativeCallDirection;
  endReason: string | null;
  callPhase: CallPhase;
  lastSipCode: string | null;
};

const nativeCallSubscribers = new Set<(snapshot: NativeCallSnapshot) => void>();
let nativeCallSnapshot: NativeCallSnapshot = {
  callState: 'idle',
  activeCallNumber: '',
  callerName: '',
  callerNumber: '',
  isMuted: false,
  isOnHold: false,
  isRecording: false,
  direction: null,
  endReason: null,
  callPhase: 'idle',
  lastSipCode: null,
};
let nativeCallBridgePromise: Promise<void> | null = null;

// Module-level singleton guard: prevents duplicate SIP registrations even
// across React re-mounts / StrictMode / multiple hook consumers.
let _registeredKey: string | null = null;
let _initInFlightKey: string | null = null;
let _lastConfig: SIPConfig | null = null;

/**
 * Force a re-registration from outside the hook (e.g. diagnostics panel).
 * Clears the singleton guard so the next initAccount actually runs.
 */
export async function forceNativeReconnect(): Promise<void> {
  if (!_lastConfig) return;
  const cfg = _lastConfig;
  try { await CapacitorPjsip.disconnect(); } catch {}
  _registeredKey = null;
  _initInFlightKey = null;
  try {
    await CapacitorPjsip.initAccount({
      extension: cfg.extension,
      username: (cfg as any).authUsername || cfg.extension,
      domain: cfg.domain,
      password: cfg.password,
      server: (cfg as any).server,
      port: (cfg as any).port,
      transport: (cfg as any).transport,
      wssUrl: cfg.wssUrl,
    });
    _registeredKey = `${cfg.extension}@${cfg.domain}|${cfg.password}|${cfg.wssUrl ?? ''}`;
  } catch (e) {
    console.warn('[NativeSIP] forceNativeReconnect failed', e);
  }
}

function emitNativeCallSnapshot(patch: Partial<NativeCallSnapshot>) {
  nativeCallSnapshot = { ...nativeCallSnapshot, ...patch };
  nativeCallSubscribers.forEach((subscriber) => subscriber(nativeCallSnapshot));
}

function subscribeNativeCallEvents(subscriber: (snapshot: NativeCallSnapshot) => void) {
  nativeCallSubscribers.add(subscriber);
  subscriber(nativeCallSnapshot);
  return () => { nativeCallSubscribers.delete(subscriber); };
}

function ensureNativeCallEventBridge() {
  if (nativeCallBridgePromise) return nativeCallBridgePromise;
  nativeCallBridgePromise = (async () => {
    const callReceivedHandle = await CapacitorPjsip.addListener('callReceived', (d: any) => {
      console.log('[NativeSIP] CALL_EVENT|callReceived', d);
      stopRingback();
      const callerName: string = d?.callerName || '';
      const callerNumber: string = d?.callerNumber || d?.from || d?.number || 'Unknown';
      emitNativeCallSnapshot({
        callState: 'ringing-in',
        activeCallNumber: callerNumber,
        callerName,
        callerNumber,
        direction: 'in',
        endReason: null,
        callPhase: 'ringing',
        lastSipCode: null,
      });
    });
    const callStateHandle = await CapacitorPjsip.addListener('callStateChanged', (d: any) => {
      console.log(`[NativeSIP] CALL_EVENT|callStateChanged|state=${d?.state || ''}|stage=${d?.stage || ''}|code=${d?.code || ''}`, d);
      const dir: NativeCallDirection = d?.direction === 'in' ? 'in' : d?.direction === 'out' ? 'out' : nativeCallSnapshot.direction;
      const stage: string = d?.stage || '';
      const code: string | null = d?.code ?? null;
      if (d?.state === 'ended' || d?.state === 'disconnected') {
        stopRingback();
        emitNativeCallSnapshot({ callState: 'idle', activeCallNumber: '', isMuted: false, isOnHold: false, isRecording: false, direction: null, endReason: null, callPhase: 'ended', lastSipCode: d?.code ?? null });
      }
      if (d?.state === 'active') {
        stopRingback();
        emitNativeCallSnapshot({ callState: 'active', activeCallNumber: d?.number || nativeCallSnapshot.activeCallNumber, direction: dir, endReason: null, callPhase: 'active', lastSipCode: code });
      }
      if (d?.state === 'ringing' || d?.state === 'calling') {
        // Map signaling stages to a richer call phase.
        let phase: CallPhase = 'dialing';
        if (stage === 'before_invite' || stage === 'invite_sent') phase = 'dialing';
        else if (stage === 'remote_ringing') phase = 'ringing';
        else if (stage === 'early_media') phase = 'early-media';
        else if (dir === 'in') phase = 'ringing';
        // Local ringback: only when outgoing AND no early media from PBX.
        if (dir === 'out' && phase !== 'early-media') startRingback();
        else stopRingback();
        const richState = dir === 'in' ? 'ringing-in' : dir === 'out' ? 'ringing-out' : 'ringing';
        emitNativeCallSnapshot({ callState: richState as any, activeCallNumber: d?.number || nativeCallSnapshot.activeCallNumber, direction: dir, endReason: null, callPhase: phase, lastSipCode: code });
      }
    });
    const callEndedHandle = await CapacitorPjsip.addListener('callEnded', (d: any) => {
      console.log('[NativeSIP] CALL_EVENT|callEnded', d);
      stopRingback();
      const friendly = describeEndReason(d?.reason);
      emitNativeCallSnapshot({ callState: 'idle', activeCallNumber: '', isMuted: false, isOnHold: false, isRecording: false, direction: null, endReason: friendly, callPhase: 'ended', lastSipCode: d?.code ?? null });
      // Phase 5: notify the recordings screen so it refreshes promptly once
      // the CDR/recording sync surfaces the new file server-side.
      try { window.dispatchEvent(new CustomEvent('ava:callEnded', { detail: { reason: friendly, code: d?.code ?? null } })); } catch {}
    });
    const muteHandle = await CapacitorPjsip.addListener('muteChanged', (d: any) => {
      emitNativeCallSnapshot({ isMuted: !!d?.muted });
    });
    const holdHandle = await CapacitorPjsip.addListener('holdChanged', (d: any) => {
      // Purely reflective — never re-invoke setHold here, that would create
      // an infinite re-INVITE loop.
      const held = !!(d?.held ?? d?.onHold);
      emitNativeCallSnapshot({ isOnHold: held, callState: held ? 'active' : 'active' });
    });
    const recordingHandle = await CapacitorPjsip.addListener('recordingChanged', (d: any) => {
      emitNativeCallSnapshot({ isRecording: !!d?.recording });
    });

    // Intentionally keep these native listeners for the lifetime of the JS app.
    (globalThis as any).__lemtelNativeCallHandles = [
      callReceivedHandle,
      callStateHandle,
      callEndedHandle,
      muteHandle,
      holdHandle,
      recordingHandle,
    ];
  })();
  return nativeCallBridgePromise;
}

export function useSoftphoneNative(config: SIPConfig | null): UseSoftphoneReturn {
  notifySipDispatcherLoaded();
  const [sipStatus, setSipStatus] = useState<SIPStatus>('idle');
  const [sipError, setSipError] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeCallNumber, setActiveCallNumber] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerNumber, setCallerNumber] = useState('');
  const [endReason, setEndReason] = useState<string | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [lastSipCode, setLastSipCode] = useState<string | null>(null);
  const [audioProfile, setAudioProfileState] = useState<AudioProfile>(() => loadAudioProfile());
  const [quality] = useState<CallQuality>(EMPTY_QUALITY);
  const [audioStatus, setAudioStatus] = useState<'idle' | 'starting' | 'running' | 'retrying' | 'error'>('idle');
  const [audioError, setAudioError] = useState('');
  const [audioRestartAttempts, setAudioRestartAttempts] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initInFlightRef = useRef<boolean>(false);
  const regHandleRef = useRef<{ remove(): Promise<void> } | null>(null);
  const activeInitKeyRef = useRef<string | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    ensureNativeCallEventBridge().catch((e) => console.warn('[NativeSIP] call event bridge failed', e));
    const unsub = subscribeNativeCallEvents((snapshot) => {
      setActiveCallNumber(snapshot.activeCallNumber);
      setCallerName(snapshot.callerName);
      setCallerNumber(snapshot.callerNumber);
      setIsMuted(snapshot.isMuted);
      setIsOnHold(snapshot.isOnHold);
      setIsRecording(snapshot.isRecording);
      setCallState(snapshot.callState);
      setEndReason(snapshot.endReason);
      setCallPhase(snapshot.callPhase);
      setLastSipCode(snapshot.lastSipCode);
      if (snapshot.callState === 'active') startTimer();
      if (snapshot.callState === 'idle') stopTimer();
    });
    let audioHandle: { remove(): Promise<void> } | null = null;
    let micHandle: { remove(): Promise<void> } | null = null;
    CapacitorPjsip.addListener('audioStateChanged', (d: any) => {
      const status = (d?.status as typeof audioStatus) || 'idle';
      setAudioStatus(status);
      setAudioRestartAttempts(Number(d?.restartAttempts ?? 0));
      if (status === 'error') {
        setAudioError(String(d?.reason || d?.lastError || 'Audio engine failed'));
      } else if (status === 'running') {
        setAudioError('');
      }
      console.log(`[NativeSIP] AUDIO_STATE|${status}|attempts=${d?.restartAttempts}|err=${d?.lastError || ''}`);
    }).then((h: any) => { audioHandle = h; }).catch(() => {});
    CapacitorPjsip.addListener('micPermission', (d: any) => {
      console.log('[NativeSIP] MIC_PERMISSION', d);
      if (d?.status === 'denied' || d?.granted === false) {
        const msg = d?.reason || 'Microphone access is required for two-way audio. Enable it in iOS Settings.';
        setSipStatus('error');
        setSipError(msg);
        setNativeRegStatus('error', msg);
      }
    }).then((h: any) => { micHandle = h; }).catch(() => {});
    // iOS parity with Android SipConnectionService: poll native PJSIP registration
    // status every 30s so the UI reflects background re-registers.
    let iosPoll: ReturnType<typeof setInterval> | null = null;
    if (Capacitor.getPlatform() === 'ios') {
      iosPoll = setInterval(async () => {
        try {
          const s = await getIosSipServiceStatus();
          if (!s) return;
          if (s.loggedIn && s.status === 'registered') {
            setSipStatus('registered');
            setNativeRegStatus('registered', null);
          } else if (s.loggedIn || s.status === 'connecting') {
            setSipStatus((prev) => (prev === 'registered' ? prev : 'connecting'));
          }
        } catch {}
      }, 30_000);
    }
    return () => { unsub(); audioHandle?.remove().catch(() => {}); micHandle?.remove().catch(() => {}); if (iosPoll) clearInterval(iosPoll); };
  }, []);


  // Register account on config change.
  useEffect(() => {
    if (!config) return;
    const initKey = `${config.extension}@${config.domain}|${config.password}|${config.wssUrl ?? ''}`;

    // Keep the registration listener alive across React StrictMode re-renders.
    // Only detach it when the credentials actually change.
    if (activeInitKeyRef.current === initKey && regHandleRef.current) {
      console.log('[NativeSIP] native listeners already active for %s, skip initAccount', initKey);
      return;
    }
    if (initInFlightRef.current && activeInitKeyRef.current === initKey) {
      console.log('[NativeSIP] initAccount already in flight for %s, skip duplicate', initKey);
      return;
    }
    if (activeInitKeyRef.current && activeInitKeyRef.current !== initKey && regHandleRef.current) {
      console.log('[NativeSIP] removing old registration listener for %s', activeInitKeyRef.current);
      regHandleRef.current.remove().catch(() => {});
      regHandleRef.current = null;
      emitNativeCallSnapshot({ callState: 'idle', activeCallNumber: '', isMuted: false, isOnHold: false });
    }
    activeInitKeyRef.current = initKey;
    initInFlightRef.current = true;

    let cancelled = false;
    const cleanups: Array<() => void> = [];
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    // Module-level singleton: skip the whole registration flow when another
    // hook instance / mount already registered the same credentials.
    if (_registeredKey === initKey || _initInFlightKey === initKey) {
      console.log('[NativeSIP] singleton: already registered/in-flight for %s, skip', initKey);
      initInFlightRef.current = false;
      // Still surface a "registered" state locally if the singleton has it.
      if (_registeredKey === initKey) {
        setSipStatus('registered');
        setNativeRegStatus('registered', null);
      }
      return;
    }
    _initInFlightKey = initKey;
    _lastConfig = config;

    setSipStatus('connecting');
    setSipError('');
    setNativeRegStatus('connecting');
    startNativeSipTracking();
    console.log('[NativeSIP] initAccount → ext=%s domain=%s', config.extension, config.domain);

    (async () => {
      try {
        // Direct listener on the unified `registration` event. This listener is
        // intentionally kept alive across React re-renders so it is still there
        // when the native 200 OK arrives after a StrictMode cleanup cycle.
        const regHandle = await CapacitorPjsip.addListener('registration', (d: any) => {
          if (activeInitKeyRef.current !== initKey) return;
          console.log('[NativeSIP] registration event', d);
          const s = d?.status ?? d?.state;
          if (s === 'registered') {
            if (watchdog) { clearTimeout(watchdog); watchdog = null; }
            initInFlightRef.current = false;
            _initInFlightKey = null;
            _registeredKey = initKey;
            console.log('[NativeSIP] registered ✓');
            setSipStatus('registered'); setSipError('');
            setNativeRegStatus('registered', null);
          } else if (s === 'error' || s === 'failed') {
            if (watchdog) { clearTimeout(watchdog); watchdog = null; }
            initInFlightRef.current = false;
            _initInFlightKey = null;
            _registeredKey = null;
            const msg = d?.reason || `Registration failed${d?.code ? ` (${d.code})` : ''}`;
            console.warn('[NativeSIP] registrationFailed', d);
            setSipStatus('error');
            setSipError(msg);
            setNativeRegStatus('error', msg);
          }
        });
        regHandleRef.current = regHandle;

        cleanups.push(await onNativeSipEvent('log', (e: any) => {
          // Bubble native logs to JS console for on-device debugging.
          console.log('[CapacitorPjsip][native]', e?.message ?? e);
        }));

        // Watchdog: if the native plugin never answers in 45s we surface a
        // clear error instead of leaving the UI on "connecting" forever.
        watchdog = setTimeout(() => {
          if (cancelled) return;
          initInFlightRef.current = false;
          console.error('[NativeSIP] watchdog timeout — no registration event in 45s');
          setSipStatus('error');
          setSipError('Native SIP timeout — plugin did not respond');
        }, 45000);

        await CapacitorPjsip.initAccount({
          extension: config.extension,
          username: (config as any).authUsername || config.extension,
          domain: config.domain,
          password: config.password,
          server: (config as any).server,
          port: (config as any).port,
          transport: (config as any).transport,
          wssUrl: config.wssUrl,
        });
      } catch (e: any) {
        if (cancelled) return;
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        initInFlightRef.current = false;
        console.error('[NativeSIP] initAccount threw', e);
        setSipStatus('error');
        setSipError(e?.message || 'Native SIP init failed');
      }
    })();

    return () => {
      cancelled = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      cleanups.forEach((c) => { try { c(); } catch {} });
      // Registration + call listeners are intentionally kept alive across React
      // StrictMode re-renders. They are removed only on credential change/unmount.
      stopTimer();
    };
  }, [config]);

  // Remove the long-lived registration listener only when the hook truly
  // unmounts. Credential changes are handled inside the effect above.
  useEffect(() => {
    return () => {
      regHandleRef.current?.remove().catch(() => {});
      regHandleRef.current = null;
    };
  }, []);

  const call = (number: string) => {
    if (sipStatus !== 'registered') return false;
    emitNativeCallSnapshot({ callState: 'ringing-out' as any, activeCallNumber: number, isMuted: false, isOnHold: false, direction: 'out', endReason: null, callPhase: 'dialing', lastSipCode: null });
    // iOS WebAudio requires a user-gesture to unlock the AudioContext. Start
    // the ringback here (synchronous to the tap) and let it run until 180/183
    // arrives. It is stopped on 'active', 'early-media' or 'ended'.
    try { startRingback(); } catch (e) { console.warn('[NativeSIP] startRingback failed', e); }
    CapacitorPjsip.makeCall({ number }).then((res) => {
      console.log('[NativeSIP] makeCall resolved', JSON.stringify(res));
    }).catch((e) => {
      console.error('[NativeSIP] makeCall REJECTED:', e?.message || String(e));
      stopRingback();
      emitNativeCallSnapshot({ callState: 'idle', activeCallNumber: '', isMuted: false, isOnHold: false, direction: null, endReason: e?.message || 'makeCall failed', callPhase: 'ended', lastSipCode: null });
      setSipError(e?.message || 'makeCall failed');
    });
    return true;
  };
  const hangup = () => {
    stopRingback();
    CapacitorPjsip.hangup().catch((e) => console.warn('[NativeSIP] hangup failed', e));
    emitNativeCallSnapshot({ callState: 'idle', activeCallNumber: '', isMuted: false, isOnHold: false, direction: null, endReason: null, callPhase: 'ended', lastSipCode: null });
  };
  const answer = () => { CapacitorPjsip.answer().catch(() => {}); };
  const mute   = () => { CapacitorPjsip.setMute({ muted: true }).catch(() => {});  setIsMuted(true); };
  const unmute = () => { CapacitorPjsip.setMute({ muted: false }).catch(() => {}); setIsMuted(false); };
  // hold/unhold no longer optimistically toggle isOnHold — we wait for the
  // `holdChanged` event so the UI and PBX state can't desync into a re-INVITE loop.
  const hold   = () => { CapacitorPjsip.setHold({ onHold: true  }).catch(() => {}); };
  const unhold = () => { CapacitorPjsip.setHold({ onHold: false }).catch(() => {}); };
  const sendDTMF = (key: string) => { CapacitorPjsip.sendDTMF({ digit: key }).catch(() => {}); };

  const startRecording = useCallback(async () => {
    try {
      // Apple App Review + jurisdictional consent: play audible notice before recording.
      try {
        const { playRecordingConsent } = await import('../lib/recordingConsent');
        await playRecordingConsent('fr');
      } catch {}
      await CapacitorPjsip.startRecord();
      emitNativeCallSnapshot({ isRecording: true });
      setIsRecording(true);
    } catch (e: any) {
      console.warn('[NativeSIP] startRecord failed', e);
      throw new Error(e?.message || 'startRecord failed');
    }
  }, []);
  const stopRecording = useCallback(async () => {
    try {
      await CapacitorPjsip.stopRecord();
      emitNativeCallSnapshot({ isRecording: false });
      setIsRecording(false);
    } catch (e: any) {
      console.warn('[NativeSIP] stopRecord failed', e);
      throw new Error(e?.message || 'stopRecord failed');
    }
  }, []);

  const transferCall = useCallback(async (target: string) => {
    try { await CapacitorPjsip.transfer({ target }); } catch (e) { console.warn('[NativeSIP] transfer failed', e); }
  }, []);
  const parkCall = useCallback(async (code?: string) => {
    try { await CapacitorPjsip.park({ code }); } catch (e) { console.warn('[NativeSIP] park failed', e); }
  }, []);
  const addCall = useCallback(async (target: string) => {
    try { await CapacitorPjsip.addCall({ target }); } catch (e) { console.warn('[NativeSIP] addCall failed', e); }
  }, []);

  const setAudioProfile = useCallback((p: AudioProfile) => {
    setAudioProfileState(p);
    saveAudioProfile(p);
  }, []);
  const reconnect = useCallback(() => {
    if (!config) return;
    const key = `${config.extension}@${config.domain}|${config.password}|${config.wssUrl ?? ''}`;
    // Skip when the singleton already has an active registration for this key —
    // duplicate initAccount calls create ghost registrations on FusionPBX.
    if (_registeredKey === key) {
      console.log('[NativeSIP] reconnect skipped, already registered for', key);
      return;
    }
    if (_initInFlightKey === key) {
      console.log('[NativeSIP] reconnect skipped, initAccount in flight for', key);
      return;
    }
    setSipError('');
    setSipStatus('connecting');
    setNativeRegStatus('connecting');
    _initInFlightKey = key;
    _lastConfig = config;
    CapacitorPjsip.initAccount({
      extension: config.extension,
      domain: config.domain,
      password: config.password,
      wssUrl: config.wssUrl,
    }).catch((e) => {
      _initInFlightKey = null;
      const msg = e?.message || 'reconnect failed';
      setSipStatus('error'); setSipError(msg); setNativeRegStatus('error', msg);
    });
  }, [config]);

  // Auto-reconnect when the app returns to foreground or the network recovers.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    attachNativeAutoReconnect(() => {
      if (sipStatus !== 'registered' && sipStatus !== 'connecting') reconnect();
    }).then((c) => { cleanup = c; });
    return () => { if (cleanup) cleanup(); };
  }, [reconnect, sipStatus]);

  return {
    sipStatus, sipError, callState, callTimer, isMuted, isOnHold, activeCallNumber,
    call, hangup, answer, mute, unmute, hold, unhold, sendDTMF,
    setStatus: () => {},
    reconnect,
    lastPersistedError: null,
    sipLog: [],
    clearSipLog: () => {},
    clearSipState: () => {},
    retryAttempt: 0,
    nextRetryAt: null,
    retryLimitReached: false,
    quality,
    audioProfile,
    setAudioProfile,
    offeredCodecs: [],
    negotiatedCodec: null,
    audioStatus,
    audioError,
    audioRestartAttempts,
    // Native call-control extras (consumed by ActiveCallSheet)
    isRecording,
    startRecording,
    stopRecording,
    startRecord: startRecording,
    stopRecord: stopRecording,
    transferCall,
    transfer: transferCall,
    parkCall,
    park: parkCall,
    addCall,
    endReason,
    lastEndReason: endReason,
    callPhase,
    lastSipCode,
    callerName,
    callerNumber,
  } as UseSoftphoneReturn;
}
