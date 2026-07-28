// Fetches fresh ICE servers (STUN/TURN) from the Supabase edge function
// `get-turn-credentials`, which proxies the Metered API. Falls back to
// known-good hardcoded TURN creds on failure so calls can still connect.

const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:172.105.5.32:80',
    username: '3be600b667e7e7552e76d2a2',
    credential: 'iSsrmGAndAETBKQO',
  },
  {
    urls: 'turn:172.105.5.32:80?transport=tcp',
    username: '3be600b667e7e7552e76d2a2',
    credential: 'iSsrmGAndAETBKQO',
  },
  {
    urls: 'turn:172.105.5.32:443',
    username: '3be600b667e7e7552e76d2a2',
    credential: 'iSsrmGAndAETBKQO',
  },
  {
    urls: 'turns:172.105.5.32:443?transport=tcp',
    username: '3be600b667e7e7552e76d2a2',
    credential: 'iSsrmGAndAETBKQO',
  },
];

let cache: { at: number; servers: RTCIceServer[] } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 min

// Metered TURN IP — bypasses DNS issues on Bell/cellular networks
const METERED_IP = '172.105.5.32';

function resolveHostToIp(servers: RTCIceServer[]): RTCIceServer[] {
  return servers.map((s) => ({
    ...s,
    urls: typeof s.urls === 'string'
      ? s.urls.replace('global.relay.metered.ca', METERED_IP)
      : (s.urls as string[]).map((u) => u.replace('global.relay.metered.ca', METERED_IP)),
  }));
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  // Android uses JsSIP over WSS (migrated from Verto) and requires ICE
  // servers for NAT traversal — do NOT skip on Android.
  if (cache && Date.now() - cache.at < TTL_MS) return cache.servers;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-turn-credentials`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) {
      const servers = (await res.json()) as RTCIceServer[];
      if (Array.isArray(servers) && servers.length) {
        // Replace hostnames with direct IP to bypass Bell DNS issues
        const resolved = resolveHostToIp(servers);
        cache = { at: Date.now(), servers: resolved };
        return resolved;
      }
    }
  } catch (e) {
    console.warn('[iceServers] fetch failed, using fallback', e);
  }
  return FALLBACK_ICE_SERVERS;
}
