import * as JsSIPModule from 'jssip';
import { Capacitor } from '@capacitor/core';

// Module-level barrier: JsSIP is disabled ONLY when the native PJSIP plugin is
// actually active — i.e. iOS with VITE_NATIVE_SIP=true. On Android the native
// plugin is a stub, so we must let JsSIP run.
let __PLATFORM = 'web';
try { __PLATFORM = Capacitor.getPlatform(); } catch { /* ssr */ }
const __NATIVE_SIP_ACTIVE =
  ((import.meta as any).env?.VITE_NATIVE_SIP ?? '').toString() === 'true' &&
  __PLATFORM === 'ios';
if (__NATIVE_SIP_ACTIVE) {
  // eslint-disable-next-line no-console
  console.log('[jssipProvider] iOS native SIP active — JsSIP entry points disabled');
}

declare global {
  interface Window {
    JsSIP: any;
  }
}

export interface SIPConfig {
  extension: string;
  password: string;
  domain: string;
  /** Primary WSS URL. Additional `wssUrls` may be supplied for fallback. */
  wssUrl: string;
  wssUrls?: string[];
  displayName?: string;
  authUsername?: string;
  /** Optional native TCP SIP hints (Android uses TCP/5060). */
  server?: string;
  port?: number;
  transport?: string;
  /** Forces a clean registration cycle after credentials are refreshed. */
  refreshNonce?: string | number;
  /**
   * Verto WebSocket host for Android. If omitted, derived from `wssUrl`
   * (same hostname, port replaced with `vertoPort`). Set explicitly when
   * the Verto WS endpoint is on a different host than the JsSIP WSS endpoint.
   * Example: "pbxnode.example.com"
   */
  vertoHost?: string;
  /** Verto WebSocket port for Android. Defaults to 8082. */
  vertoPort?: number;
}

export class JsSIPUnavailableError extends Error {
  constructor(msg = 'JsSIP library failed to load') {
    super(msg);
    this.name = 'JsSIPUnavailableError';
  }
}

export function hasWebRTC(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).RTCPeerConnection ||
    (window as any).webkitRTCPeerConnection ||
    (window as any).mozRTCPeerConnection
  );
}

export const WEBRTC_UNAVAILABLE_MESSAGE =
  'WebRTC not supported in this browser. Open in Chrome or Safari, or use the native mobile app.';

function bundledJsSIP() {
  const mod: any = JsSIPModule as any;
  return mod?.UA && (mod?.Socket || mod?.WebSocketInterface) ? mod : mod?.default || null;
}

/** Resolves the bundled JsSIP module, falling back to window.JsSIP if present. */
export function waitForJsSIP(timeoutMs = 8000, intervalMs = 100, requireWebRTC = true): Promise<any> {
  if (__NATIVE_SIP_ACTIVE) {
    return Promise.reject(new JsSIPUnavailableError(
      'JsSIP disabled — native SIP plugin is active (VITE_NATIVE_SIP=true)'
    ));
  }
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      const bundled = bundledJsSIP();
      if (bundled) resolve(bundled);
      else reject(new JsSIPUnavailableError('No window (SSR/non-browser)'));
      return;
    }
    if (requireWebRTC && !hasWebRTC()) {
      reject(new JsSIPUnavailableError(WEBRTC_UNAVAILABLE_MESSAGE));
      return;
    }
    if (window.JsSIP) {
      resolve(window.JsSIP);
      return;
    }
    const bundled = bundledJsSIP();
    if (bundled) {
      window.JsSIP = bundled;
      resolve(bundled);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      if (window.JsSIP) {
        clearInterval(id);
        resolve(window.JsSIP);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(id);
        reject(new JsSIPUnavailableError(
          'Phone library failed to load. SIP calls require a WebRTC-compatible browser (Chrome or Safari) or the native mobile app.'
        ));
      }
    }, intervalMs);
  });
}

export function getJsSIP() {
  if (typeof window !== 'undefined' && window.JsSIP) return window.JsSIP;
  return bundledJsSIP();
}


/* ============================================================
   SDP rewriter — used only for the 488 fallback. Keep WebRTC security
   lines intact, but reduce the audio m-line to PCMU + telephone-event/8000.
   FusionPBX over WSS still requires DTLS-SRTP/ICE; removing those causes 488.
   ============================================================ */
export interface SdpRewriteOpts {
  opusMaxAverageBitrate?: number;  // bps
  opusMaxPlaybackRate?: number;    // Hz
  opusUseInbandFec?: boolean;
  opusUseDtx?: boolean;
  opusPtime?: number;              // ms
}

