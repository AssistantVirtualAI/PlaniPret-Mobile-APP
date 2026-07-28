/**
 * Lemtel AI Phone — Mobile API client.
 *
 * Talks to Supabase Edge Functions backed by FusionPBX + _safe views.
 *
 * Mock data is ONLY returned in DEV builds with VITE_AVA_MOCK=true.
 * Production builds with that flag refuse to boot (see buildGuard.ts),
 * and the live `call()` path never silently falls back to mocks — errors
 * bubble up so the UI can render a real error state instead of fake data.
 */
import { isMockMode } from './buildGuard';
import { supabase } from './mobileSupabase';
import { perf } from './perfMetrics';

export const MOBILE_DEFAULT_PORTAL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';

let portalUrl: string = MOBILE_DEFAULT_PORTAL;
let authToken: string | null = null;
let anonKey: string | null = null;

export function configureMobileApi(opts: { portalUrl?: string; accessToken?: string | null; anonKey?: string | null }) {
  if (opts.portalUrl) portalUrl = opts.portalUrl.replace(/\/$/, '');
  if (opts.accessToken !== undefined) authToken = opts.accessToken;
  if (opts.anonKey !== undefined) anonKey = opts.anonKey;
}

export function setAuthToken(t: string | null) { authToken = t; }

async function getFreshToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token;
    if (t) {
      authToken = t;
      return t;
    }
  } catch {}
  return authToken;
}

function emitAuthRequired() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mobile-auth-required'));
    }
  } catch {}
}

