// ---------------------------------------------------------------------------
// Shared WebRTC config + debug helpers for the SIP softphone.
//
// IMPORTANT: this file is mirrored at
//   apps/ava-softphone-mobile/src/lib/sip/rtcConfig.ts
// The sub-app's tsconfig only includes its own `src`, so we cannot import
// across roots. Keep both files byte-identical — edit one, copy to the other.
// ---------------------------------------------------------------------------

// ---------- Env-driven ICE provider configuration -------------------------
// Defaults target Metered.ca (TURN/TURNS on 80/443, see docs/turn-ios-metered.md).
// Override per environment (prod/staging) with Vite env vars:
//   VITE_TURN_URLS              comma-separated turn:/turns: urls
//   VITE_TURN_USERNAME          shared username for the urls above
//   VITE_TURN_CREDENTIAL        shared credential
//   VITE_STUN_URLS              comma-separated stun: urls (optional)
//   VITE_TURN_FALLBACK_URLS     fallback turn urls if probe fails
//   VITE_TURN_FALLBACK_USERNAME / VITE_TURN_FALLBACK_CREDENTIAL
function readEnv(name: string): string | undefined {
  try {
    // @ts-ignore — Vite env
    const v = typeof import.meta !== 'undefined' ? import.meta?.env?.[name] : undefined;
    return typeof v === 'string' && v.length ? v : undefined;
  } catch { return undefined; }
}
function buildIceServers(opts: {
  stunEnv: string; turnEnv: string; userEnv: string; credEnv: string;
  defaults: RTCIceServer[];
}): RTCIceServer[] {
  const turnUrls = readEnv(opts.turnEnv)?.split(',').map(s => s.trim()).filter(Boolean);
  if (!turnUrls?.length) return opts.defaults;
  const username = readEnv(opts.userEnv) ?? '';
  const credential = readEnv(opts.credEnv) ?? '';
  const stunUrls = readEnv(opts.stunEnv)?.split(',').map(s => s.trim()).filter(Boolean)
    ?? ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
  return [
    ...stunUrls.map((urls) => ({ urls })),
    ...turnUrls.map((urls) => ({ urls, username, credential })),
  ];
}

const METERED_DEFAULTS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:global.relay.metered.ca:80', username: 'e499486ca9b7d5a03a01e915', credential: 'uMFpNAFBoFFUHOdF' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'e499486ca9b7d5a03a01e915', credential: 'uMFpNAFBoFFUHOdF' },
  { urls: 'turn:global.relay.metered.ca:443', username: 'e499486ca9b7d5a03a01e915', credential: 'uMFpNAFBoFFUHOdF' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'e499486ca9b7d5a03a01e915', credential: 'uMFpNAFBoFFUHOdF' },
];

/** Primary STUN/TURN — env-overridable, defaults to Metered.ca. */
export const ICE_SERVERS: RTCIceServer[] = buildIceServers({
  stunEnv: 'VITE_STUN_URLS', turnEnv: 'VITE_TURN_URLS',
  userEnv: 'VITE_TURN_USERNAME', credEnv: 'VITE_TURN_CREDENTIAL',
  defaults: METERED_DEFAULTS,
});

export const PC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: 'all',
  bundlePolicy: 'balanced',
};


// ---------- Debug mode -----------------------------------------------------
// Toggle without code changes:
//   localStorage.setItem('sip:debug', '1')      → enable SIP/ICE/SDP logs
//   localStorage.setItem('sip:debug', '0')      → disable
//   ?sipDebug=1 in URL                          → enable for the session
//   VITE_SIP_DEBUG=1 (build-time)               → always on
export function isSipDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const url = new URLSearchParams(window.location.search);
    if (url.get('sipDebug') === '1') return true;
    const ls = window.localStorage?.getItem('sip:debug');
    if (ls === '1' || ls === 'true') return true;
    if (ls === '0' || ls === 'false') return false;
  } catch {}
  try {
    // @ts-ignore — Vite env
    if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SIP_DEBUG === '1') return true;
  } catch {}
  return false;
}

export function sipDebug(...args: any[]) {
  if (isSipDebugEnabled()) console.log('[SIP][debug]', ...args);
}

// ---------- ICE event instrumentation --------------------------------------