const DEFAULT_OPTS: Required<SdpRewriteOpts> = {
  opusMaxAverageBitrate: 24000,
  opusMaxPlaybackRate: 16000,
  opusUseInbandFec: true,
  opusUseDtx: true,
  opusPtime: 20,
};

function extractPt(sdp: string, codecRegex: RegExp): string | null {
  const m = sdp.match(new RegExp(`a=rtpmap:(\\d+)\\s+${codecRegex.source}`, 'i'));
  return m ? m[1] : null;
}

export function rewriteSdpForFusionPBX(sdp: string, _opts: SdpRewriteOpts = {}): string {
  let out = sdp;
  // Drop the entire video m-section — audio only.
  out = out.replace(/m=video[\s\S]*?(?=\r\nm=|$)/gi, '');

  const pcmuPt = extractPt(out, /PCMU\/8000/);
  const dtmfPt = out.match(/^a=rtpmap:(\d+)\s+telephone-event\/8000(?:\s|$)/im)?.[1] || null;
  if (!pcmuPt) return out;
  const keepPts = new Set([pcmuPt, dtmfPt].filter(Boolean) as string[]);

  // Restrict audio to PCMU + the browser's actual telephone-event/8000 PT.
  // CRITICAL: keep the original transport (UDP/TLS/RTP/SAVPF).
  out = out.replace(
    /^m=audio\s+(\d+)\s+(\S+)\s+[^\r\n]+/gm,
    (_m, port, proto) => `m=audio ${port} ${proto} ${Array.from(keepPts).join(' ')}`
  );

  // Keep only the rtpmap/fmtp/rtcp-fb lines for the surviving payload types.
  out = out.replace(/^a=rtpmap:(\d+) [^\r\n]+$/gm, (line, pt) =>
    keepPts.has(pt) ? line : ''
  );
  out = out.replace(/^a=fmtp:(\d+) [^\r\n]+$/gm, (line, pt) =>
    keepPts.has(pt) ? line : ''
  );
  out = out.replace(/^a=rtcp-fb:(\d+) [^\r\n]+$/gm, (line, pt) =>
    keepPts.has(pt) ? line : ''
  );

  // Collapse blank lines created by the deletions.
  out = out.replace(/(\r?\n){2,}/g, '\r\n');
  return out;
}

/** Default modifier (auto profile) — kept for backward compatibility. */
export const sdpModifier = (description: any) => {
  if (description?.sdp) {
    try { description.sdp = rewriteSdpForFusionPBX(description.sdp); }
    catch (e) { console.error('[SIP][SDP] rewrite error', e); }
  }
  return Promise.resolve(description);
};

/** Build a profile-driven modifier (used by useSoftphone per call). */
export function buildSdpModifier(opts: SdpRewriteOpts) {
  return (description: any) => {
    if (description?.sdp) {
      try { description.sdp = rewriteSdpForFusionPBX(description.sdp, opts); }
      catch (e) { console.error('[SIP][SDP] rewrite error', e); }
    }
    return Promise.resolve(description);
  };
}

/* ============================================================
   Failure classification — turns JsSIP error blobs into a
   short, user-facing line + actionable hint.
   ============================================================ */
export function classifySipFailure(input: {
  cause?: string;
  message?: string;
  status_code?: number;
  reason_phrase?: string;
}): string {
  const code = input.status_code;
  const reason = (input.reason_phrase || '').toLowerCase();
  const cause = (input.cause || input.message || '').toLowerCase();

  if (code === 401 || /401|unauthorized/.test(reason) || /401|unauthorized/.test(cause)) {
    return 'Wrong SIP password';
  }
  if (code === 403 || /403|forbidden/.test(reason) || /403|forbidden/.test(cause)) {
    return 'Extension not authorized';
  }
  if (code === 488 || /not acceptable/.test(reason)) {
    return 'PBX rejected WebRTC media (488) — use the WebRTC WSS profile/port with DTLS-SRTP enabled.';
  }
  if (code === 407 || /auth/.test(reason) || /unauthor/.test(cause)) {
    return 'Authentication failed — check the SIP extension and password.';
  }
  if (code === 404 || /not found/.test(reason)) {
    return 'Number not found (404) — the dialed extension does not exist on this PBX.';
  }
  if (code === 486 || code === 600 || /busy/.test(reason)) {
    return 'Busy — the remote party rejected the call.';
  }
  if (code === 408 || /timeout/.test(reason) || /request timeout/.test(cause) || /registration timeout/.test(cause)) {
    return 'Phone server not responding';
  }
  if (/dns/.test(cause)) {
    return 'DNS resolution failed — SIP domain not reachable.';
  }
  if (/ssl|certificate|cert|tls|handshake/.test(cause)) {
    return 'SSL certificate rejected by the browser — the WSS endpoint is using a self-signed or untrusted certificate. Ask your administrator to install a valid CA-signed certificate on port 7443.';
  }
  if (/connection|websocket|network|transport/.test(cause)) {
    return 'Cannot reach phone server';
  }
  if (code && code >= 400 && code < 700) {
    return `Call rejected (${code} ${input.reason_phrase || ''}).`.trim();
  }
  return input.cause || input.message || 'SIP initialization failed';
}

