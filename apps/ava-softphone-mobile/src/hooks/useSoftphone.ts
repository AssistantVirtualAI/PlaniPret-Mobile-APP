import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { createSIPUA, JsSIPUnavailableError, SIPConfig, classifySipFailure, rewriteSdpForFusionPBX, sdpModifier, buildSdpModifier } from '../lib/sip/jssipProvider';
import { attachRemoteStream } from '../lib/sip/audioOutput';
import { getAudioConstraints } from '../lib/audioPrefs';
import {
  appendSipLog, clearSipLog as clearPersistedLog, clearPersistedStatus, loadPersistedError, loadPersistedStatus,
  loadSipLog, MAX_AUTO_RETRIES, PersistedSipError, probeWss, RETRY_BACKOFF_MS, savePersistedError, savePersistedStatus,
  SipLogEntry,
} from '../lib/sip/sipPersistence';
import { AudioProfile, loadAudioProfile, saveAudioProfile, PROFILE_OPUS } from '../lib/sip/audioProfile';
import { CallQuality, EMPTY_QUALITY, SamplerState, sampleCallQuality, chooseAdaptiveBitrate } from '../lib/sip/callQuality';
import { showMobileToast } from '../lib/mobileToast';
import { PC_CONFIG, instrumentPeerConnection, watchCallEstablishment, isSipDebugEnabled, sipDebug } from '../lib/sip/rtcConfig';
import { fetchIceServers, FALLBACK_ICE_SERVERS } from '../lib/sip/iceServers';
import type { AndroidSipServiceStatus } from '../lib/sip/nativeSipProvider';
import { showAndroidIncomingCallNotif, dismissAndroidIncomingCallNotif } from '../lib/sip/androidCallNotif';

export type SIPStatus = 'idle' | 'connecting' | 'registered' | 'retrying' | 'error';
export type CallState = 'idle' | 'ringing' | 'ringing-in' | 'ringing-out' | 'active' | 'ended';

export interface UseSoftphoneReturn {
  sipStatus: SIPStatus;
  sipError: string;
  callState: CallState;
  callTimer: number;
  isMuted: boolean;
  isOnHold: boolean;
  activeCallNumber: string;
  call: (number: string) => boolean | void | Promise<boolean>;
  hangup: () => void;
  answer: () => void;
  mute: () => void;
  unmute: () => void;
  hold: () => void;
  unhold: () => void;
  sendDTMF: (key: string) => void;
  setStatus: (status: string) => void;
  reconnect: () => void;
  lastPersistedError: PersistedSipError | null;
  sipLog: SipLogEntry[];
  clearSipLog: () => void;
  clearSipState: () => void;
  retryAttempt: number;
  nextRetryAt: number | null;
  retryLimitReached: boolean;
  quality: CallQuality;
  audioProfile: AudioProfile;
  setAudioProfile: (p: AudioProfile) => void;
  /** Codecs proposed in the outgoing INVITE SDP (audio m-line order). */
  offeredCodecs: string[];
  /** Codec actually negotiated for the current/last call. */
  negotiatedCodec: string | null;
  /** Native audio engine status — surfaced by the iOS plugin only. */
  audioStatus?: 'idle' | 'starting' | 'running' | 'retrying' | 'error';
  audioError?: string;
  audioRestartAttempts?: number;
  androidSipServiceStatus?: AndroidSipServiceStatus | null;
  // Native-only call-control extras (consumed by ActiveCallSheet).
  isRecording?: boolean;
  startRecording?: () => void | Promise<void>;
  stopRecording?: () => void | Promise<void>;
  startRecord?: () => void | Promise<void>;
  stopRecord?: () => void | Promise<void>;
  transferCall?: (target: string) => void | Promise<void>;
  transfer?: (target: string) => void | Promise<void>;
  parkCall?: (code?: string) => void | Promise<void>;
  park?: (code?: string) => void | Promise<void>;
  addCall?: (target: string) => void | Promise<void>;
  /** Directly inject a native SIP service status snapshot (Android only). */
  setNativeStatusDirectly?: (native: AndroidSipServiceStatus) => void;
  /** Caller display name for the current/incoming call (Android Verto). */
  callerName?: string;
  /** Caller number for the current/incoming call (Android Verto). */
  callerNumber?: string;
}