export type IceLogger = (event: string, detail?: string, level?: 'info' | 'warn' | 'error') => void;

/** Returns true when the candidate address is an iOS WKWebView mDNS .local hostname. */
export function isMdnsCandidate(candidate: RTCIceCandidate | null | undefined): boolean {
  if (!candidate?.candidate) return false;
  // candidate string format: "candidate:... <address> <port> typ host ..."
  return /\s[0-9a-f-]{8,}\.local\s/i.test(candidate.candidate);
}

/** Classify an ICE candidate by transport type for log readability. */
export function classifyIceCandidate(candidate: RTCIceCandidate | null | undefined): string {
  if (!candidate || !candidate.candidate) return 'end-of-candidates';
  const type = (candidate as any).type || /\styp\s(\w+)/.exec(candidate.candidate)?.[1] || '?';
  const proto = (candidate as any).protocol || /\s(udp|tcp)\s/i.exec(candidate.candidate)?.[1] || '?';
  // host = local interface, srflx = STUN-derived, relay = TURN, prflx = peer-reflexive
  const source =
    type === 'relay' ? 'TURN'
    : type === 'srflx' ? 'STUN'
    : type === 'host' ? (isMdnsCandidate(candidate) ? 'LOCAL-mDNS' : 'LOCAL')
    : type === 'prflx' ? 'PEER'
    : type.toUpperCase();
  return `${source}/${proto}`;
}

/** Attach verbose ICE/SDP listeners to an RTCPeerConnection.
 *  Logs go through the supplied logger AND console.log when debug is on.
 *  Returns a teardown fn. */
export function instrumentPeerConnection(pc: RTCPeerConnection, log: IceLogger): () => void {
  const debug = isSipDebugEnabled();

  const onIceCandidate = (e: RTCPeerConnectionIceEvent) => {
    const c = e.candidate;
    if (!c) {
      log('ice.candidate.end', 'end-of-candidates');
      if (debug) console.log('[SIP][ICE] end-of-candidates');
      return;
    }
    const kind = classifyIceCandidate(c);
    log('ice.candidate', `${kind} ${c.candidate}`);
    if (debug) console.log('[SIP][ICE] candidate:', kind, c.candidate);
  };
  const onGather = () => {
    log('ice.gatheringState', pc.iceGatheringState, pc.iceGatheringState === 'complete' ? 'info' : 'info');
    if (debug) console.log('[SIP][ICE] gatheringState:', pc.iceGatheringState);
  };
  const onConn = () => {
    const s = pc.iceConnectionState;
    const lvl = s === 'failed' || s === 'disconnected' ? 'warn' : 'info';
    log('ice.connectionState', s, lvl);
    if (debug) console.log('[SIP][ICE] connectionState:', s);
  };
  const onSignal = () => {
    if (debug) console.log('[SIP][SDP] signalingState:', pc.signalingState);
  };

  pc.addEventListener('icecandidate', onIceCandidate);
  pc.addEventListener('icegatheringstatechange', onGather);
  pc.addEventListener('iceconnectionstatechange', onConn);
  pc.addEventListener('signalingstatechange', onSignal);

  return () => {
    pc.removeEventListener('icecandidate', onIceCandidate);
    pc.removeEventListener('icegatheringstatechange', onGather);
    pc.removeEventListener('iceconnectionstatechange', onConn);
    pc.removeEventListener('signalingstatechange', onSignal);
  };
}

/** Wait for the SIP session to reach `confirmed` AND ICE to be
 *  connected/completed within `timeoutMs`. Resolves with the outcome —
 *  callers can show a toast on failure. */
export interface CallEstablishmentResult {
  ok: boolean;
  reason?: 'timeout-session' | 'timeout-ice' | 'session-failed' | 'ice-failed';
  iceState?: RTCIceConnectionState;
  sessionConfirmed: boolean;
}

