// FreeSWITCH Verto client — native WebSocket + JSON-RPC implementation.
//
// No jQuery, no external CDN — talks raw JSON-RPC to FreeSWITCH on
// wss://<host>:<port>. Media is negotiated via a standard RTCPeerConnection
// (offer/answer over verto.invite / verto.answer).
//
// ICE / NAT traversal strategy:
// We use getActivePcConfig() from rtcConfig.ts which includes both STUN and
// TURN (Metered.ca) relay servers. STUN alone is insufficient on mobile
// networks with symmetric NAT or carrier-grade NAT — the NAT binding expires
// after ~30 s, causing ICE to transition to 'disconnected' and RTP to stop
// (audio drop mid-call). TURN relay ensures the media path survives NAT
// binding expiry and works on all network types.
import { getActivePcConfig, ensureActivePcConfig } from './rtcConfig';
import { registerOutboundCallWithNative } from './nativeSipProvider';

export interface VertoConfig {
  host: string;
  port: number;
  login: string;         // extension number (e.g. "113")
  password: string;      // SIP password
  caller_id_name: string;
  caller_id_number: string;
  /** Optional DOM id of the <audio> element used for remote audio. */
  audioTag?: string;
  /** SIP domain part for the login. Defaults to `host`. */
  domain?: string;
}

export interface VertoDialog {
  callID: string;
  hangup: () => void;
  answer: (opts?: any) => void;
  dtmf: (digit: string) => void;
  hold: () => void;
  unhold: () => void;
  toggleHold: () => void;
  mute: () => void;
  unmute: () => void;
  transfer: (target: string) => void;
  rtc?: RTCPeerConnection;
}

export type VertoEvent =
  | { type: 'connecting' }
  | { type: 'registered' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; error: string }
  | { type: 'incoming'; dialog: VertoDialog; from: string; fromName?: string }
  | { type: 'progress'; dialog: VertoDialog }
  | { type: 'answered'; dialog: VertoDialog }
  | { type: 'hangup'; dialog: VertoDialog; cause?: string }
  | { type: 'media'; dialog: VertoDialog; stream: MediaStream };

type Listener = (e: VertoEvent) => void;



/**
 * Ensure PCMU (payload 0) and PCMA (payload 8) are present in the SDP offer.
 * On Android emulator/WebView with AudioContext silent track, the browser may
 * omit G.711 codecs from the offer. FreeSWITCH rejects such offers with
 * INCOMPATIBLE_DESTINATION (causeCode 88) when bridging to PSTN trunks.
 */
function ensurePcmuInSdp(sdp: string): string {
  const lines = sdp.split('\r\n');
  // Find the m=audio line
  const mAudioIdx = lines.findIndex((l) => l.startsWith('m=audio '));
  if (mAudioIdx === -1) return sdp;

  const mLine = lines[mAudioIdx];
  // Check if PCMU (0) and PCMA (8) are already in the m= line
  const parts = mLine.split(' ');
  // parts: ['m=audio', port, proto, pt1, pt2, ...]
  const payloads = parts.slice(3);
  const hasPcmu = payloads.includes('0');
  const hasPcma = payloads.includes('8');
  const hasTelEvent = payloads.includes('101') || payloads.includes('126');

  const toAdd: string[] = [];
  if (!hasPcmu) toAdd.push('0');
  if (!hasPcma) toAdd.push('8');
  if (!hasTelEvent) toAdd.push('101');

  if (toAdd.length === 0) return sdp; // already complete

  // Add payload types to m= line
  lines[mAudioIdx] = [...parts, ...toAdd].join(' ');

  // Find insertion point: after the last a=rtpmap line in the audio section
  let insertAfter = mAudioIdx;
  for (let i = mAudioIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('m=')) break; // next media section
    if (lines[i].startsWith('a=rtpmap:') || lines[i].startsWith('a=fmtp:')) {
      insertAfter = i;
    }
  }

  const newLines: string[] = [];
  if (!hasPcmu) {
    newLines.push('a=rtpmap:0 PCMU/8000');
    newLines.push('a=rtcp-fb:0 transport-cc');
  }
  if (!hasPcma) {
    newLines.push('a=rtpmap:8 PCMA/8000');
    newLines.push('a=rtcp-fb:8 transport-cc');
  }
  if (!hasTelEvent) {
    newLines.push('a=rtpmap:101 telephone-event/8000');
    newLines.push('a=fmtp:101 0-16');
  }

  lines.splice(insertAfter + 1, 0, ...newLines);
  return lines.join('\r\n');
}

/**
 * Remove RED codec and fix invalid bitrate lines from SDP.
 * FreeSWITCH sometimes includes RED (redundant audio) which WebRTC
 * on Android rejects with min_bitrate_bps=-1 / max_bitrate_bps=-1.
 * We strip RED payload lines and any dangling a=rtpmap/a=fmtp for it.
 */
function filterSdp(sdp: string): string {
  const lines = sdp.split('\r\n');
  // Find RED payload type numbers (e.g. "a=rtpmap:112 red/...")
  const redPayloads = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^a=rtpmap:(\d+)\s+red\//i);
    if (m) redPayloads.add(m[1]);
  }
  if (redPayloads.size === 0) return sdp; // nothing to do

  const filtered: string[] = [];
  for (const line of lines) {
    // Remove RED from m= payload list
    if (line.startsWith('m=audio')) {
      const parts = line.split(' ');
      const header = parts.slice(0, 3);
      const payloads = parts.slice(3).filter((p) => !redPayloads.has(p));
      filtered.push([...header, ...payloads].join(' '));
      continue;
    }
    // Remove a=rtpmap, a=fmtp, a=rtcp-fb for RED payloads
    const ptMatch = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)/);
    if (ptMatch && redPayloads.has(ptMatch[1])) continue;
    filtered.push(line);
  }
  return filtered.join('\r\n');
}