export function useSoftphoneJsSip(
  config: SIPConfig | null,
  opts: { jsSipTimeoutMs?: number } = {},
): UseSoftphoneReturn {
  const [sipStatus, setSipStatusState] = useState<SIPStatus>('idle');
  const [sipError, setSipErrorState] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const callStateRef = useRef<CallState>('idle');
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [activeCallNumber, setActiveCallNumber] = useState('');
  const [lastPersistedError, setLastPersistedError] = useState<PersistedSipError | null>(() => loadPersistedError());
  const [sipLog, setSipLog] = useState<SipLogEntry[]>(() => loadSipLog());
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const [retryLimitReached, setRetryLimitReached] = useState(false);
  const [audioProfile, setAudioProfileState] = useState<AudioProfile>(() => loadAudioProfile());
  const [quality, setQuality] = useState<CallQuality>(EMPTY_QUALITY);
  const [offeredCodecs, setOfferedCodecs] = useState<string[]>([]);
  const [negotiatedCodec, setNegotiatedCodec] = useState<string | null>(null);
  const lastCallNumberRef = useRef<string>('');
  const callAttemptRef = useRef<number>(0);

  const uaRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioProfileRef = useRef<AudioProfile>(audioProfile);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const samplerStateRef = useRef<SamplerState>({});
  const currentBitrateRef = useRef<number>(PROFILE_OPUS.auto.hardCapBitrate);
  const reRegisterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last quality alert level shown, and when — used to throttle toasts. */
  const lastAlertRef = useRef<{ level: number; at: number }>({ level: 4, at: 0 });

  useEffect(() => { audioProfileRef.current = audioProfile; }, [audioProfile]);

  const setAudioProfile = useCallback((p: AudioProfile) => {
    setAudioProfileState(p);
    saveAudioProfile(p);
    try {
      const pc: RTCPeerConnection | undefined = sessionRef.current?.connection;
      const sender = pc?.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = PROFILE_OPUS[p].hardCapBitrate;
        currentBitrateRef.current = PROFILE_OPUS[p].hardCapBitrate;
        sender.setParameters(params).catch(() => {});
      }
    } catch {}
  }, []);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authBlockedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const reconnectRef = useRef<() => void>(() => {});
  const [reconnectTick, setReconnectTick] = useState(0);
  // Live-status ref so network/foreground listeners see the current state
  // without recreating the effect (avoids tearing down the UA on every change).
  const sipStatusRef = useRef<SIPStatus>('idle');

  // --- logging helpers ---
  const log = useCallback((event: string, detail?: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const entry: SipLogEntry = { time: Date.now(), level, event, detail };
    const next = appendSipLog(entry);
    setSipLog(next);
    // Mirror to console for live debugging.
    const tag = `[SIP][${level}] ${event}`;
    if (level === 'error') console.error(tag, detail || '');
    else if (level === 'warn') console.warn(tag, detail || '');
    else console.log(tag, detail || '');
  }, []);

  const setSipStatus = useCallback((s: SIPStatus) => {
    const prev = sipStatusRef.current;
    sipStatusRef.current = s;
    setSipStatusState(s);
    savePersistedStatus(s);
    if (prev !== s) {
      // Journaliser chaque transition pour le panneau de debug.
      const entry: SipLogEntry = { time: Date.now(), level: 'info', event: 'status.transition', detail: `${prev} → ${s}` };
      const next = appendSipLog(entry);
      setSipLog(next);
      console.log(`[SIP][status] ${prev} → ${s}`);
    }
  }, []);

  /**
   * Vérifie que l'UA est toujours REGISTERED après un CANCEL/timeout.
   * Si oui → repasse sipStatus à 'registered'.
   * Si le WSS est connecté mais l'UA n'est plus enregistré → tente un
   * re-REGISTER silencieux (le sipStatus repassera à 'registered' via
   * l'event `registered` du UA).
   */
  const ensureRegisteredThenRestore = useCallback((from: string) => {
    const ua = uaRef.current;
    if (!ua) return;
    try {
      if (ua.isConnected?.() && ua.isRegistered?.()) {
        setSipStatus('registered');
        return;
      }
      if (ua.isConnected?.() && !ua.isRegistered?.()) {
        log('register.re-check', `${from}: UA connected but not registered — silent re-REGISTER`, 'warn');
        try { ua.register?.(); } catch (e: any) {
          log('register.re-check.failed', e?.message || '', 'error');
        }
      } else {
        log('register.re-check', `${from}: WSS not connected — leaving status as is`, 'warn');
      }
    } catch {}
  }, [log, setSipStatus]);

  // Backoff court entre 2 tentatives INVITE (ms).
  const INVITE_RETRY_BACKOFF_MS = 600;

  const setSipError = useCallback((msg: string, ctx?: { extension?: string; domain?: string }) => {
    setSipErrorState(msg);
    if (msg && (ctx?.extension || ctx?.domain)) {
      const persisted: PersistedSipError = {
        error: msg,
        extension: ctx?.extension || '',
        domain: ctx?.domain || '',
        time: Date.now(),
      };
      savePersistedError(persisted);
      setLastPersistedError(persisted);
    }
  }, []);

  const clearSipLog = useCallback(() => { clearPersistedLog(); setSipLog([]); }, []);

  const clearSipState = useCallback(() => {
    clearPersistedStatus();
    savePersistedError(null);
    setLastPersistedError(null);
    setSipErrorState('');
    setSipStatusState('idle');
    setRetryAttempt(0);
    setRetryLimitReached(false);
  }, []);

  // Restore persisted status on mount so UI doesn't flash "idle" on cold start.
  useEffect(() => {
    const prior = loadPersistedStatus();
    if (prior === 'error' || prior === 'retrying') {
      setSipStatusState('connecting');
    }
  }, []);

  // SIP/TLS transport does not require WebRTC, mDNS or TURN.
  useEffect(() => {
    console.log('[SIP][android] JsSIP useEffect fired — config:', config ? `ext=${config.extension} wss=${config.wssUrl}` : 'NULL');
    if (!config) return;
    let cancelled = false;

    const ctx = { extension: config.extension, domain: config.domain };
    const clearRetry = () => {
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      setNextRetryAt(null);
    };
    const clearRegistrationWatchdog = () => {
      if (registrationWatchdogRef.current) {
        clearTimeout(registrationWatchdogRef.current);
        registrationWatchdogRef.current = null;
      }
    };
    authBlockedRef.current = false;
    let scheduleRetry: () => Promise<void> = async () => {};

    const armRegistrationWatchdog = () => {
      clearRegistrationWatchdog();
      registrationWatchdogRef.current = setTimeout(() => {
        if (cancelled) return;
        const msg = 'SIP registration timed out — retrying connection.';
        setSipStatus('error');
        setSipError(msg, ctx);
        log('register.timeout', `no registered/failed event after UA start (${config.wssUrl})`, 'error');
        try { uaRef.current?.stop(); } catch {}
        uaRef.current = null;
        scheduleRetry();
      }, Math.max(10000, (opts.jsSipTimeoutMs ?? 8000) + 4000));
    };

    const start = () => {
      if (cancelled) return;
      clearRegistrationWatchdog();
      setSipStatus('connecting');
      setSipErrorState('');
      log('register.start', `ext=${config.extension}@${config.domain} wss=${config.wssUrl}`);

      createSIPUA(config, opts.jsSipTimeoutMs ?? 8000)
        .then((ua) => {
          if (cancelled) { try { ua.stop(); } catch {} return; }
          ua.on('connecting', () => log('ws.connecting', config.wssUrl));
          ua.on('connected', () => log('ws.connected', config.wssUrl));
          ua.on('registered', () => {
            clearRegistrationWatchdog();
            retryAttemptRef.current = 0;
            setRetryAttempt(0);
            clearRetry();
            setSipStatus('registered');
            setSipErrorState('');
            log('register.ok', `ext=${config.extension}@${config.domain}`);
            // Android: start foreground service to hold WakeLock + WifiLock
            // so the WebSocket survives screen-off / background throttling.
            startAndroidSipService();
          });
          // Silent re-register on expiry / soft unregister — keeps the
          // active RTP session alive while we refresh the binding.
          const scheduleSilentReRegister = (delayMs: number, reason: string) => {
            if (reRegisterTimerRef.current) clearTimeout(reRegisterTimerRef.current);
            const delay = Math.max(500, Math.min(delayMs, 30000));
            log('register.silent-reattempt', `${reason} in ${delay}ms`, 'warn');
            reRegisterTimerRef.current = setTimeout(() => {
              try { uaRef.current?.register?.(); }
              catch (e: any) { log('register.silent-reattempt.failed', e?.message || '', 'error'); }
            }, delay);
          };
          ua.on('unregistered', (e: any) => {
            log('register.unregistered', e?.cause || '', 'warn');
            // Progressive backoff, scaled by retry attempt counter.
            const a = retryAttemptRef.current;
            const delay = [1000, 2000, 4000, 8000, 15000][Math.min(a, 4)];
            scheduleSilentReRegister(delay, 'unregistered');
          });
          ua.on('registrationExpiring', () => {
            log('register.expiring', 'refreshing binding');
            scheduleSilentReRegister(500, 'expiring');
          });
          ua.on('registrationFailed', (e: any) => {
            clearRegistrationWatchdog();
            const code = e?.response?.status_code;
            const msg = classifySipFailure({
              cause: e?.cause,
              status_code: code,
              reason_phrase: e?.response?.reason_phrase,
            });
            setSipStatus('error');
            setSipError(msg, ctx);
            log('register.failed', `code=${code ?? '?'} cause=${e?.cause || ''} → ${msg}`, 'error');
            if (code === 401 || code === 403 || code === 407) {
              authBlockedRef.current = true;
              log('retry.blocked', `auth failure (${code}) — auto-retry disabled until credentials change`, 'warn');
              return;
            }
            scheduleRetry();
          });
          ua.on('disconnected', (e: any) => {
            clearRegistrationWatchdog();
            setSipStatus('connecting');
            log('ws.disconnected', `code=${e?.code || ''} reason=${e?.reason || ''}`, 'warn');
            if (e?.error) {
              const msg = classifySipFailure({ cause: e?.reason || 'WSS connection failed' });
              setSipError(msg, ctx);
              scheduleRetry();
            }
          });
          ua.on('newRTCSession', (data: any) => {
            const session = data.session;
            sessionRef.current = session;
            const remoteNumber = session.remote_identity?.uri?.user || 'Unknown';
            setActiveCallNumber(remoteNumber);
            log('session.new', `${session.direction} ${remoteNumber}`);
            if (session.direction === 'incoming') {
              callStateRef.current = 'ringing-in'; setCallState('ringing-in');
              // Pre-warm ICE servers immediately on incoming so answer() has
              // them cached and doesn't block on a network fetch (2-4 s delay).
              fetchIceServers().catch(() => {});
              // Trigger native Android ringing + fullscreen notification
              if (Capacitor.getPlatform() === 'android') {
                const callerName = session.remote_identity?.display_name || '';
                showAndroidIncomingCallNotif(remoteNumber, callerName);
              }
            }
            // Android WebView: ICE gathering can take 3-10 s on outgoing calls.
            // JsSIP waits for iceGatheringState=complete before sending the INVITE SDP.
            // FusionPBX cancels the INVITE after ~15 s if no SDP is received.
            // Fix: force ICE ready() after 2 s so the INVITE SDP is sent immediately
            // with whatever candidates are already collected.
            if (session.direction === 'outgoing' && Capacitor.getPlatform() === 'android') {
              let outIceTimer: ReturnType<typeof setTimeout> | null = null;
              const outIceCandidateHandler = ({ ready }: { candidate: RTCIceCandidate | null; ready: () => void }) => {
                if (outIceTimer) return;
                outIceTimer = setTimeout(() => {
                  log('call.iceForced', 'forcing ICE ready after 2s timeout on Android (outgoing)');
                  try { ready(); } catch {}
                }, 2000);
              };
              session.once('icecandidate', outIceCandidateHandler);
            }
            session.on('peerconnection', (e: any) => {
              const pc: RTCPeerConnection | undefined = e?.peerconnection;
              if (pc) {
                // Wire remote audio track → <audio> element (otherwise the
                // remote party is inaudible even though the call is up).
                try { attachRemoteStream(pc); } catch (err: any) {
                  log('audio.attach-failed', err?.message || '', 'warn');
                }
                instrumentPeerConnection(pc, (event, detail, level = 'info') => {
                  log(event, detail, level);
                });
              }
            });
            // ---- SDP introspection: log offer/answer codecs before INVITE is sent.
            session.on('sdp', (data: any) => {
              try {
                let sdp = data?.sdp || '';
                if (data?.originator === 'local' && data?.type === 'offer' && callAttemptRef.current === 2) {
                  const rewritten = rewriteSdpForFusionPBX(sdp);
                  if (rewritten && rewritten !== sdp) {
                    data.sdp = rewritten;
                    sdp = rewritten;
                    log('sdp.fallback-rewritten', 'local offer reduced to secure PCMU-only before INVITE');
                  }
                }
                const codecs = extractAudioCodecs(sdp);
                if (data?.originator === 'local') {
                  setOfferedCodecs(codecs);
                  log('sdp.offer', `codecs=[${codecs.join(', ')}] (${sdp.length}b)`);
                  if (isSipDebugEnabled()) console.log('[SIP][SDP][local offer]\n' + sdp);
                } else {
                  log('sdp.remote', `codecs=[${codecs.join(', ')}]`);
                  if (isSipDebugEnabled()) console.log('[SIP][SDP][remote ' + data?.type + ']\n' + sdp);
                }
              } catch (e: any) {
                log('sdp.parse-failed', e?.message || '', 'warn');
              }
            });

            // Post-INVITE health-check: RFC 3261 Timer B = 32 s (5 s laissait
            // le PBX FusionPBX court quand il négocie DTLS-SRTP derrière NAT).
            watchCallEstablishment(session, session.connection, 32000).then((res) => {
              if (res.ok) {
                log('call.established', `ice=${res.iceState}`);
                return;
              }
              const msg =
                res.reason === 'timeout-session' ? 'Appel non confirmé (pas d’ACK en 32 s)'
                : res.reason === 'timeout-ice'   ? `ICE bloqué (state=${res.iceState ?? '?'}) — STUN/TURN probablement filtré`
                : res.reason === 'ice-failed'    ? 'Échec ICE — chemin média bloqué'
                : 'Établissement de l’appel échoué';
              log('call.establishment-failed', `${res.reason} ice=${res.iceState}`, 'error');
              try { showMobileToast(msg, 'error'); } catch {}

              // IMPORTANT: ne jamais raccrocher un appel déjà actif.
              // Sur Android avec ICE forcé, la session peut être confirmée mais ICE
              // reste en 'checking' — l'audio fonctionne quand même.
              if (callStateRef.current === 'active') {
                log('call.establishment-ok-active', 'call already active, ignoring watchCallEstablishment timeout', 'warn');
                return;
              }

              // Auto-retry en SDP PCMU sécurisé si le 1er essai timeoute
              // (PBX qui refuse silencieusement Opus/DTLS-SRTP en WebRTC).
              if (
                (res.reason === 'timeout-session' || res.reason === 'timeout-ice') &&
                callAttemptRef.current === 1 &&
                lastCallNumberRef.current
              ) {
                callAttemptRef.current = 2;
                const retryNumber = lastCallNumberRef.current;
                log('call.retry-timeout', `→ ${retryNumber} PCMU-only fallback`, 'warn');
                try { sessionRef.current?.terminate(); } catch {}
                ensureRegisteredThenRestore('invite-timeout');
                setTimeout(() => { try { placeCallInternal(retryNumber, true); } catch {} }, INVITE_RETRY_BACKOFF_MS);
              }
            });
            session.on('confirmed', () => {
              callStateRef.current = 'active'; setCallState('active');
              log('session.confirmed', remoteNumber);
              console.log('[SIP][info] session.confirmed — call connected');
              // Force Android into MODE_IN_COMMUNICATION via earpiece route so
              // remote audio is audible (WebView otherwise plays via media stream).
              import('../lib/sip/audioOutput').then(({ setRoute }) => {
                setRoute('earpiece').catch(() => {});
              });
              timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
              // Read the codec actually negotiated by the PBX.
              readNegotiatedCodec(session.connection);
              // ---- Live quality sampler + adaptive bitrate loop ----
              samplerStateRef.current = {};
              const pc: RTCPeerConnection | undefined = session.connection;
              const sender = pc?.getSenders().find((s) => s.track?.kind === 'audio');
              const profile = audioProfileRef.current;
              currentBitrateRef.current = PROFILE_OPUS[profile].hardCapBitrate;
              if (sender) {
                try {
                  const params = sender.getParameters();
                  params.encodings = params.encodings?.length ? params.encodings : [{}];
                  params.encodings[0].maxBitrate = currentBitrateRef.current;
                  sender.setParameters(params).catch(() => {});
                } catch {}
              }
              if (pc) {
                if (statsTimerRef.current) clearInterval(statsTimerRef.current);
                statsTimerRef.current = setInterval(async () => {
                  const q = await sampleCallQuality(pc, samplerStateRef.current);
                  setQuality(q);
                  // ---- Quality alerts (throttled, only when level worsens) ----
                  const now = Date.now();
                  const prev = lastAlertRef.current;
                  const cooldown = 15000; // don't re-alert same band for 15s
                  const profile = audioProfileRef.current;
                  const switchToLowBw = () => {
                    setAudioProfileState('low-bandwidth');
                    saveAudioProfile('low-bandwidth');
                    audioProfileRef.current = 'low-bandwidth';
                    if (sender) {
                      try {
                        const p = sender.getParameters();
                        p.encodings = p.encodings?.length ? p.encodings : [{}];
                        p.encodings[0].maxBitrate = PROFILE_OPUS['low-bandwidth'].hardCapBitrate;
                        currentBitrateRef.current = PROFILE_OPUS['low-bandwidth'].hardCapBitrate;
                        sender.setParameters(p).catch(() => {});
                      } catch {}
                    }
                    log('quality.profile.auto-switch', `→ low-bandwidth (loss=${q.lossPct}% rtt=${q.rtt}ms)`, 'warn');
                  };
                  if (q.level <= 1 && prev.level > 1 && now - prev.at > cooldown) {
                    lastAlertRef.current = { level: q.level, at: now };
                    if (profile !== 'low-bandwidth') {
                      showMobileToast(
                        `Réseau critique · perte ${q.lossPct}% · toucher pour activer le mode faible bande passante`,
                        'error',
                        switchToLowBw,
                      );
                    } else {
                      showMobileToast(`Réseau critique · perte ${q.lossPct}%`, 'error');
                    }
                  } else if (q.level === 2 && prev.level > 2 && now - prev.at > cooldown) {
                    lastAlertRef.current = { level: q.level, at: now };
                    showMobileToast(`Qualité dégradée · perte ${q.lossPct}% · jitter ${q.jitter}ms`, 'warning');
                  } else if (q.level >= 4 && prev.level < 3 && now - prev.at > cooldown) {
                    lastAlertRef.current = { level: q.level, at: now };
                    showMobileToast('Réseau rétabli · qualité optimale', 'success');
                  }
                  // ---- Adaptive bitrate (AUTO only) ----
                  if (audioProfileRef.current === 'auto' && sender) {
                    const cap = PROFILE_OPUS.auto.hardCapBitrate;
                    const target = chooseAdaptiveBitrate(q, cap, currentBitrateRef.current);
                    if (Math.abs(target - currentBitrateRef.current) > 1500) {
                      currentBitrateRef.current = target;
                      try {
                        const params = sender.getParameters();
                        params.encodings = params.encodings?.length ? params.encodings : [{}];
                        params.encodings[0].maxBitrate = target;
                        await sender.setParameters(params);
                        log('adaptive.bitrate', `→ ${target} bps (loss=${q.lossPct}% rtt=${q.rtt}ms)`);
                      } catch {}
                    }
                  }
                }, 2000);
              }
            });
            const stopStats = () => {
              if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
              setQuality(EMPTY_QUALITY);
              samplerStateRef.current = {};
            };
            session.on('ended', () => {
              callStateRef.current = 'ended'; setCallState('ended');
              log('session.ended', remoteNumber);
              // Always dismiss the native Android incoming-call notification and
              // ringtone when the session ends (covers the case where the remote
              // party cancels before we answer).
              dismissIncomingNotif();
              answeringRef.current = false;
              if (timerRef.current) clearInterval(timerRef.current);
              stopStats();
              setTimeout(() => {
                setCallState('idle');
                setCallTimer(0);
                setIsMuted(false);
                setIsOnHold(false);
                setActiveCallNumber('');
              }, 2000);
            });
            session.on('failed', (e: any) => {
              const code = e?.message?.status_code;
              const msg = classifySipFailure({
                cause: e?.cause,
                status_code: code,
                reason_phrase: e?.message?.reason_phrase,
              });
              log('session.failed', `${remoteNumber} code=${code ?? '?'} → ${msg}`, 'error');
              // Dismiss native Android notification/ringtone on failure (CANCEL,
              // timeout, busy, etc.) so the phone stops ringing.
              dismissIncomingNotif();
              answeringRef.current = false;
              callStateRef.current = 'idle'; setCallState('idle');
              if (timerRef.current) clearInterval(timerRef.current);
              stopStats();
              setActiveCallNumber('');
              // Le CANCEL/timeout d'un appel ne doit pas laisser l'UI en
              // "Connecting" — vérifie l'UA (re-REGISTER si besoin).
              ensureRegisteredThenRestore('session.failed');
              // ---- 488 Not Acceptable Here: auto-retry once with the legacy
              // PCMU-only SDP modifier (covers PBX profiles that refuse Opus).
              if (code === 488 && callAttemptRef.current === 1 && lastCallNumberRef.current) {
                callAttemptRef.current = 2;
                const retryNumber = lastCallNumberRef.current;
                log('call.retry-488', `→ ${retryNumber} with PCMU-only fallback`, 'warn');
                setSipError('Codec refusé (488) — nouvelle tentative en PCMU…', ctx);
                setTimeout(() => { try { placeCallInternal(retryNumber, true); } catch {} }, INVITE_RETRY_BACKOFF_MS);
              } else {
                setSipError(msg, ctx);
              }
            });
          });
          ua.start();
          uaRef.current = ua;
          armRegistrationWatchdog();
        })
        .catch((err) => {
          if (cancelled) return;
          setSipStatus('error');
          const msg = err instanceof JsSIPUnavailableError
            ? 'Phone library failed to load. Check your internet connection and try again.'
            : classifySipFailure({ cause: err?.message });
          setSipError(msg, ctx);
          log('ua.create-failed', `${err?.name || ''}: ${err?.message || ''}`, 'error');
          scheduleRetry();
        });
    };

    scheduleRetry = async () => {
      if (cancelled) return;
      if (authBlockedRef.current) return;

      const attempt = retryAttemptRef.current;
      if (attempt >= MAX_AUTO_RETRIES) {
        const msg = `Auto-retry limit reached (${MAX_AUTO_RETRIES} attempts). Tap “Retry connection” to try again.`;
        setSipStatus('error');
        setSipError(msg, ctx);
        setRetryLimitReached(true);
        setNextRetryAt(null);
        log('retry.limit-reached', `${MAX_AUTO_RETRIES} attempts`, 'error');
        return;
      }

      // Reachability probe for WSS only. SIP/TLS relies on the SIP registration itself.
      console.log('[SIP][android] JsSIP scheduleRetry — about to probe WSS:', config.wssUrl);
      if (config.wssUrl?.startsWith('wss://')) {
        log('probe.start', config.wssUrl);
        const probe = await probeWss(config.wssUrl, 3500);
        if (cancelled) return;
        log(probe.ok ? 'probe.ok' : 'probe.fail', `${config.wssUrl} ${probe.reason || ''} ${probe.ms}ms`, probe.ok ? 'info' : 'warn');
        if (!probe.ok) {
          setSipStatus('error');
          setSipError(`Phone server unreachable (${probe.reason || 'no response'}). Check network / WSS endpoint.`, ctx);
          setNextRetryAt(null);
          return;
        }
      }

      const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
      retryAttemptRef.current = attempt + 1;
      setRetryAttempt(attempt + 1);
      clearRetry();
      setSipStatus('retrying');
      const fireAt = Date.now() + delay;
      setNextRetryAt(fireAt);
      log('retry.scheduled', `attempt=${attempt + 1}/${MAX_AUTO_RETRIES} delay=${Math.round(delay / 1000)}s`);
      retryTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        log('retry.fire', `attempt=${attempt + 1}`);
        try { uaRef.current?.stop(); } catch {}
        uaRef.current = null;
        start();
      }, delay);
    };

    reconnectRef.current = () => {
      if (cancelled) return;
      clearRetry();
      retryAttemptRef.current = 0;
      setRetryAttempt(0);
      setRetryLimitReached(false);
      authBlockedRef.current = false;
      log('reconnect.manual', 'user-initiated');
      try { uaRef.current?.stop(); } catch {}
      uaRef.current = null;
      start();
    };

    start();

    return () => {
      cancelled = true;
      clearRetry();
      clearRegistrationWatchdog();
      if (reRegisterTimerRef.current) { clearTimeout(reRegisterTimerRef.current); reRegisterTimerRef.current = null; }
      if (statsTimerRef.current) { clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
      retryAttemptRef.current = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      try { uaRef.current?.stop(); } catch {}
      uaRef.current = null;
      reconnectRef.current = () => {};
    };
  }, [config?.extension, config?.wssUrl, config?.domain, config?.password, opts.jsSipTimeoutMs, reconnectTick, log, setSipError, setSipStatus]);

  // Auto-reconnect on network recovery / app foreground.
  // Guarantees SIP re-registration within seconds of network coming back,
  // instead of waiting for the JsSIP disconnected→scheduleRetry backoff.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let detachNative: (() => void) | null = null;

    const trigger = (source: string) => {
      if (cancelled) return;
      if (sipStatusRef.current === 'registered' || sipStatusRef.current === 'connecting') return;
      log('reconnect.auto', `source=${source} status=${sipStatusRef.current}`, 'warn');
      try { reconnectRef.current(); } catch (e: any) {
        log('reconnect.auto.failed', e?.message || '', 'error');
      }
    };

    // Capacitor Network + App foreground (Android + iOS WebView).
    import('../lib/sip/nativeAutoReconnect')
      .then((m) => m.attachNativeAutoReconnect(() => trigger('native')))
      .then((d) => { if (cancelled) { try { d(); } catch {} } else { detachNative = d; } })
      .catch(() => {});

    // WebView / browser fallback — fires even if Capacitor plugins fail to load.
    const onOnline = () => trigger('window.online');
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        trigger('visibilitychange');
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (detachNative) { try { detachNative(); } catch {} }
    };
  }, [config?.extension, config?.wssUrl, log]);


  // HD audio capture constraints — driven by the user's Settings preferences
  // (noise cancellation on/off + mode). Built lazily on each call so toggling
  // in Settings takes effect on the next getUserMedia().
  // NOTE: require() is NOT available in Capacitor Android WebView (ESM only).
  // Using a static ESM import instead to avoid ReferenceError on Android.
  const HD_AUDIO_CONSTRAINTS: MediaStreamConstraints = (() => {
    try {
      return getAudioConstraints();
    } catch {
      return {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        } as any,
        video: false,
      };
    }
  })();

  /** Parse SDP audio m-line + rtpmap lines into an ordered codec list. */
  const extractAudioCodecs = (sdp: string): string[] => {
    try {
      const audio = sdp.split(/\r?\nm=/).find((s) => s.startsWith('audio'));
      if (!audio) return [];
      const firstLine = ('m=' + audio).split(/\r?\n/)[0];
      const pts = firstLine.split(/\s+/).slice(3);
      const map: Record<string, string> = {};
      const rtpRe = /^a=rtpmap:(\d+)\s+([^\s/]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = rtpRe.exec(sdp))) map[m[1]] = m[2].toUpperCase();
      return pts.map((pt) => map[pt] || `pt${pt}`);
    } catch { return []; }
  };

  /** Read the negotiated outbound audio codec from peerconnection stats. */
  const readNegotiatedCodec = async (pc: RTCPeerConnection | undefined) => {
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let codecId: string | undefined;
      stats.forEach((r: any) => {
        if (r.type === 'outbound-rtp' && r.kind === 'audio' && r.codecId) codecId = r.codecId;
      });
      if (!codecId) return;
      const codec: any = stats.get(codecId);
      if (codec?.mimeType) {
        const name = String(codec.mimeType).split('/').pop()?.toUpperCase() || null;
        setNegotiatedCodec(name);
        log('codec.negotiated', `${name} @ ${codec.clockRate || '?'}Hz`);
      }
    } catch (e: any) {
      log('codec.stats-failed', e?.message || '', 'warn');
    }
  };

  /** Place a call. `forcePcmu=true` uses a secure WebRTC PCMU-only SDP modifier — used as a 488 fallback. */
  const placeCallInternal = async (number: string, forcePcmu = false): Promise<boolean> => {
    if (!uaRef.current || !config) return false;
    setActiveCallNumber(number);
    callStateRef.current = 'ringing'; setCallState('ringing');
    setOfferedCodecs([]);
    setNegotiatedCodec(null);
    lastCallNumberRef.current = number;

    // Android WebView requires an explicit getUserMedia grant BEFORE JsSIP
    // attempts its own capture. Without it, uaRef.call() silently fails and
    // the call never rings out. iOS handles this via CallKit / WKWebView so
    // we skip the pre-flight there.
    if (Capacitor.getPlatform() === 'android') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        log('mic.permission', 'granted (android pre-call)');
      } catch (e: any) {
        console.error('[SIP] microphone permission denied', e);
        setSipError('Microphone permission denied — please allow microphone access');
        callStateRef.current = 'idle'; setCallState('idle');
        setActiveCallNumber('');
        return false;
      }
    }

    try {
      const iceServers = await fetchIceServers().catch(() => FALLBACK_ICE_SERVERS);
      log('ice.servers', `count=${iceServers.length}`);
      const callOpts: any = {
        mediaConstraints: HD_AUDIO_CONSTRAINTS,
        sessionDescriptionHandlerModifiers: forcePcmu
          ? [buildSdpModifier({ forcePcmu: true } as any)]
          : [sdpModifier],
        rtcOfferConstraints: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
          voiceActivityDetection: false,
        },
        pcConfig: {
          iceServers,
          iceTransportPolicy: 'all',
          bundlePolicy: 'balanced',
        },
        // On Android WebView, ICE gathering can take 3-10 s. Cap it at 2.5 s
        // so the INVITE SDP is sent before FusionPBX's session timer fires.
        ...(Capacitor.getPlatform() === 'android' ? { iceGatheringTimeout: 2500 } : {}),
      };
      if (forcePcmu) log('call.fallback', 'secure PCMU-only SDP rewrite armed');
      sipDebug('placeCallInternal pcConfig', PC_CONFIG);
      // Android: switch audio mode to MODE_IN_COMMUNICATION before INVITE so
      // the earpiece / speaker routing is armed when the remote track arrives.
      uaRef.current.call(`sip:${number}@${config.domain}`, callOpts);
      return true;
    } catch (err: any) {
      console.error('[AVA keypad] SIP call exception', err);
      callStateRef.current = 'idle'; setCallState('idle');
      setActiveCallNumber('');
      setSipError(classifySipFailure({ cause: err?.message }));
      return false;
    }
  };


  const call = (number: string): Promise<boolean> | boolean => {
    if (sipStatus !== 'registered') return false;
    callAttemptRef.current = 1;
    return placeCallInternal(number, false);
  };
  const dismissIncomingNotif = () => {
    if (Capacitor.getPlatform() === 'android') {
      dismissAndroidIncomingCallNotif();
    }
  };
  const hangup = () => {
    dismissIncomingNotif();
    // Disable auto-retry so watchCallEstablishment does not re-dial after
    // a manual hangup (callAttemptRef === 1 would trigger placeCallInternal retry).
    callAttemptRef.current = 0;
    try { sessionRef.current?.terminate(); } catch {}
    sessionRef.current = null;
    callStateRef.current = 'idle'; setCallState('idle');
    if (timerRef.current) clearInterval(timerRef.current);
    setCallTimer(0);
    setActiveCallNumber('');
    // Après un raccroché manuel, vérifier l'UA (re-REGISTER si besoin).
    ensureRegisteredThenRestore('hangup');
  };
  // Guard: prevents answer() from being called more than once per incoming session.
  // Without this, the sipCallAction listener fires multiple times (Android re-broadcasts
  // the event on each MainActivity resume) causing JsSIP "Invalid status: 5" errors.
  const answeringRef = useRef(false);
  const answer = async () => {
    log('answer.called', `sessionRef=${sessionRef.current ? 'ok' : 'NULL'} callState=${callState} answering=${answeringRef.current}`);
    if (answeringRef.current) {
      log('answer.skipped', 'already answering — ignoring duplicate call', 'warn');
      return;
    }
    answeringRef.current = true;
    dismissIncomingNotif();
    if (!sessionRef.current) {
      log('answer.failed', 'sessionRef is null — cannot answer', 'error');
      answeringRef.current = false;
      return;
    }
    const iceServers = await fetchIceServers().catch(() => FALLBACK_ICE_SERVERS);
    log('answer.iceServers', `count=${iceServers.length}`);
    // On Android WebView, ICE gathering can take 3-10 s. JsSIP has no built-in
    // timeout — it waits for iceGatheringState=complete or a null candidate.
    // FusionPBX cancels the call after ~4 s if it hasn't received the 200 OK SDP.
    // Fix: listen to session 'icecandidate' events and call ready() after 2 s
    // so JsSIP sends the 200 OK with whatever candidates are available.
    const isAndroid = Capacitor.getPlatform() === 'android';
    if (isAndroid && sessionRef.current) {
      let iceTimer: ReturnType<typeof setTimeout> | null = null;
      const iceCandidateHandler = ({ ready }: { candidate: RTCIceCandidate | null; ready: () => void }) => {
        if (iceTimer) return; // already armed
        iceTimer = setTimeout(() => {
          log('answer.iceForced', 'forcing ICE ready after 2s timeout on Android');
          ready();
        }, 2000);
      };
      sessionRef.current.once('icecandidate', iceCandidateHandler);
    }
    try {
      sessionRef.current?.answer({
        mediaConstraints: HD_AUDIO_CONSTRAINTS,
        sessionDescriptionHandlerModifiers: [sdpModifier],
        pcConfig: {
          iceServers,
          iceTransportPolicy: 'all',
          bundlePolicy: 'balanced',
        },
      });
      log('answer.sent', 'session.answer() called successfully');
    } catch (e: any) {
      log('answer.error', e?.message || String(e), 'error');
      answeringRef.current = false;
    }
  };
  const mute = () => { sessionRef.current?.mute({ audio: true }); setIsMuted(true); };
  const unmute = () => { sessionRef.current?.unmute({ audio: true }); setIsMuted(false); };
  const hold = () => { sessionRef.current?.hold(); setIsOnHold(true); };
  const unhold = () => { sessionRef.current?.unhold(); setIsOnHold(false); };
  const sendDTMF = (key: string) =>
    sessionRef.current?.sendDTMF(key, { duration: 100, interToneGap: 70 });
  const setStatus = (status: string) => console.log('Status change:', status);
  const reconnect = useCallback(() => {
    setSipErrorState('');
    setRetryLimitReached(false);
    setSipStatus('connecting');
    if (reconnectRef.current) {
      reconnectRef.current();
    }
    setReconnectTick((t) => t + 1);
  }, [setSipStatus]);

  return {
    sipStatus, sipError, callState, callTimer, isMuted, isOnHold, activeCallNumber,
    call, hangup, answer, mute, unmute, hold, unhold, sendDTMF, setStatus, reconnect,
    lastPersistedError, sipLog, clearSipLog, clearSipState, retryAttempt, nextRetryAt, retryLimitReached,
    quality, audioProfile, setAudioProfile,
    offeredCodecs, negotiatedCodec,
  };
}