export function watchCallEstablishment(
  session: any,
  pc: RTCPeerConnection | undefined,
  timeoutMs = 15000,
): Promise<CallEstablishmentResult> {
  return new Promise((resolve) => {
    let confirmed = false;
    let iceOk = false;
    let done = false;
    const finish = (r: CallEstablishmentResult) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(r);
    };
    const check = () => {
      if (confirmed && iceOk) finish({ ok: true, sessionConfirmed: true, iceState: pc?.iceConnectionState });
    };
    const onConfirmed = () => { confirmed = true; check(); };
    const onFailed = (e: any) => finish({
      ok: false, reason: 'session-failed',
      sessionConfirmed: confirmed, iceState: pc?.iceConnectionState,
    });
    const onIce = () => {
      const s = pc?.iceConnectionState;
      if (s === 'connected' || s === 'completed') { iceOk = true; check(); }
      else if (s === 'failed') finish({ ok: false, reason: 'ice-failed', sessionConfirmed: confirmed, iceState: s });
    };
    const cleanup = () => {
      try { session?.removeListener?.('confirmed', onConfirmed); } catch {}
      try { session?.removeListener?.('failed', onFailed); } catch {}
      try { pc?.removeEventListener('iceconnectionstatechange', onIce); } catch {}
      clearTimeout(t);
    };

    try { session?.on?.('confirmed', onConfirmed); } catch {}
    try { session?.on?.('failed', onFailed); } catch {}
    try { pc?.addEventListener('iceconnectionstatechange', onIce); } catch {}
    // Check current ICE state in case already connected.
    onIce();

    const t = setTimeout(() => {
      if (!confirmed) finish({ ok: false, reason: 'timeout-session', sessionConfirmed: false, iceState: pc?.iceConnectionState });
      else finish({ ok: false, reason: 'timeout-ice', sessionConfirmed: true, iceState: pc?.iceConnectionState });
    }, timeoutMs);
  });
}

// ---------- Fallback ICE servers (env-overridable, OpenRelay defaults) -----
const OPENRELAY_DEFAULTS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = buildIceServers({
  stunEnv: 'VITE_STUN_FALLBACK_URLS', turnEnv: 'VITE_TURN_FALLBACK_URLS',
  userEnv: 'VITE_TURN_FALLBACK_USERNAME', credEnv: 'VITE_TURN_FALLBACK_CREDENTIAL',
  defaults: OPENRELAY_DEFAULTS,
});

// ---------- Diagnostic bus (UI + console) ----------------------------------
export type IceDiagnosticEvent =
  | { kind: 'ice-state'; state: RTCIceConnectionState }
  | { kind: 'gather-state'; state: RTCIceGatheringState }
  | { kind: 'candidate'; source: string; raw: string }
  | { kind: 'probe-started' }
  | { kind: 'probe-result'; provider: 'metered' | 'fallback'; relayFound: boolean; durationMs: number }
  | { kind: 'pc-config'; provider: 'metered' | 'fallback' }
  | { kind: 'first-relay-candidate'; latencyMs: number }
  | { kind: 'ice-connected'; latencyMs: number }
  | { kind: 'mdns-candidate'; raw: string }
  | { kind: 'webrtc-error'; message: string; where: string }
  | { kind: 'ice-fallback'; from: RTCIceTransportPolicy; to: RTCIceTransportPolicy; reason: string };

const _diagListeners = new Set<(e: IceDiagnosticEvent) => void>();
export function onIceDiagnostic(fn: (e: IceDiagnosticEvent) => void): () => void {
  _diagListeners.add(fn);
  return () => _diagListeners.delete(fn);
}
function emitDiag(e: IceDiagnosticEvent) {
  _diagListeners.forEach((l) => { try { l(e); } catch {} });
  if (isSipDebugEnabled()) console.log('[SIP][diag]', e);
  emitTelemetry(e);
}

// ---------- Telemetry sink -------------------------------------------------
// Posts diagnostic events to an HTTP endpoint (VITE_SIP_TELEMETRY_URL) or to
// a user-registered handler. Best-effort, never throws, uses sendBeacon when
// available so navigations don't drop the event.
export type TelemetrySink = (event: { name: string; value?: number; meta?: Record<string, unknown> }) => void;
let _telemetrySink: TelemetrySink | null = null;
export function setTelemetrySink(sink: TelemetrySink | null) { _telemetrySink = sink; }