function uuid(): string {
  // RFC4122-ish; good enough for callID / sessid.
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ensureAudioTag(id: string): HTMLAudioElement {
  let el = document.getElementById(id) as HTMLAudioElement | null;
  if (el) return el;
  el = document.createElement('audio');
  el.id = id;
  el.autoplay = true;
  el.setAttribute('playsinline', 'true');
  (el as any).muted = false;
  el.volume = 1.0;
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

interface DialogRecord {
  callID: string;
  direction: 'inbound' | 'outbound';
  pc: RTCPeerConnection;
  wrapped: VertoDialog;
  destination?: string;
  callerIdName?: string;
  callerIdNumber?: string;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
  answered?: boolean;
  nativeAnswerSender?: (sdp: string, dialogParams: any) => Promise<boolean | void>;
  nativeHangupSender?: () => Promise<void>;
}

class VertoClient {
  private ws: WebSocket | null = null;
  private sessid = uuid();
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private listeners = new Set<Listener>();
  private dialogs = new Map<string, DialogRecord>();
  private connected = false;
  private loggedIn = false;
  cfg: VertoConfig | null = null; // intentionally public for initVerto guard
  private audioTagId = 'verto-remote-audio';
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;
  // Pre-prepared inbound dialogs keyed by callID. Allows getUserMedia + ICE
  // to run in the background while the phone is ringing so the call connects
  // instantly when the user taps Answer.
  private preparedInbound = new Map<string, Promise<VertoDialog | null>>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: VertoEvent) { // intentionally public for initVerto guard
    this.listeners.forEach((fn) => { try { fn(e); } catch (err) { console.warn('[verto] listener threw', err); } });
  }
  isConnected() { return this.loggedIn; }

  async connect(cfg: VertoConfig): Promise<void> {
    if (typeof window === 'undefined') throw new Error('Verto requires a browser environment');
    this.cfg = cfg;
    this.audioTagId = cfg.audioTag || 'verto-remote-audio';
    ensureAudioTag(this.audioTagId);
    this.emit({ type: 'connecting' });
    this.manualDisconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

    const url = `wss://${cfg.host}:${cfg.port}`;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (ok: boolean, err?: string) => {
        if (settled) return;
        settled = true;
        if (ok) resolve(); else reject(new Error(err || 'Verto connect failed'));
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e: any) {
        done(false, e?.message || 'WebSocket construction failed');
        return;
      }
      this.ws = ws;

      ws.onopen = async () => {
        this.connected = true;
        try {
          const domain = cfg.domain || cfg.host;
          const login = cfg.login.includes('@') ? cfg.login : `${cfg.login}@${domain}`;
          const res = await this.rpc('login', {
            login,
            passwd: cfg.password,
            sessid: this.sessid,
            userVariables: {},
          });
          if (res?.message && String(res.message).toLowerCase().includes('logged in')) {
            this.loggedIn = true;
            this.reconnectAttempts = 0;
            this.startKeepAlive();
            this.emit({ type: 'registered' });
            done(true);
          } else {
            this.emit({ type: 'error', error: 'Login refused' });
            done(false, 'Login refused');
          }
        } catch (e: any) {
          this.emit({ type: 'error', error: e?.message || 'Login RPC failed' });
          done(false, e?.message);
        }
      };

      ws.onerror = () => {
        this.emit({ type: 'error', error: 'WebSocket error' });
        done(false, 'WebSocket error');
      };

      ws.onclose = (ev) => {
        const wasLoggedIn = this.loggedIn;
        this.connected = false;
        this.loggedIn = false;
        this.stopKeepAlive();
        this.emit({ type: 'disconnected', reason: `code=${ev.code}` });
        if (!wasLoggedIn) done(false, `WebSocket closed (code=${ev.code})`);
        // Auto-reconnect when the socket dies unexpectedly (screen off, doze,
        // NAT rebind, brief network glitch). Uses exponential backoff capped
        // at 30 s so we recover without waiting for app foreground / network
        // change events.
        if (wasLoggedIn && !this.manualDisconnect && this.cfg) {
          this.scheduleReconnect();
        }
      };

      ws.onmessage = (ev) => this.handleMessage(ev.data);
    });
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    // 25 s echo keeps the WebSocket + NAT mapping alive on carrier networks
    // that idle-close TCP sockets after ~30-60 s of silence.
    this.keepAliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.send({ jsonrpc: '2.0', id: this.nextId++, method: 'echo', params: { keepalive: Date.now() } });
      } catch { /* ignore */ }
    }, 25000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null; }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(`[verto] auto-reconnect scheduled in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || !this.cfg) return;
      this.connect(this.cfg).catch((e) => {
        console.warn('[verto] auto-reconnect failed:', e?.message);
        // onclose will fire and reschedule via scheduleReconnect().
      });
    }, delay);
  }


  private send(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not open');
    this.ws.send(JSON.stringify(obj));
  }

  private rpc(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (e) {
        this.pending.delete(id);
        reject(e);
        return;
      }
      // Safety timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 20000);
    });
  }

  private handleMessage(raw: any) {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    // Response to an outbound RPC
    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error?.message || 'RPC error'));
      else p.resolve(msg.result);
      return;
    }
    // Server-initiated notification
    if (msg.method) {
      this.handleServerMethod(msg.method, msg.params, msg.id);
    }
  }

  private async handleServerMethod(method: string, params: any, msgId?: number) {
    // ACK server calls that expect a response
    const ack = () => {
      if (msgId !== undefined) {
        try { this.send({ jsonrpc: '2.0', id: msgId, result: { method } }); } catch { /* ignore */ }
      }
    };

    const callID: string | undefined = params?.callID;
    switch (method) {
      case 'verto.invite': {
        ack();
        if (!callID) return;
        await this.handleInboundInvite(callID, params);
        return;
      }
      case 'verto.answer': {
        ack();
        const rec = callID ? this.dialogs.get(callID) : undefined;
        console.log('[verto][DIAG] verto.answer received, callID:', callID, 'rec found:', !!rec, 'sdp length:', params?.sdp?.length);
        if (params?.sdp) {
          console.log('[verto][DIAG] RAW ANSWER SDP (first 800 chars):', params.sdp.substring(0, 800));
        }
        if (rec && params?.sdp) {
          try {
            const cleanAnswer = filterSdp(params.sdp);
            console.log('[verto][DIAG] CLEAN ANSWER SDP (first 800 chars):', cleanAnswer.substring(0, 800));
            console.log('[verto][DIAG] pc.signalingState before setRemoteDescription:', rec.pc.signalingState);
            await rec.pc.setRemoteDescription({ type: 'answer', sdp: cleanAnswer });
            console.log('[verto][DIAG] setRemoteDescription(answer) SUCCESS, iceConnectionState:', rec.pc.iceConnectionState);
            rec.answered = true;
            this.emit({ type: 'answered', dialog: rec.wrapped });
          } catch (e) {
            console.error('[verto][DIAG] setRemoteDescription(answer) FAILED:', e);
          }
        } else if (rec && !params?.sdp) {
          // FreeSWITCH sometimes sends verto.answer without an SDP when the
          // remote description was already applied via a prior verto.media
          // (183 Session Progress). In that case the dialog is already in
          // 'stable' signaling state and we just need to flip the UI state.
          console.log('[verto][DIAG] verto.answer has no SDP — already answered via verto.media:', rec.answered, 'signalingState:', rec.pc.signalingState);
          if (!rec.answered) {
            rec.answered = true;
            this.emit({ type: 'answered', dialog: rec.wrapped });
          } else {
            // Already answered — re-emit to ensure UI is in sync.
            console.log('[verto][DIAG] verto.answer (no SDP) — re-emitting answered to sync UI');
            this.emit({ type: 'answered', dialog: rec.wrapped });
          }
        }
        return;
      }
      case 'verto.media': {
        ack();
        const rec = callID ? this.dialogs.get(callID) : undefined;
        console.log('[verto][DIAG] verto.media received, callID:', callID, 'rec found:', !!rec, 'already answered:', rec?.answered);
        if (rec && params?.sdp && !rec.answered) {
          try {
            const cleanMedia = filterSdp(params.sdp);
            console.log('[verto][DIAG] MEDIA SDP (first 400 chars):', cleanMedia.substring(0, 400));
            await rec.pc.setRemoteDescription({ type: 'answer', sdp: cleanMedia });
            console.log('[verto][DIAG] verto.media setRemoteDescription SUCCESS');
            rec.answered = true;
            // For outbound calls, verto.media carries the early-media SDP.
            // FreeSWITCH may send verto.media (183 Session Progress) but never
            // send verto.answer for PSTN calls that go straight to active.
            // Emit 'answered' here so the UI transitions from Dialing → In Call.
            if (rec.direction === 'outbound') {
              console.log('[verto][DIAG] verto.media outbound → emitting answered');
              this.emit({ type: 'answered', dialog: rec.wrapped });
            } else {
              this.emit({ type: 'progress', dialog: rec.wrapped });
            }
          } catch (e) {
            console.warn('[verto][DIAG] verto.media setRemoteDescription FAILED:', e);
            if (rec) this.emit({ type: 'progress', dialog: rec.wrapped });
          }
        } else if (rec) {
          this.emit({ type: 'progress', dialog: rec.wrapped });
        }
        return;
      }
      case 'verto.bye': {
        ack();
        const rec = callID ? this.dialogs.get(callID) : undefined;
        console.log('[verto][DIAG] verto.bye received! callID:', callID, 'cause:', params?.cause, 'dialogExists:', !!rec);
        if (rec) {
          console.log('[verto][DIAG] ICE state at hangup:', rec.pc.iceConnectionState, 'signaling:', rec.pc.signalingState);
          try { rec.pc.close(); } catch { /* ignore */ }
          this.dialogs.delete(rec.callID);
          this.emit({ type: 'hangup', dialog: rec.wrapped, cause: params?.cause });
        } else {
          // Dialog already removed (e.g. local hangup beat the remote bye), but
          // still emit a synthetic hangup so the JS UI resets if it got stuck.
          // Use a minimal wrapped dialog stub so listeners can handle it.
          console.log('[verto][DIAG] verto.bye: no dialog found for callID', callID, '— emitting synthetic hangup');
          this.emit({ type: 'hangup', dialog: { callID: callID || '', hangup: () => {}, answer: () => {}, hold: () => {}, unhold: () => {}, mute: () => {}, unmute: () => {}, sendDtmf: () => {}, transfer: () => {} } as any, cause: params?.cause });
        }
        return;
      }
      case 'verto.display':
      case 'verto.info':
      case 'verto.event':
      case 'verto.clientReady':
      case 'verto.punt':
      default:
        ack();
        return;
    }
  }

  private async handleInboundInvite(callID: string, params: any) {
    await this.prepareInboundDialog(callID, params);
  }

  /**
   * Pre-warm an inbound dialog as soon as the native service receives
   * verto.invite. Runs getUserMedia + ICE in the background while the phone
   * rings so the call connects instantly when the user taps Answer.
   */
  preWarmInboundDialog(params: any): void {
    const callID: string | undefined = params?.callID;
    if (!callID || !params?.sdp) return;
    if (this.preparedInbound.has(callID) || this.dialogs.has(callID)) return;
    console.log('[verto] preWarmInboundDialog: starting background ICE for callID', callID);
    const p = this.prepareInboundDialog(callID, params);
    this.preparedInbound.set(callID, p);
    p.then((d) => {
      if (d) console.log('[verto] preWarmInboundDialog: SDP ready for callID', callID);
      else { console.warn('[verto] preWarmInboundDialog: failed for callID', callID); this.preparedInbound.delete(callID); }
    }).catch(() => this.preparedInbound.delete(callID));
  }

  async adoptNativeInboundInvite(
    params: any,
    nativeAnswerSender: (sdp: string, dialogParams: any) => Promise<boolean | void>,
    nativeHangupSender?: () => Promise<void>,
  ): Promise<VertoDialog | null> {
    const callID: string | undefined = params?.callID;
    if (!callID || !params?.sdp) return null;
    const existing = this.dialogs.get(callID);
    if (existing) {
      // Update senders in case they were not set during pre-warm
      existing.nativeAnswerSender = nativeAnswerSender;
      existing.nativeHangupSender = nativeHangupSender;
      this.emit({ type: 'incoming', dialog: existing.wrapped, from: existing.callerIdNumber || params?.caller_id_number || '', fromName: existing.callerIdName || params?.caller_id_name });
      return existing.wrapped;
    }
    // Use pre-warmed dialog if available (SDP already negotiated)
    const preWarmed = this.preparedInbound.get(callID);
    if (preWarmed) {
      console.log('[verto] adoptNativeInboundInvite: using pre-warmed dialog for callID', callID);
      this.preparedInbound.delete(callID);
      const dialog = await preWarmed;
      if (dialog) {
        const rec = this.dialogs.get(callID);
        if (rec) { rec.nativeAnswerSender = nativeAnswerSender; rec.nativeHangupSender = nativeHangupSender; }
        return dialog;
      }
    }
    return this.prepareInboundDialog(callID, params, nativeAnswerSender, nativeHangupSender);
  }

  private async prepareInboundDialog(
    callID: string,
    params: any,
    nativeAnswerSender?: (sdp: string, dialogParams: any) => Promise<boolean | void>,
    nativeHangupSender?: () => Promise<void>,
  ): Promise<VertoDialog | null> {
    // Ensure the TURN/STUN probe has completed before creating the PC.
    // getActivePcConfig() returns PC_CONFIG (Metered defaults) if the probe
    // hasn't finished yet. On Android WebView the probe may not have completed
    // when the first inbound call arrives, causing ICE to use wrong servers.
    await ensureActivePcConfig().catch(() => {});
    const pcConfig = getActivePcConfig();
    // Log which ICE servers are actually being used — critical for debugging
    const iceUrls = pcConfig.iceServers?.map((s: RTCIceServer) =>
      Array.isArray(s.urls) ? s.urls[0] : s.urls
    ) ?? [];
    console.log('[verto][DIAG] prepareInboundDialog: ICE servers =', JSON.stringify(iceUrls));
    const pc = new RTCPeerConnection({ ...pcConfig, iceCandidatePoolSize: 10 });
    const remoteStream = new MediaStream();
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
      const rec = this.dialogs.get(callID);
      if (rec) this.emit({ type: 'media', dialog: rec.wrapped, stream: remoteStream });
    };

    let local: MediaStream | null = null;
    try {
      // Full VoIP audio constraints: echo cancellation, noise suppression,
      // auto gain control — works on all Android WebView ≥ Chromium 70.
      local = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
        video: false,
      });
      local.getTracks().forEach((t) => pc.addTrack(t, local!));
    } catch (e) {
      console.warn('[verto] mic denied on inbound', e);
    }

    const rec: DialogRecord = {
      callID, direction: 'inbound', pc,
      wrapped: this.wrap(callID),
      remoteStream,
      localStream: local || undefined,
      callerIdName: params?.caller_id_name,
      callerIdNumber: params?.caller_id_number,
      nativeAnswerSender,
      nativeHangupSender,
    };
    this.dialogs.set(callID, rec);

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: params.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // 2000 ms timeout for inbound ICE gathering.
      // pbxnode.lemtel.tel:3478 STUN is unreachable externally (UDP blocked);
      // we rely on Google/Cloudflare STUN. iceCandidatePoolSize=10 pre-gathers
      // but WebRTC still needs time to gather srflx candidates. 500ms was too
      // short — no srflx candidates were generated, leaving only host candidates
      // which FreeSWITCH cannot reach from its network (private IP unreachable).
      await this.waitForIce(pc, 2000);
      // Log ICE candidates in the final SDP for diagnosis
      const localSdp = pc.localDescription?.sdp || '';
      const candidateLines = localSdp.split('\r\n').filter(l => l.startsWith('a=candidate:'));
      const srflxCount = candidateLines.filter(l => l.includes('typ srflx')).length;
      const hostCount = candidateLines.filter(l => l.includes('typ host')).length;
      console.log('[verto][DIAG] SDP candidates: total=' + candidateLines.length + ' srflx=' + srflxCount + ' host=' + hostCount);
      if (srflxCount === 0) console.warn('[verto][DIAG] WARNING: no srflx candidates — FreeSWITCH may not reach this device (check STUN servers)');
      // Wrap dialog only once callID is known
      const wrapped = this.wrap(callID);
      rec.wrapped = wrapped;
      this.emit({
        type: 'incoming', dialog: wrapped,
        from: params?.caller_id_number || '', fromName: params?.caller_id_name,
      });
      // Note: answer is deferred until user calls .answer()
      (wrapped as any).__pendingAnswer = pc.localDescription?.sdp;
      (wrapped as any).__pendingAnswerTs = Date.now(); // timestamp for staleness check
      (wrapped as any).__params = params;
      return wrapped;
    } catch (e) {
      console.warn('[verto] inbound negotiation failed', e);
      try { pc.close(); } catch { /* ignore */ }
      this.dialogs.delete(callID);
      return null;
    }
  }

  private waitForIce(pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
    // Default 2 s timeout. FreeSWITCH Verto does not support trickle ICE,
    // so we must wait for ICE gathering to complete before sending the SDP.
    // iceCandidatePoolSize=10 pre-gathers candidates but Google/Cloudflare
    // STUN still needs ~200-500ms to return srflx candidates. Without srflx
    // candidates, FreeSWITCH cannot reach the device (private IP unreachable).
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const t = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', check);
        console.log('[verto][DIAG] ICE gathering timeout after', timeoutMs, 'ms — sending SDP with available candidates');
        resolve();
      }, timeoutMs);
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          pc.removeEventListener('icegatheringstatechange', check);
          console.log('[verto][DIAG] ICE gathering complete (fast path)');
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  private wrap(callID: string): VertoDialog {
    const existing = this.dialogs.get(callID)?.wrapped;
    if (existing) return existing;
    const w: VertoDialog = {
      callID,
      hangup: () => this.hangup(callID),
      answer: () => this.answerInbound(callID),
      dtmf: (digit: string) => this.dtmf(callID, digit),
      hold: () => this.hold(callID, true),
      unhold: () => this.hold(callID, false),
      toggleHold: () => {
        const rec = this.dialogs.get(callID);
        if (!rec) return;
        this.hold(callID, true); // best-effort toggle
      },
      mute: () => this.setLocalMic(callID, false),
      unmute: () => this.setLocalMic(callID, true),
      transfer: (target: string) => this.transfer(callID, target),
      rtc: undefined,
    };
    return w;
  }

  async call(destination: string, callerIdName: string, callerIdNumber: string): Promise<VertoDialog | null> {
    if (!this.loggedIn || !this.cfg) throw new Error('Verto not registered');
    const callID = uuid();
    await ensureActivePcConfig().catch(() => {});
    const callPcConfig = getActivePcConfig();
    const callIceUrls = callPcConfig.iceServers?.map((s: RTCIceServer) =>
      Array.isArray(s.urls) ? s.urls[0] : s.urls
    ) ?? [];
    console.log('[verto][DIAG] call: ICE servers =', JSON.stringify(callIceUrls));
    const pc = new RTCPeerConnection({ ...callPcConfig, iceCandidatePoolSize: 10, sdpSemantics: 'unified-plan' } as any);
    const remoteStream = new MediaStream();
    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
      const rec = this.dialogs.get(callID);
      if (rec) this.emit({ type: 'media', dialog: rec.wrapped, stream: remoteStream });
    };
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[verto][DIAG] ICE connection state:', iceState, 'signaling:', pc.signalingState);
      // If ICE disconnects mid-call, attempt an ICE restart to recover the
      // media path. This handles NAT binding expiry (~30 s) on mobile networks
      // where STUN reflexive candidates expire but TURN relay can reconnect.
      if ((iceState === 'disconnected' || iceState === 'failed')) {
        const rec = this.dialogs.get(callID);
        if (rec && rec.answered) {
          console.warn('[verto][DIAG] ICE', iceState, '— attempting ICE restart for callID:', callID);
          try { (pc as any).restartIce?.(); } catch (e) { console.warn('[verto][DIAG] restartIce failed:', e); }
        }
      }
    };
    pc.onicegatheringstatechange = () => {
      console.log('[verto][DIAG] ICE gathering state:', pc.iceGatheringState);
    };
    pc.onsignalingstatechange = () => {
      console.log('[verto][DIAG] Signaling state:', pc.signalingState);
    };

    // Attempt to acquire the microphone. On emulators or when permission
    // is denied, fall back to a silent audio track so the call still
    // proceeds and the remote party can be heard.
    let local: MediaStream;
    try {
      // Full VoIP audio constraints: echo cancellation, noise suppression,
      // auto gain control — works on all Android WebView ≥ Chromium 70.
      local = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
        video: false,
      });
    } catch (micErr) {
      console.warn('[verto] mic unavailable, using silent track:', micErr);
      // Create a silent audio track via AudioContext
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      local = dest.stream;
    }
    local.getTracks().forEach((t) => pc.addTrack(t, local));

    const wrapped = this.wrap(callID);
    wrapped.rtc = pc;
    const rec: DialogRecord = {
      callID, direction: 'outbound', pc, wrapped,
      destination, callerIdName, callerIdNumber, remoteStream,
      localStream: local,
    };
    this.dialogs.set(callID, rec);

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await this.waitForIce(pc);

    // Filter RED codec from the local SDP before sending to FreeSWITCH.
    // RED causes WebRTC audio_send_stream bitrate=-1 on Android WebView.
    const rawSdp = pc.localDescription?.sdp || '';
    let cleanSdp = filterSdp(rawSdp);

    // INCOMPATIBLE_DESTINATION fix: ensure PCMU (payload 0) and PCMA (payload 8)
    // are present in the SDP offer. On Android emulator with AudioContext silent
    // track, the RTCPeerConnection may omit PCMU/PCMA — FreeSWITCH then rejects
    // the call with causeCode 88 (INCOMPATIBLE_DESTINATION) because it requires
    // at least one G.711 codec for PSTN bridging.
    cleanSdp = ensurePcmuInSdp(cleanSdp);

    // Log codec summary (full SDP is too long for logcat)
    const sdpLines = cleanSdp.split('\r\n');
    const mAudioLine = sdpLines.find((l) => l.startsWith('m=audio')) || 'NOT FOUND';
    const rtpmapLines = sdpLines.filter((l) => l.startsWith('a=rtpmap:')).join(' | ');
    console.log('[verto][DIAG] m=audio line:', mAudioLine);
    console.log('[verto][DIAG] codecs offered:', rtpmapLines);
    console.log('[verto][DIAG] Sending verto.invite to:', destination, 'callID:', callID);
    // Store full SDP in localStorage for retrieval
    try { localStorage.setItem('verto.last.offer.sdp', cleanSdp); } catch { /* ignore */ }

    const dialogParams = {
      callID,
      caller_id_name: callerIdName,
      caller_id_number: callerIdNumber,
      destination_number: destination,
      remote_caller_id_name: 'Outbound Call',
      remote_caller_id_number: destination,
      useVideo: false, useStereo: false,
      tag: this.audioTagId,
      login: this.cfg.login.includes('@') ? this.cfg.login : `${this.cfg.login}@${this.cfg.domain || this.cfg.host}`,
    };

    console.log('[verto][DIAG] dialogParams:', JSON.stringify(dialogParams));
    try {
      await this.rpc('verto.invite', { sdp: cleanSdp, dialogParams });
    } catch (e: any) {
      try { pc.close(); } catch { /* ignore */ }
      this.dialogs.delete(callID);
      this.emit({ type: 'hangup', dialog: wrapped, cause: e?.message });
      return null;
    }

    // Register the outbound callID with the native SipConnectionService so
    // hangupAndroidNativeCall() can send verto.bye over the reliable Kotlin
    // WebSocket even if the JS WebSocket disconnects mid-call.
    registerOutboundCallWithNative(callID, destination).catch(() => { /* ignore */ });
    this.emit({ type: 'progress', dialog: wrapped });
    return wrapped;
  }

  private async answerInbound(callID: string) {
    const rec = this.dialogs.get(callID);
    if (!rec || rec.direction !== 'inbound') return;

    // If the cached SDP is older than 3 seconds, the ICE candidates it contains
    // may have expired (NAT bindings are short-lived on mobile networks).
    // Regenerate a fresh SDP from the original verto.invite offer before sending.
    const sdpAge = Date.now() - ((rec.wrapped as any).__pendingAnswerTs || 0);
    if (sdpAge > 3000) {
      console.log('[verto] answerInbound: SDP is', sdpAge, 'ms old — regenerating fresh ICE candidates for callID', callID);
      const origParams = (rec.wrapped as any).__params;
      if (origParams?.sdp) {
        try {
          // Close the stale PeerConnection
          try { rec.pc.close(); } catch { /* ignore */ }
          // Create a fresh PeerConnection with new ICE candidates
          const freshConfig = getActivePcConfig();
          console.log('[verto][DIAG] answerInbound freshPc: ICE servers =', JSON.stringify(
            freshConfig.iceServers?.map((s: RTCIceServer) => Array.isArray(s.urls) ? s.urls[0] : s.urls) ?? []
          ));
          const freshPc = new RTCPeerConnection({ ...freshConfig, iceCandidatePoolSize: 10 });
          const freshRemoteStream = new MediaStream();
          freshPc.ontrack = (ev) => {
            ev.streams[0]?.getTracks().forEach((t) => freshRemoteStream.addTrack(t));
            this.emit({ type: 'media', dialog: rec.wrapped, stream: freshRemoteStream });
          };
          // Re-acquire microphone
          let freshLocal: MediaStream | null = null;
          try {
            freshLocal = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000 },
              video: false,
            });
            freshLocal.getTracks().forEach((t) => freshPc.addTrack(t, freshLocal!));
          } catch (micErr) {
            console.warn('[verto] mic re-acquire failed on SDP refresh:', micErr);
          }
          await freshPc.setRemoteDescription({ type: 'offer', sdp: origParams.sdp });
          const freshAnswer = await freshPc.createAnswer();
          await freshPc.setLocalDescription(freshAnswer);
          await this.waitForIce(freshPc, 2000);
          // Update the dialog record with the fresh PeerConnection
          rec.pc = freshPc;
          rec.remoteStream = freshRemoteStream;
          if (freshLocal) rec.localStream = freshLocal;
          (rec.wrapped as any).__pendingAnswer = freshPc.localDescription?.sdp;
          (rec.wrapped as any).__pendingAnswerTs = Date.now();
          console.log('[verto] answerInbound: fresh SDP generated, sdpLen=', freshPc.localDescription?.sdp?.length);
        } catch (refreshErr) {
          console.warn('[verto] answerInbound: SDP refresh failed, using stale SDP:', refreshErr);
        }
      }
    }

    const sdp = (rec.wrapped as any).__pendingAnswer;
    if (!sdp) return;
    const dialogParams = {
      callID,
      caller_id_name: this.cfg?.caller_id_name || '',
      caller_id_number: this.cfg?.caller_id_number || '',
      useVideo: false, useStereo: false,
      tag: this.audioTagId,
    };
    try {
      if (rec.nativeAnswerSender) {
        const nativeOk = await rec.nativeAnswerSender(sdp, dialogParams);
        // Android native WS can be half-closed exactly when the user taps
        // Answer. The Capacitor bridge only confirms the broadcast was sent,
        // not that FreeSWITCH accepted the frame. Always send a JS Verto
        // fallback too so the forked ringing legs are cancelled immediately.
        this.rpc('verto.answer', { callID, sdp, dialogParams }).catch((e) => {
          console.warn('[verto] JS fallback answer failed', e);
        });
        if (nativeOk === false) {
          console.warn('[verto] native answer reported false; JS fallback already sent');
        }
      } else {
        await this.rpc('verto.answer', { callID, sdp, dialogParams });
      }
      rec.answered = true;
      this.emit({ type: 'answered', dialog: rec.wrapped });
      // Attach the remote stream immediately after verto.answer is sent.
      // On Android WebView, pc.ontrack fires only when the first RTP packet
      // arrives from FreeSWITCH — which can be 500 ms–2 s after our answer.
      // Emitting 'media' here ensures attachRemoteStream() is called right
      // away so the <audio> element is wired up before RTP starts flowing.
      if (rec.remoteStream) {
        this.emit({ type: 'media', dialog: rec.wrapped, stream: rec.remoteStream });
      }
    } catch (e) {
      console.warn('[verto] answer RPC failed', e);
    }
  }

  private hangup(callID: string): Promise<void> {
    const rec = this.dialogs.get(callID);
    if (!rec) return Promise.resolve();
    // Emit hangup and close PC immediately — do NOT await verto.bye.
    // Waiting for the RPC response caused a 1-2 s UI freeze before the
    // call screen dismissed. FreeSWITCH accepts verto.bye fire-and-forget.
    try { rec.pc.close(); } catch { /* ignore */ }
    this.dialogs.delete(callID);
    this.emit({ type: 'hangup', dialog: rec.wrapped, cause: 'NORMAL_CLEARING' });
    // Send verto.bye in the background (best-effort, no await)
    const dialogParams = {
      callID,
      caller_id_name: rec.callerIdName || this.cfg?.caller_id_name || '',
      caller_id_number: rec.callerIdNumber || this.cfg?.caller_id_number || '',
      destination_number: rec.destination,
    };
    if (rec.nativeHangupSender) rec.nativeHangupSender().catch(() => { /* ignore */ });
    else this.rpc('verto.bye', { cause: 'NORMAL_CLEARING', dialogParams }).catch(() => { /* ignore */ });
    return Promise.resolve();
  }

  private async dtmf(callID: string, digit: string) {
    const rec = this.dialogs.get(callID);
    if (!rec) return;
    try {
      await this.rpc('verto.info', {
        dtmf: digit,
        dialogParams: { callID, destination_number: rec.destination },
      });
    } catch { /* ignore */ }
  }

  private async hold(callID: string, on: boolean) {
    const rec = this.dialogs.get(callID);
    if (!rec) return;
    try {
      // Hold/unhold via SDP re-negotiation: set direction to sendonly (hold)
      // or sendrecv (unhold). verto.modify is not reliably supported by
      // FreeSWITCH Verto for hold — SDP re-offer is the correct approach.
      const senders = rec.pc.getSenders();
      senders.forEach((s) => {
        if (s.track?.kind === 'audio') {
          // Mute local track on hold so we don't send audio while on hold
          s.track.enabled = !on;
        }
      });
      // Re-negotiate with updated direction
      const offer = await rec.pc.createOffer();
      // Patch SDP direction
      const patchedSdp = offer.sdp?.replace(
        /a=sendrecv/g, on ? 'a=sendonly' : 'a=sendrecv'
      ) || offer.sdp;
      await rec.pc.setLocalDescription({ type: 'offer', sdp: patchedSdp });
      await this.waitForIce(rec.pc, 3000);
      const localSdp = rec.pc.localDescription?.sdp || '';
      // Send verto.modify with the new SDP
      await this.rpc('verto.modify', {
        action: on ? 'hold' : 'unhold',
        sdp: localSdp,
        dialogParams: { callID },
      });
      console.log('[verto] hold', on, 'SDP re-negotiation sent');
    } catch (e) {
      console.warn('[verto] hold SDP re-negotiation failed, trying simple modify:', e);
      // Fallback: simple verto.modify without SDP
      try {
        await this.rpc('verto.modify', {
          action: on ? 'hold' : 'unhold',
          dialogParams: { callID },
        });
      } catch { /* ignore */ }
    }
  }

  setLocalMic(callID: string, on: boolean) {
    const rec = this.dialogs.get(callID);
    if (!rec) return;
    // Mute/unmute the local audio track directly on the MediaStream
    const stream = rec.localStream;
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = on; });
      console.log('[verto] setLocalMic', on, 'tracks:', stream.getAudioTracks().length);
    } else {
      // Fallback: mute via RTCRtpSender
      rec.pc.getSenders().forEach((s) => {
        if (s.track?.kind === 'audio') s.track.enabled = on;
      });
      console.log('[verto] setLocalMic (sender fallback)', on);
    }
  }

  private async transfer(callID: string, target: string) {
    const rec = this.dialogs.get(callID);
    if (!rec) return;
    // Blind transfer via verto.modify with action 'transfer'
    try {
      await this.rpc('verto.modify', {
        action: 'transfer',
        destination: target,
        dialogParams: { callID },
      });
      console.log('[verto] blind transfer to', target);
      // After transfer, FreeSWITCH will send verto.bye — hangup locally
      try { rec.pc.close(); } catch { /* ignore */ }
      this.dialogs.delete(callID);
      this.emit({ type: 'hangup', dialog: rec.wrapped, cause: 'NORMAL_CLEARING' });
    } catch (e) {
      console.warn('[verto] transfer failed', e);
    }
  }

  /**
   * Inject a raw Verto JSON message received on the Kotlin WebSocket into the
   * JS message handler. This bridges the dual-WebSocket gap:
   * - verto.answer (with SDP): allows the RTCPeerConnection to call setRemoteDescription
   * - verto.bye: triggers the JS hangup event so the UI closes
   * - verto.media: handles early-media SDP for outbound calls
   */
  injectServerMessage(rawJson: string): void {
    try {
      console.log('[verto] injectServerMessage from native relay:', rawJson.substring(0, 120));
      let msg: any;
      try { msg = JSON.parse(rawJson); } catch { return; }

      // FreeSWITCH responds to our verto.answer with a JSON-RPC *result*
      // (not a notification), e.g.:
      //   {"jsonrpc":"2.0","id":1234,"result":{"callID":"...","sdp":"..."}}
      // handleMessage() silently discards this because the id is not in the
      // JS pending-RPC map (it was sent by the Kotlin socket, not the JS
      // socket). Convert it to a synthetic verto.answer notification so
      // handleServerMethod() can call setRemoteDescription correctly.
      if (msg.result && msg.result.sdp) {
        const callID = msg.result.callID || msg.result.callId || '';
        const synthetic = JSON.stringify({
          jsonrpc: '2.0',
          method: 'verto.answer',
          params: { callID, sdp: msg.result.sdp },
        });
        console.log('[verto] injectServerMessage: converting result+SDP to synthetic verto.answer, callID:', callID);
        this.handleMessage(synthetic);
        return;
      }

      this.handleMessage(rawJson);
    } catch (e) {
      console.warn('[verto] injectServerMessage failed:', e);
    }
  }

  hangupAll() {
    for (const rec of Array.from(this.dialogs.values())) {
      this.hangup(rec.callID).catch(() => { /* ignore */ });
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    this.stopKeepAlive();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.connected = false;
    this.loggedIn = false;
    this.dialogs.clear();
    this.preparedInbound.clear();
  }

}

// Singleton — matches the JsSIP UA lifecycle model used elsewhere.
let singleton: VertoClient | null = null;
export function getVertoClient(): VertoClient {
  if (!singleton) singleton = new VertoClient();
  return singleton;
}

/** Convenience: initialize + register. Resolves after successful login.
 * If the singleton is already logged in with the same extension, skip the
 * reconnect to avoid creating a second WebSocket on the same singleton.
 * If the extension changed or the socket is dead, disconnect first.
 */
export async function initVerto(cfg: VertoConfig): Promise<VertoClient> {
  const c = getVertoClient();
  // If already connected with the same credentials, emit registered and return
  // immediately. This prevents a double-connect race when the React effect
  // fires twice (StrictMode, token refresh, etc.).
  const currentLogin = c.cfg?.login?.split('@')[0]; // strip domain for comparison
  const newLogin = cfg.login?.split('@')[0];
  if (c.isConnected() && currentLogin === newLogin) {
    // Already registered with the same extension — emit registered so the UI
    // reflects the correct state without opening a second WebSocket.
    c.emit({ type: 'registered' });
    return c;
  }
  // Tear down any stale connection before opening a new one.
  try { c.disconnect(); } catch { /* ignore */ }
  // Brief pause to let the OS release the socket before reconnecting.
  await new Promise<void>((r) => setTimeout(r, 200));
  await c.connect(cfg);
  return c;
}

export async function vertoCall(destination: string, callerName: string, callerNumber?: string): Promise<VertoDialog | null> {
  return getVertoClient().call(destination, callerName, callerNumber || callerName);
}

export function vertoHangup(): void {
  getVertoClient().hangupAll();
}
