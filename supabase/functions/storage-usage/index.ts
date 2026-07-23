// Storage usage reporter for the admin dashboard gauge.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function bucketBytes(supabase: any, bucket: string): Promise<number> {
  let total = 0;
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit, offset });
    if (error || !data?.length) break;
    for (const f of data) total += (f.metadata?.size as number) || 0;
    if (data.length < limit) break;
    offset += limit;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [recordings, voicemails, greetings] = await Promise.all([
      bucketBytes(supabase, 'lemtel-recordings'),
      bucketBytes(supabase, 'voicemail-audio'),
      bucketBytes(supabase, 'voicemail-greetings'),
    ]);
    const totalBytes = recordings + voicemails + greetings;
    const quotaBytes = 10 * 1024 * 1024 * 1024;
    return new Response(JSON.stringify({
      ok: true, recordings, voicemails, greetings,
      totalBytes, quotaBytes,
      pct: Math.round((totalBytes / quotaBytes) * 100),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