function emitTelemetry(e: IceDiagnosticEvent) {
  let payload: { name: string; value?: number; meta?: Record<string, unknown> } | null = null;
  if (e.kind === 'probe-started') payload = { name: 'sip.turn.probe_started' };
  else if (e.kind === 'probe-result') payload = { name: 'sip.turn.probe_result', value: e.durationMs, meta: { provider: e.provider, relayFound: e.relayFound } };
  else if (e.kind === 'pc-config') payload = { name: 'sip.turn.provider_selected', meta: { provider: e.provider } };
  else if (e.kind === 'first-relay-candidate') payload = { name: 'sip.ice.first_relay_ms', value: e.latencyMs };
  else if (e.kind === 'ice-connected') payload = { name: 'sip.ice.connected_ms', value: e.latencyMs };
  if (!payload) return;
  try { _telemetrySink?.(payload); } catch {}
  const url = readEnv('VITE_SIP_TELEMETRY_URL');
  if (!url || typeof navigator === 'undefined') return;
  try {
    const body = JSON.stringify({ ...payload, ts: Date.now(), ua: navigator.userAgent });
    if ('sendBeacon' in navigator) navigator.sendBeacon(url, body);
    else fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch {}
}

// ---------- TURN reachability probe + fallback -----------------------------
let _activePcConfig: RTCConfiguration | null = null;
let _activeProvider: 'metered' | 'fallback' = 'metered';
let _probePromise: Promise<RTCConfiguration> | null = null;

async function tryRelayCandidate(servers: RTCIceServer[], timeoutMs: number): Promise<boolean> {
  if (typeof RTCPeerConnection === 'undefined') return true;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: 'relay' });
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      try { pc.close(); } catch {}
      resolve(v);
    };
    pc.addEventListener('icecandidate', (e) => {
      const c = e.candidate;
      if (!c) { finish(false); return; }
      const isRelay = (c as any).type === 'relay' || /\styp\srelay/.test(c.candidate);
      if (isRelay) finish(true);
    });
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') finish(false);
    });
    try {
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => finish(false));
    } catch { finish(false); }
    setTimeout(() => finish(false), timeoutMs);
  });
}

export async function probeTurnEndpoints(timeoutMs = 5000): Promise<{ provider: 'metered' | 'fallback'; relayFound: boolean; durationMs: number }> {
  emitDiag({ kind: 'probe-started' });
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const meteredOk = await tryRelayCandidate(ICE_SERVERS, timeoutMs);
  if (meteredOk) {
    const d = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    emitDiag({ kind: 'probe-result', provider: 'metered', relayFound: true, durationMs: d });
    return { provider: 'metered', relayFound: true, durationMs: d };
  }
  const fbOk = await tryRelayCandidate(FALLBACK_ICE_SERVERS, timeoutMs);
  const d = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  emitDiag({ kind: 'probe-result', provider: 'fallback', relayFound: fbOk, durationMs: d });
  return { provider: 'fallback', relayFound: fbOk, durationMs: d };
}

/** Run the probe once at startup; cache the resulting PC config.
 *  Subsequent calls reuse the cached result. */
export function ensureActivePcConfig(): Promise<RTCConfiguration> {
  if (_activePcConfig) return Promise.resolve(_activePcConfig);
  if (_probePromise) return _probePromise;
  _probePromise = (async () => {
    try {
      const res = await probeTurnEndpoints();
      const servers = res.provider === 'metered' ? ICE_SERVERS : FALLBACK_ICE_SERVERS;
      _activeProvider = res.provider;
      _activePcConfig = { iceServers: servers, iceTransportPolicy: 'all', bundlePolicy: 'balanced' };
      emitDiag({ kind: 'pc-config', provider: res.provider });
    } catch {
      _activeProvider = 'metered';
      _activePcConfig = PC_CONFIG;
      emitDiag({ kind: 'pc-config', provider: 'metered' });
    }
    return _activePcConfig!;
  })();
  return _probePromise;
}

/** Synchronous accessor — returns the probed config if available,
 *  otherwise the default Metered config. */
export function getActivePcConfig(): RTCConfiguration {
  return _activePcConfig ?? PC_CONFIG;
}
export function getActiveTurnProvider(): 'metered' | 'fallback' { return _activeProvider; }

/** Test-only: reset the cached probe result. */
export function __resetActivePcConfig() {
  _activePcConfig = null;
  _probePromise = null;
  _activeProvider = 'metered';
}