async function liveCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getFreshToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(anonKey ? { apikey: anonKey } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${portalUrl}/functions/v1${path}`, { ...init, headers });
  if (!res.ok) {
    let detail: any = null;
    let text = '';
    try { detail = await res.json(); } catch { try { text = await res.text(); } catch {} }
    const err = new Error(detail?.message || detail?.error || text || `HTTP ${res.status} ${path}`) as Error & { status?: number; detail?: any; path?: string; code?: string };
    err.status = res.status;
    err.detail = detail || text;
    err.path = path;
    if (res.status === 401 || res.status === 403) {
      err.code = 'AUTH_REQUIRED';
      emitAuthRequired();
    }
    throw err;
  }
  return res.json() as Promise<T>;
}

// In-flight GET dedup — multiple components requesting the same path in
// quick succession share one network round-trip. Avoids the StrictMode /
// multi-screen-mount thundering herd that made initial loads feel slow.
const _inflightGet = new Map<string, Promise<any>>();

async function call<T>(path: string, init: RequestInit | undefined, mockData: T): Promise<T> {
  // Mock data ONLY in dev builds explicitly opted into mock mode.
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 220));
    return mockData;
  }
  const isGet = !init || !init.method || init.method.toUpperCase() === 'GET';
  const token = await getFreshToken();
  if (!token) {
    if (isGet) {
      // Soft-fail GETs so screens render an empty state instead of blanking.
      emitAuthRequired();
      return mockData;
    }
    const err = new Error('Not authenticated') as Error & { code?: string };
    err.code = 'AUTH_REQUIRED';
    emitAuthRequired();
    throw err;
  }
  if (isGet) {
    const existing = _inflightGet.get(path);
    if (existing) { perf.dedupe(); return existing as Promise<T>; }
    perf.request();
    const p = liveCall<T>(path, init)
      .catch((e) => { perf.error(); throw e; })
      .finally(() => { _inflightGet.delete(path); });
    _inflightGet.set(path, p);
    return p;
  }
  perf.request();
  return liveCall<T>(path, init).catch((e) => { perf.error(); throw e; });
}

/* ─── Types ───────────────────────────────────────────────────── */

export type MobileRole = 'super_admin' | 'org_admin' | 'manager' | 'agent' | 'viewer';
export type DataScope = 'domain_admin' | 'extension_user';

export interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl?: string };
  organization: { id: string; name: string; sipDomain?: string; fusionpbxDomainUuid?: string; portalUrl?: string; wssUrl?: string };
  client?: { id: string; name: string };
  domain: { organizationId: string; sipDomain: string; fusionpbxDomainUuid?: string; portalUrl?: string; wssUrl?: string };
  extension: { number: string; displayName: string; sipDomain: string; id?: string };
  role: MobileRole;
  dataScope: DataScope;
  permissions: { admin: boolean; canManageNumbers: boolean; canManageAgents: boolean; canManageUsers: boolean; canManageRouting: boolean; canViewDomainReports: boolean };
  status?: { sipState: 'registered' | 'connecting' | 'offline'; doNotDisturb: boolean; forwarding: string | null; updatedAt?: string };
}

export interface DashboardBrief {
  greeting: string;
  brief: string;
  scope: { mode: DataScope; label: string; organizationId: string; sipDomain?: string; extension?: string; role?: MobileRole };
  metrics: { missedCalls: number; answeredCalls: number; unreadSms: number; voicemails: number; actionItems: number; activeUsers?: number };
  needsAttention: { id: string; kind: 'follow_up' | 'callback' | 'voicemail' | 'unread'; title: string; subtitle: string; accent: 'gold' | 'cyan' | 'violet' | 'danger' }[];
  status: { sipState: 'registered' | 'connecting' | 'offline'; doNotDisturb: boolean; forwarding: string | null; updatedAt?: string };
}

export interface HomeStatsPayload {
  calls: { received: number; missed: number; outbound: number; avgDurationSec: number };
  sms: { unread: number; activeThreads: number };
  recordings: { total: number; transcribed: number; pending: number; failed: number };
  voicemails: { new: number; total: number };
}
export interface HomeStatsResponse {
  period: 'today' | 'week' | 'month';
  lang: 'fr' | 'en';
  scope: { organizationId: string | null; extension: string | null; sipDomain?: string | null };
  stats: HomeStatsPayload;
  prior: HomeStatsPayload;
  summary: string;
  insights: { id: string; tone: 'danger' | 'success' | 'cyan' | 'gold'; text: string }[];
}
export function emptyHomeStats(): HomeStatsPayload {
  return {
    calls: { received: 0, missed: 0, outbound: 0, avgDurationSec: 0 },
    sms: { unread: 0, activeThreads: 0 },
    recordings: { total: 0, transcribed: 0, pending: 0, failed: 0 },
    voicemails: { new: 0, total: 0 },
  };
}

export interface CallRecord {
  id: string;
  direction: 'in' | 'out';
  status: 'answered' | 'missed' | 'voicemail';
  from: string;
  to: string;
  extension?: string;
  customer?: string;
  startedAt: string;
  durationSec: number;
  hasRecording: boolean;
  hasTranscript: boolean;
  pbx_uuid?: string | null;
  organization_id?: string | null;
  domain_uuid?: string | null;
  domain_name?: string | null;
  recording_path?: string | null;
  recording_name?: string | null;
  recording_url?: string | null;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface CallDetail extends CallRecord {
  record_path?: string | null;
  record_name?: string | null;
  transcript: { speaker: 'agent' | 'customer'; text: string; t: number }[];
  summary: string;
  topics: string[];
  actionItems: string[];
  qualityScore: number;
  coachingScore?: number | null;
  coachingNotes?: string[];
  aiStatus?: 'cached' | 'processing' | 'failed' | 'missing';
  aiError?: string | null;
  aiCached?: boolean;
  transcriptionStatus?: 'pending' | 'processing' | 'done' | 'failed' | 'missing';
  transcriptionProvider?: string | null;
  transcriptionProviderRaw?: string | null;
  transcriptionError?: string | null;
  intent: string;
  tags: string[];
}

export interface SmsThread { id: string; contact: string; number: string; lastMessage: string; unread: number; updatedAt: string }
export interface SmsMessage { id: string; from: 'me' | 'them'; body: string; at: string }

export interface VoicemailEntry {
  id: string; from: string; customer?: string; receivedAt: string;
  durationSec: number; transcript: string; summary: string;
  priority: 'low' | 'normal' | 'high'; sentiment: 'positive' | 'neutral' | 'negative';
  isNew: boolean;
  // Fields needed by `voicemailAudio` to issue a signed URL.
  xml_cdr_uuid?: string;
  record_path?: string;
  record_name?: string;
  domain_uuid?: string;
  domain_name?: string;
  organization_id?: string;
}

export interface RecordingEntry {
  id: string;
  from: string;
  to: string;
  extension?: string;
  customer?: string;
  startedAt: string;
  durationSec: number;
  hasTranscript: boolean;
  summary?: string;
  xml_cdr_uuid?: string;
  pbx_uuid?: string;
  record_path?: string;
  record_name?: string;
  domain_uuid?: string;
  domain_name?: string;
  organization_id?: string;
}



export interface QueueRow {
  id: string;
  name: string;
  extension: string;
  strategy: string;
  waiting: number;
  agentsOnline: number;
  callsToday: number;
  avgWaitSec: number;
  slaPct: number;
}

export type StatsRange = 'today' | '7d' | '30d';
export interface DomainStats {
  // legacy
  callsToday: number;
  answeredToday: number;
  missedToday: number;
  voicemailsToday: number;
  avgDurationSec: number;
  activeExtensions: number;
  last7Days: number[];
  topExtensions: { extension: string; name?: string; calls: number }[];
  // range-aware (added)
  range?: StatsRange;
  totalCalls?: number;
  answered?: number;
  missed?: number;
  voicemails?: number;
  totalTalkSec?: number;
  answerRate?: number;
  peakHour?: number | null;
  buckets?: number[];
  outboundCalls?: number;
  dialFailedCount?: number;
  dialSuccessRate?: number;
}

export interface ChatReply { answer: string }

/* ─── Mock data (fallback) ────────────────────────────────────── */

const meMock: MeResponse = {
  user: { id: 'u1', name: 'Alex Morin', email: 'alex@lemtel.tel' },
  organization: { id: 'org-lemtel', name: 'Lemtel Communications', sipDomain: 'lemtel.lemtel.tel', portalUrl: 'https://avastatistic.ca', wssUrl: 'sips://pbxnode.lemtel.tel:5061' },
  domain: { organizationId: 'org-lemtel', sipDomain: 'lemtel.lemtel.tel', portalUrl: 'https://avastatistic.ca', wssUrl: 'sips://pbxnode.lemtel.tel:5061' },
  extension: { number: '1042', displayName: 'Alex M.', sipDomain: 'lemtel.lemtel.tel' },
  role: 'org_admin',
  dataScope: 'domain_admin',
  permissions: { admin: true, canManageNumbers: true, canManageAgents: true, canManageUsers: true, canManageRouting: true, canViewDomainReports: true },
};

const dashboardMock: DashboardBrief = {
  greeting: 'Good morning',
  brief: 'You have 3 missed calls, 2 voicemails, and 4 unread messages. AVA flagged 2 follow-ups worth your attention.',
  scope: { mode: 'domain_admin', label: 'Domain admin · Lemtel Communications', organizationId: 'org-lemtel', sipDomain: 'lemtel.lemtel.tel', extension: '1042', role: 'org_admin' },
  metrics: { missedCalls: 3, answeredCalls: 12, unreadSms: 4, voicemails: 2, actionItems: 5, activeUsers: 8 },
  needsAttention: [
    { id: 'a1', kind: 'voicemail', title: 'Marie Tremblay left a voicemail', subtitle: 'Renewal — high priority · 1m 12s', accent: 'gold' },
    { id: 'a2', kind: 'callback', title: 'Callback Acme Corp', subtitle: 'Wants to reschedule demo', accent: 'cyan' },
    { id: 'a3', kind: 'follow_up', title: 'Send pricing PDF', subtitle: 'Detected in call #4821', accent: 'violet' },
  ],
  status: { sipState: 'registered', doNotDisturb: false, forwarding: null },
};

const callsMock: CallRecord[] = [
  { id: 'c1', direction: 'in',  status: 'answered',  from: '+1 514 555 0123', to: '+1 514 555 0100', customer: 'Marie Tremblay', startedAt: new Date(Date.now() - 36e5).toISOString(),    durationSec: 245, hasRecording: true,  hasTranscript: true,  sentiment: 'positive' },
  { id: 'c2', direction: 'out', status: 'answered',  from: '+1 514 555 0100', to: '+1 438 555 9988', customer: 'Acme Corp',       startedAt: new Date(Date.now() - 5*36e5).toISOString(),  durationSec: 412, hasRecording: true,  hasTranscript: true,  sentiment: 'neutral'  },
  { id: 'c3', direction: 'in',  status: 'missed',    from: '+1 514 555 7711', to: '+1 514 555 0100',                              startedAt: new Date(Date.now() - 8*36e5).toISOString(),  durationSec: 0,   hasRecording: false, hasTranscript: false                          },
  { id: 'c4', direction: 'in',  status: 'voicemail', from: '+1 438 555 6612', to: '+1 514 555 0100', customer: 'Vincent K.',      startedAt: new Date(Date.now() - 26*36e5).toISOString(), durationSec: 72,  hasRecording: true,  hasTranscript: true,  sentiment: 'negative' },
];

const callDetailMock = (id: string): CallDetail => {
  const base = callsMock.find((c) => c.id === id) || callsMock[0];
  return {
    ...base,
    transcript: [
      { speaker: 'agent',    text: 'Hi, thanks for calling Lemtel. How can I help?', t: 0 },
      { speaker: 'customer', text: 'I wanted to renew my plan.', t: 6 },
    ],
    summary: 'Renewal call.', topics: ['renewal'], actionItems: ['Send pricing PDF'],
    qualityScore: 87, intent: 'Renewal', tags: ['priority'],
  };
};

const threadsMock: SmsThread[] = [
  { id: 't1', contact: 'Marie Tremblay', number: '+1 514 555 0123', lastMessage: 'Perfect, I will review.', unread: 0, updatedAt: '10:42' },
  { id: 't2', contact: 'Acme Corp',      number: '+1 438 555 9988', lastMessage: 'Can we reschedule?',     unread: 2, updatedAt: '09:31' },
];
const messagesMock: Record<string, SmsMessage[]> = {
  t1: [{ id: 'm1', from: 'them', body: 'Hi, did you get the quote?', at: '10:14' }],
  t2: [{ id: 'm4', from: 'them', body: 'Can we reschedule?', at: '09:30' }],
};
const voicemailMock: VoicemailEntry[] = [
  { id: 'v1', from: '+1 514 555 0123', customer: 'Marie Tremblay', receivedAt: new Date(Date.now() - 30*60e3).toISOString(), durationSec: 72, transcript: 'Calling to renew.', summary: 'Wants to renew today.', priority: 'high', sentiment: 'positive', isNew: true },
];

/* ─── Public API ──────────────────────────────────────────────── */


/* ─── Mappeurs CDR FusionPBX ──────────────────────────────── */
function mapCdrToCallRecord(r: any): CallRecord {
  const billsec = Number(r.billsec ?? r.duration_seconds ?? 0);
  const missed  = r.missed_call || r.hangup_cause === 'NO_ANSWER' || billsec === 0;
  return {
    id:           r.id ?? String(Math.random()),
    direction:    (r.direction === 'outbound' ? 'out' : 'in') as 'in' | 'out',
    status:       (r.voicemail_message ? 'voicemail' : missed ? 'missed' : 'answered') as any,
    from:         r.caller_number ?? '',
    to:           r.destination_number ?? '',
    customer:     r.caller_name ?? undefined,
    startedAt:    r.start_at ?? new Date().toISOString(),
    durationSec:  billsec,
    hasRecording: !!(r.has_recording || r.recording_path || r.recording_name),
    hasTranscript: false,
    sentiment:    undefined,
  };
}

function mapCdrToVoicemailEntry(r: any): VoicemailEntry {
  return {
    id:          r.id ?? String(Math.random()),
    from:        r.caller_number ?? '',
    customer:    r.caller_name ?? undefined,
    receivedAt:  r.start_at ?? new Date().toISOString(),
    durationSec: Number(r.billsec ?? r.duration_seconds ?? 0),
    transcript:  r.voicemail_message ?? 'Transcription non disponible.',
    summary:     r.voicemail_message
                   ? r.voicemail_message.slice(0, 120)
                   : 'Aucun résumé disponible.',
    priority:    'normal' as const,
    sentiment:   'neutral' as const,
    isNew:       !r.voicemail_read,
    xml_cdr_uuid:   r.pbx_uuid ?? r.xml_cdr_uuid ?? r.id ?? undefined,
    record_path:    r.recording_path ?? undefined,
    record_name:    r.recording_name ?? undefined,
    domain_uuid:    r.domain_uuid ?? undefined,
    domain_name:    r.domain_name ?? undefined,
    organization_id: r.organization_id ?? undefined,
  };
}

export const mobileApi = {
  me:        () => call<MeResponse>('/mobile-me', undefined, meMock),
  dashboard: () => call<DashboardBrief>('/mobile-dashboard', undefined, dashboardMock),
  homeStats: (period: 'today' | 'week' | 'month', lang?: 'fr' | 'en') => call<HomeStatsResponse>(
    `/mobile-home-stats?period=${period}&lang=${lang || 'fr'}`,
    undefined,
    { period, lang: lang || 'fr', scope: { organizationId: null, extension: null }, stats: emptyHomeStats(), prior: emptyHomeStats(), summary: '', insights: [] } as HomeStatsResponse,
  ),

  webphoneToken: () => call<{ token: string; expiresAt: string; wssUrl: string }>(
    '/softphone-credentials', { method: 'POST' },
    { token: 'mock', expiresAt: new Date(Date.now() + 30*60e3).toISOString(), wssUrl: 'sips://pbxnode.lemtel.tel:5061' },
  ),

  startCall: (to: string, mode?: 'webrtc' | 'click_to_call') => call<{ callId: string; mode: 'webrtc' | 'click_to_call'; to?: string; from?: string }>(
    '/mobile-calls-start', { method: 'POST', body: JSON.stringify({ to, mode }) },
    { callId: 'call-' + Date.now(), mode: 'webrtc' },
  ),

  // Server-side gate: is the FusionPBX `originate-click-to-call` permission
  // available right now? Used by the dialer to enable/disable the fallback
  // button and surface the exact reason if disabled.
  clickToCallStatus: () => call<{ enabled: boolean; reason: string | null; required?: string[]; source?: string }>(
    '/mobile-click-to-call-status', { method: 'GET' },
    { enabled: false, reason: 'Mock mode' },
  ),

  // Recents: scoped server-side to the caller's org + extension via mobile-calls.
  // Default to a small page (20 rows) for fast mobile loads; callers can override.
  calls: (opts?: { rangeDays?: 7 | 30; extension?: string | null; limit?: number }) => call<CallRecord[] | any>(`/mobile-calls?days=${opts?.rangeDays || 7}&limit=${opts?.limit ?? 20}${opts?.extension && opts.extension !== 'all' ? `&extension=${encodeURIComponent(opts.extension)}` : ''}`, undefined, callsMock).then((raw: any) => {
    if (isMockMode()) return raw as CallRecord[];
    if (!Array.isArray(raw)) throw new Error('Invalid response from mobile-calls');
    return raw as CallRecord[];
  }),
  callDetail: (id: string) => call<CallDetail>(`/mobile-calls?id=${encodeURIComponent(id)}`, undefined, callDetailMock(id)),

  // Recordings: list of completed calls with audio. Scoped server-side
  // (admins see the whole domain, regular users only their extension).
  recordings: (extension?: string, opts?: { rangeDays?: 7 | 30 }) => call<RecordingEntry[] | any>(
    `/mobile-recordings?days=${opts?.rangeDays || 7}${extension && extension !== 'all' ? `&extension=${encodeURIComponent(extension)}` : ''}`,
    undefined, [] as RecordingEntry[],
  ).then((raw: any) => {
    if (Array.isArray(raw)) return raw as RecordingEntry[];
    if (Array.isArray(raw?.items)) return raw.items as RecordingEntry[];
    throw new Error('Invalid response from mobile-recordings');
  }),


  threads:    () => call<SmsThread[]>('/mobile-sms', undefined, threadsMock),
  thread:     (id: string) => call<SmsMessage[]>(`/mobile-sms?threadId=${encodeURIComponent(id)}`, undefined, messagesMock[id] || []),
  sendMessage:(threadId: string, body: string) => call<{ id: string }>(
    '/mobile-sms', { method: 'POST', body: JSON.stringify({ threadId, body }) },
    { id: 'm' + Date.now() },
  ),

  // Voicemail: scoped server-side via mobile-voicemails (returns audio metadata for signed URL).
  voicemails: () => call<VoicemailEntry[] | any>('/mobile-voicemails', undefined, voicemailMock).then((raw: any) => {
    if (isMockMode()) return raw as VoicemailEntry[];
    if (!Array.isArray(raw)) throw new Error('Invalid response from mobile-voicemails');
    return raw as VoicemailEntry[];
  }),
  // Issues a short-lived signed URL (default 5 min) for the recording/voicemail
  // audio. The bytes are pulled from FusionPBX by the edge function, uploaded
  // to private Supabase Storage and signed there — the device never sees a
  // raw FusionPBX URL. Every issuance is audited server-side.
  voicemailAudio: (params: { xml_cdr_uuid?: string; record_path?: string; record_name?: string; domain_uuid?: string; domain_name?: string; organization_id?: string }) =>
    call<{ ok: boolean; url: string; expiresInSec: number; contentType: string }>(
      '/fusionpbx-proxy',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'get-recording-signed-url',
          organization_id: params.organization_id,
          params: {
            xml_cdr_uuid: params.xml_cdr_uuid,
            record_path: params.record_path,
            record_name: params.record_name,
            domain_uuid: params.domain_uuid,
            domain_name: params.domain_name,
            expires_in: 300,
          },
        }),
      },
      { ok: true, url: '', expiresInSec: 0, contentType: 'audio/wav' },
    ),

  analyzeCall: (callId: string, meta?: { transcript?: string | null; transcript_text?: string | null; organization_id?: string | null; force?: boolean }) => call<{ jobId?: string; transcript?: string; transcript_text?: string; summary?: string; sentiment?: string; topics?: string[]; action_items?: string[]; analysis?: any; insights?: any }>(
    '/ai-analyze-call', {
      method: 'POST',
      body: JSON.stringify({
        call_id: callId,
        call_record_id: callId,
        transcript: meta?.transcript || meta?.transcript_text || undefined,
        organization_id: meta?.organization_id || undefined,
        force: meta?.force || undefined,
      }),
    },
    { jobId: 'job-' + Date.now() },
  ),
  transcribeCall: async (callId: string, meta?: { recording_path?: string | null; recording_name?: string | null; domain_uuid?: string | null; xml_cdr_uuid?: string | null; organization_id?: string | null; vm_id?: string | null; force?: boolean; disableClaude?: boolean }) => {
    const cid = String(callId);
    const xmlCdrUuid = meta?.xml_cdr_uuid || (meta?.recording_name ? String(meta.recording_name).replace(/\.(mp3|wav|ogg|m4a|webm)$/i, '') : '') || callId;
    const vm = meta?.vm_id ? ` vm_id=${meta.vm_id}` : '';
    const tag = `[mobileApi.transcribeCall] cid=${cid}${vm}`;
    const startedAt = Date.now();
    const payload = {
      call_record_id: callId,
      xml_cdr_uuid: xmlCdrUuid,
      recording_path: meta?.recording_path || undefined,
      recording_name: meta?.recording_name || undefined,
      record_path: meta?.recording_path || undefined,
      record_name: meta?.recording_name || undefined,
      domain_uuid: meta?.domain_uuid || undefined,
      organization_id: meta?.organization_id || '71755d33-ed64-4ad5-a828-61c9d2029eb7',
      vm_id: meta?.vm_id || undefined,
      force: meta?.force || undefined,
      disable_claude: meta?.disableClaude || undefined,
    };
    console.log(`${tag} action=invoke`, {
      has_recording_path: !!payload.recording_path,
      has_recording_name: !!payload.recording_name,
      organization_id: payload.organization_id,
      force: !!payload.force,
    });
    try {
      const res = await call<{ transcript_text?: string; stub?: boolean; reason?: string; error?: string; details?: string; fetchErrors?: string[]; provider?: string; attempts?: any[]; cid?: string }>(
        '/ai-transcribe-call', { method: 'POST', body: JSON.stringify(payload) },
        { transcript_text: 'Mock transcript', stub: false },
      );
      console.log(`${tag} action=response`, {
        ms: Date.now() - startedAt,
        provider: res?.provider || null,
        stub: !!res?.stub,
        reason: res?.reason || null,
        error: res?.error || null,
        text_len: res?.transcript_text?.length || 0,
      });
      return res;
    } catch (e: any) {
      console.warn(`${tag} action=error`, {
        ms: Date.now() - startedAt,
        status: e?.status,
        code: e?.code,
        message: e?.message,
        detail: e?.detail,
      });
      throw e;
    }
  },
  generateGreeting: (prompt: string) => call<{ text: string; audioUrl?: string }>(
    '/elevenlabs-generate-greeting', { method: 'POST', body: JSON.stringify({ prompt }) },
    { text: `Thanks for calling Lemtel. Leave a message and we'll call you back. ${prompt ? `(${prompt})` : ''}` },
  ),
  aiRewrite: (text: string, action: 'rewrite' | 'professional' | 'shorten' | 'translate') => call<{ text: string }>(
    '/improve-prompt', { method: 'POST', body: JSON.stringify({ text, action }) },
    { text: action === 'shorten' ? text.split(/[.!?]/)[0] + '.' : action === 'translate' ? `[FR] ${text}` : action === 'professional' ? `Bonjour,\n\n${text}\n\nCordialement.` : `${text} — refined by AVA.` },
  ),

  setForwarding: (target: string | null) => call<{ ok: true }>(
    '/mobile-settings-forwarding', { method: 'POST', body: JSON.stringify({ target }) }, { ok: true },
  ),
  setDnd: (enabled: boolean) => call<{ ok: true }>(
    '/mobile-settings-dnd', { method: 'POST', body: JSON.stringify({ enabled }) }, { ok: true },
  ),

  // Domain-wide stats for the mobile dashboard (read-only). Range: today|7d|30d.
  domainStats: (range: StatsRange = 'today') => call<DomainStats>(
    `/mobile-domain-stats?range=${range}`,
    undefined,
    {
      callsToday: 24, answeredToday: 18, missedToday: 6, voicemailsToday: 3,
      avgDurationSec: 142, activeExtensions: 8,
      last7Days: [12, 18, 9, 22, 30, 14, 24],
      topExtensions: [
        { extension: '101', name: 'Marie T.',  calls: 12 },
        { extension: '102', name: 'Alex M.',   calls: 9  },
        { extension: '110', name: 'Reception', calls: 7  },
      ],
      range, totalCalls: 24, answered: 18, missed: 6, voicemails: 3,
      totalTalkSec: 3400, answerRate: 75, peakHour: 14,
      buckets: [12, 18, 9, 22, 30, 14, 24],
    },
  ),

  // Call queues — read-only list with live stats.
  queues: () => call<QueueRow[]>('/mobile-queues', undefined, [
    { id: 'q1', name: 'Sales',       extension: '600', strategy: 'ring-all',     waiting: 2, agentsOnline: 4, callsToday: 38, avgWaitSec: 42, slaPct: 88 },
    { id: 'q2', name: 'Support',     extension: '601', strategy: 'longest-idle', waiting: 5, agentsOnline: 3, callsToday: 51, avgWaitSec: 78, slaPct: 71 },
    { id: 'q3', name: 'After-hours', extension: '602', strategy: 'fewest-calls', waiting: 0, agentsOnline: 0, callsToday: 4,  avgWaitSec: 0,  slaPct: 0 },
  ]),

  // Chatbot endpoint — unified ava-assistant with full PBX tool catalog
  // (calls, recordings, voicemail, SMS, contacts, presence, extensions,
  // reports, and confirmed actions like send_sms / click_to_call).
  chat: (message: string, history: { role: 'user' | 'assistant'; content: string }[] = []) =>
    call<ChatReply>(
      '/ava-assistant',
      { method: 'POST', body: JSON.stringify({ message, history }) },
      { answer: "I'm running in mock mode — connect to your AVA workspace to ask live questions about your PBX." },
    ),

  // GDPR / store-compliance: delete the signed-in user's account.
  deleteAccount: () => call<{ ok: true }>(
    '/mobile-delete-account', { method: 'POST', body: '{}' }, { ok: true },
  ),

  // AVA AI summary for the dashboard (Lovable AI Gateway via edge function).
  aiSummary: (range: StatsRange | 'custom', stats: any, periodLabel?: string) =>
    call<{ ok: boolean; summary: string; range: string }>(
      '/ai-summary',
      { method: 'POST', body: JSON.stringify({ range, stats, periodLabel }) },
      { ok: true, summary: 'Mock: 24 calls, 75% answered, peak 14:00, top ext 101.', range: String(range) },
    ),
};