/**
 * Build the list of WSS URLs to try, primary first.
 * Port 7443 is the standard TLS/WSS profile with DTLS-SRTP on FusionPBX.
 *
 * All URLs come from the SIPConfig (provided by the backend) — no hardcoded
 * hostnames so the app works on any PBX and any domain.
 * If no explicit wssUrl is stored, one is derived from config.domain as a
 * last-resort fallback (wss://<domain>:7443).
 */
export function buildWssFallbackList(config: SIPConfig): string[] {
  const derived = config.domain ? `wss://${config.domain}:7443` : null;
  return Array.from(new Set([
    config.wssUrl,
    ...(config.wssUrls || []),
    ...(derived ? [derived] : []),
  ].filter((url): url is string => typeof url === 'string' && url.startsWith('wss://'))));
}

export async function createSIPUA(config: SIPConfig, timeoutMs = 8000) {
  // Hard guard: if the native SIP plugin is active, refuse to create a JsSIP UA.
  // Two SIP stacks fighting over the same extension causes 401 loops, mic theft
  // and the "registered → connecting" flip-flop seen on iOS.
  if (__NATIVE_SIP_ACTIVE) {
    throw new JsSIPUnavailableError('JsSIP disabled — iOS native SIP plugin is active');
  }
  const JsSIP = await waitForJsSIP(timeoutMs, 100, false);
  const isAndroid = __PLATFORM === 'android';
  // WebView-only transport: WebSocket Secure. Raw sips:...transport=tls is
  // unusable inside a WebView (JsSIP only speaks WS). iOS never reaches here
  // because __NATIVE_SIP_ACTIVE short-circuits above.
  const wssList = buildWssFallbackList(config);
  if (wssList.length === 0) {
    throw new JsSIPUnavailableError('No WSS URL configured for JsSIP transport');
  }
  const sockets = wssList.map((url) => new JsSIP.WebSocketInterface(url));
  const uaConfig: any = {
    sockets,
    uri: `sip:${config.extension}@${config.domain}`,
    password: config.password,
    authorization_user: config.authUsername || config.extension,
    realm: config.domain,
    display_name: config.displayName || config.extension,
    contact_uri: `sip:${config.extension}@${config.domain};transport=${isAndroid ? 'wss' : 'ws'}`,
    register: true,
    session_timers: false,
    register_expires: 300,
    connection_recovery_min_interval: 10,
    connection_recovery_max_interval: 60,
    // Keep the WSS tunnel alive on Android carriers/proxies that close quiet
    // WebSockets with an empty close code/reason after a few seconds.
    ws_ping_pong: true,
    ws_ping_pong_interval: 10,
    user_agent: "AVA Softphone 1.1",
  };
  if (isAndroid) {
    // Android runs JsSIP over WSS inside the WebView. Do NOT set hack_via_tcp.
    // hack_ip_in_contact: rewrites Contact IP for NAT traversal.
    // hack_wss_in_transport: preserves WSS transport in Via so FusionPBX
    //   routes responses back over the WSS tunnel (not TCP/5060).
    // use_preloaded_route: FreeSwitch/FusionPBX WebSocket profile requires
    //   the Route header pre-loaded for in-dialog requests (BYE, re-INVITE).
    uaConfig.hack_via_tcp = false;
    uaConfig.hack_ip_in_contact = true;
    uaConfig.hack_wss_in_transport = true;
    uaConfig.use_preloaded_route = true;
    // eslint-disable-next-line no-console
    console.info('[SIP][android] JsSIP REGISTER config', {
      provider: 'jssip-wss',
      transport: 'WSS',
      hack_via_tcp: false,
      hack_wss_in_transport: true,
      use_preloaded_route: true,
      contact_uri: uaConfig.contact_uri,
      sockets: wssList,
    });
  }
  return new JsSIP.UA(uaConfig);
}