// Tap into ICE events so the diagnostic overlay + telemetry stay live.
const _origInstrument = instrumentPeerConnection;
export function instrumentPeerConnectionWithDiag(pc: RTCPeerConnection, log: IceLogger): () => void {
  const teardown = _origInstrument(pc, log);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let firstRelaySent = false;
  let connectedSent = false;
  const onCand = (e: RTCPeerConnectionIceEvent) => {
    if (!e.candidate) return;
    const source = classifyIceCandidate(e.candidate);
    emitDiag({ kind: 'candidate', source, raw: e.candidate.candidate });
    if (isMdnsCandidate(e.candidate)) {
      emitDiag({ kind: 'mdns-candidate', raw: e.candidate.candidate });
    }
    if (!firstRelaySent && source.startsWith('TURN')) {
      firstRelaySent = true;
      const latency = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      emitDiag({ kind: 'first-relay-candidate', latencyMs: latency });
    }
  };
  const onCandErr = (e: Event) => {
    const err: any = e;
    const msg = `code=${err.errorCode ?? '?'} url=${err.url ?? '?'} ${err.errorText ?? ''}`.trim();
    emitDiag({ kind: 'webrtc-error', message: msg, where: 'icecandidateerror' });
    log('ice.candidate.error', msg, 'warn');
  };
  const onIce = () => {
    emitDiag({ kind: 'ice-state', state: pc.iceConnectionState });
    if (pc.iceConnectionState === 'failed') {
      emitDiag({ kind: 'webrtc-error', message: 'iceConnectionState=failed', where: 'pc.iceconnectionstatechange' });
    }
    if (!connectedSent && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
      connectedSent = true;
      const latency = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      emitDiag({ kind: 'ice-connected', latencyMs: latency });
    }
  };
  const onGather = () => emitDiag({ kind: 'gather-state', state: pc.iceGatheringState });
  pc.addEventListener('icecandidate', onCand);
  pc.addEventListener('icecandidateerror', onCandErr as any);
  pc.addEventListener('iceconnectionstatechange', onIce);
  pc.addEventListener('icegatheringstatechange', onGather);

  // ---- Auto-fallback: if ICE stalls in 'new'/'checking' for too long
  // while we still have mDNS .local host candidates (iOS WKWebView
  // mDNS obfuscation that FusionPBX cannot resolve), force a
  // relay-only restart so we go through TURN exclusively.
  let mdnsSeen = false;
  const mdnsTap = (e: RTCPeerConnectionIceEvent) => { if (isMdnsCandidate(e.candidate)) mdnsSeen = true; };
  pc.addEventListener('icecandidate', mdnsTap);
  const stallTimer = setTimeout(() => {
    if (connectedSent) return;
    const s = pc.iceConnectionState;
    if (s !== 'new' && s !== 'checking') return;
    const reason = mdnsSeen
      ? 'ice-stalled-with-mdns-candidates (iOS WKWebView .local unresolvable by FusionPBX)'
      : 'ice-stalled';
    emitDiag({ kind: 'ice-fallback', from: 'all', to: 'relay', reason });
    log('ice.fallback', reason, 'warn');
    try {
      pc.setConfiguration({ ...getActivePcConfig(), iceTransportPolicy: 'relay' });
      (pc as any).restartIce?.();
    } catch (err: any) {
      emitDiag({ kind: 'webrtc-error', message: String(err?.message ?? err), where: 'restartIce' });
    }
  }, 6000);

  return () => {
    teardown();
    clearTimeout(stallTimer);
    pc.removeEventListener('icecandidate', onCand);
    pc.removeEventListener('icecandidate', mdnsTap);
    pc.removeEventListener('icecandidateerror', onCandErr as any);
    pc.removeEventListener('iceconnectionstatechange', onIce);
    pc.removeEventListener('icegatheringstatechange', onGather);
  };
}

/** Returns true when the iOS ICE diagnostic overlay should render. */
export function isIceDiagOverlayEnabled(): boolean {
  if (isSipDebugEnabled()) return true;
  try {
    const url = new URLSearchParams(window.location.search);
    if (url.get('iceDiag') === '1') return true;
    const ls = window.localStorage?.getItem('sip:iceDiag');
    if (ls === '1' || ls === 'true') return true;
  } catch {}
  return false;
}


