// Returns fresh TURN/STUN ICE servers for WebRTC calls.
// Fetches dynamically from Metered API; falls back to hardcoded creds on failure.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const METERED_API_KEY = Deno.env.get('METERED_API_KEY') ?? '';
const METERED_APP_NAME = Deno.env.get('METERED_APP_NAME') ?? 'lemtel';

const FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'e499486ca9b7d5a03a01e915',
    credential: 'uMFpNAFBoFFUHOdF',
  },
  {
    urls: 'turn:global.relay.metered.ca:443?transport=tcp',
    username: 'e499486ca9b7d5a03a01e915',
    credential: 'uMFpNAFBoFFUHOdF',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'e499486ca9b7d5a03a01e915',
    credential: 'uMFpNAFBoFFUHOdF',
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (!METERED_API_KEY) {
    return new Response(JSON.stringify(FALLBACK), { headers: jsonHeaders });
  }
  try {
    const res = await fetch(
      `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_API_KEY)}`,
    );
    if (!res.ok) throw new Error(`metered ${res.status}`);
    const iceServers = await res.json();
    return new Response(JSON.stringify(iceServers), { headers: jsonHeaders });
  } catch (e) {
    console.error('[get-turn-credentials] falling back:', (e as Error).message);
    return new Response(JSON.stringify(FALLBACK), { headers: jsonHeaders });
  }
});
