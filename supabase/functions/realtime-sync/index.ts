// Realtime FusionPBX sync engine — invoked by pg_cron every 5 minutes or on-demand.
// Reads from the fusionpbx-proxy and upserts into pbx_* tables, logging each run in pbx_sync_jobs.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

type SyncKind =
  | 'extensions' | 'devices' | 'dids' | 'ivr' | 'queues'
  | 'ring-groups' | 'cdrs' | 'recordings' | 'voicemails' | 'all';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function callProxy(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fusionpbx-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`proxy ${action} ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function runOne(supabase: ReturnType<typeof createClient>, kind: SyncKind, orgId: string) {
  const startedIso = new Date().toISOString();
  const { data: job } = await supabase
    .from('pbx_sync_jobs')
    .insert({ organization_id: orgId, job_type: kind, status: 'running', started_at: startedIso })
    .select('id')
    .single();
  const jobId = job?.id;
  let stats: Record<string, unknown> = {};
  try {
    // Delegate to fusionpbx-proxy sync-all which already upserts each resource into pbx_* tables.
    const resourceMap: Record<string, string[]> = {
      extensions: ['extensions'],
      devices: ['devices'],
      ivr: ['ivrs'],
      queues: ['queues'],
      'ring-groups': ['ring_groups'],
      gateways: ['gateways'],
      cdrs: ['cdrs'],
      dids: ['destinations'],
      recordings: ['cdrs'], // recordings come with CDRs
      voicemails: ['cdrs'], // voicemails synced via voicemail-sync; CDRs cover the timeline
      all: ['extensions', 'devices', 'ivrs', 'queues', 'ring_groups', 'gateways', 'cdrs'],
    };
    const resources = resourceMap[kind] || ['cdrs'];
    const data = await callProxy('sync-all', { organizationId: orgId, resources });
    stats = (data?.stats || {}) as Record<string, unknown>;
    await supabase.from('pbx_sync_jobs').update({
      status: data?.success === false ? 'completed_with_errors' : 'completed',
      completed_at: new Date().toISOString(), stats,
      error: Array.isArray(data?.errors) && data.errors.length ? data.errors.join('; ').slice(0, 2000) : null,
    }).eq('id', jobId);
    return { kind, ok: true, stats };
  } catch (e) {
    await supabase.from('pbx_sync_jobs').update({
      status: 'failed', completed_at: new Date().toISOString(),
      error: String((e as Error).message).slice(0, 500), stats,
    }).eq('id', jobId);
    return { kind, ok: false, error: String((e as Error).message) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // AUTH: only service-role or org admins/super-admins can trigger sync
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const orgId = (body.organizationId as string) || LEMTEL_ORG_ID;
    const requested: SyncKind = (body.kind as SyncKind) || 'all';

    const isServiceRole = token && token === SERVICE_ROLE;
    if (!isServiceRole) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: user.id });
      let allowed = !!isSuper;
      if (!allowed) {
        const { data: hasAdmin } = await admin.rpc('has_role', {
          _user_id: user.id, _org_id: orgId, _role: 'org_admin',
        });
        allowed = !!hasAdmin;
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);


    // 'all' triggers a single sync-all proxy call; specific kinds run as targeted jobs.
    const kinds: SyncKind[] = requested === 'all' ? ['all'] : [requested];
    const results = [] as unknown[];
    for (const k of kinds) results.push(await runOne(supabase, k, orgId));

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