// ---------------------------------------------------------------------------
// Public hook: dispatches to native PJSIP or JsSIP based on VITE_NATIVE_SIP.
// When NATIVE_SIP_ENABLED is true we *exclusively* use the native plugin —
// the JsSIP UA must never be instantiated (it would steal the mic and
// trigger WebRTC restarts that fight the native socket).
// ---------------------------------------------------------------------------
import { NATIVE_SIP_ENABLED, startAndroidSipService, stopAndroidSipService } from '../lib/sip/nativeSipProvider';
import { useSoftphoneNative } from './useSoftphoneNative';
import { useSoftphoneVerto } from './useSoftphoneVerto';
import { notifySipDispatcherLoaded } from '../lib/sip/bootSipGuard';
export function useSoftphone(
  config: SIPConfig | null,
  opts: { jsSipTimeoutMs?: number } = {},
): UseSoftphoneReturn {
  notifySipDispatcherLoaded();
  const platform = Capacitor.getPlatform();
  if (NATIVE_SIP_ENABLED) {
    // iOS → native PJSIP
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSoftphoneNative(config);
  }
  if (platform === 'android') {
    // Android → JsSIP over WSS (port 7443).
    // Migrated from Verto (port 8082) because the Verto sessid changes on
    // every WebSocket reconnect, causing FreeSWITCH to reject verto.answer
    // and leaving the caller ringing with no audio established.
    // JsSIP uses standard SIP over WSS which handles reconnections correctly
    // and is confirmed working with FusionPBX wss-binding :7443.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSoftphoneJsSip(config, opts);
  }
  // Web / dev → JsSIP over WSS.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSoftphoneJsSip(config, opts);
}

