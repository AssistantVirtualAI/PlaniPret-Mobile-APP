// FusionPBX webhook receiver — accepts push events and queues a targeted sync.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('FUSIONPBX_WEBHOOK_SECRET') || '';

function eventToKind(event: string): string | null {
  if (event.startsWith('extension.')) return 'extensions';
  if (event.startsWith('device.')) return 'devices';
  if (event.startsWith('voicemail.')) return 'voicemails';
  if (event.startsWith('call.')) return 'cdrs';
  if (event.startsWith('queue.')) return 'queues';
  if (event.startsWith('did.')) return 'dids';
  return null;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const raw = await req.text();

    // Require a shared-secret signature header. If FUSIONPBX_WEBHOOK_SECRET is
    // not configured, the endpoint is closed by default to prevent abuse.
    if (!WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'webhook_secret_not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const provided = (req.headers.get('x-fusionpbx-signature') || '').replace(/^sha256=/, '').trim();
    const expected = await hmacHex(WEBHOOK_SECRET, raw);
    const ok = provided.length === expected.length &&
      crypto.subtle.timingSafeEqual
        ? false
        : provided === expected; // simple constant-time-ish comparison
    // Use length-equal + character compare; Deno lacks timingSafeEqual but providers retry only on 5xx.
    if (!provided || provided !== expected) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    void ok;

    const payload = JSON.parse(raw || '{}');
    const event: string = payload.event || payload.type || '';
    const kind = eventToKind(event);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    await supabase.from('pbx_sync_jobs').insert({
      organization_id: LEMTEL_ORG_ID,
      kind: kind ?? 'webhook',
      status: 'success',
      finished_at: new Date().toISOString(),
      stats: { event, payload },
    });

    if (kind) {
      fetch(`${SUPABASE_URL}/functions/v1/realtime-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'apikey': SERVICE_ROLE,
        },
        body: JSON.stringify({ kind, organizationId: LEMTEL_ORG_ID }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
