// Mint a short-lived single-use token that lets a user auto-login into the
// desktop/mobile softphone app, pinned to a customer domain (organization).
//
// Caller: an authenticated admin (super_admin or org_admin) requesting a token
// for one of *their* users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    const callerId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const { target_user_id, organization_id, app = 'desktop' } = body || {};
    if (!target_user_id || !organization_id) return json({ error: 'missing_params' }, 400);
    if (!['mobile', 'desktop', 'web'].includes(app)) return json({ error: 'bad_app' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize caller: super_admin OR org_admin/manager of that org
    const { data: roles } = await admin.from('user_roles')
      .select('role,organization_id').eq('user_id', callerId);
    const isSuper = (roles || []).some((r: any) => r.role === 'super_admin');
    const isOrgAdmin = (roles || []).some((r: any) =>
      r.organization_id === organization_id && ['org_admin', 'manager'].includes(r.role));
    if (!isSuper && !isOrgAdmin) return json({ error: 'forbidden' }, 403);

    // Verify target user belongs to the org
    const { data: tgt } = await admin.from('user_roles')
      .select('user_id').eq('user_id', target_user_id).eq('organization_id', organization_id).maybeSingle();
    if (!tgt && !isSuper) return json({ error: 'target_not_in_org' }, 400);

    // Generate token (URL-safe), store only the hash
    const raw = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const hash = await sha256(raw);

    const { error: insErr } = await admin.from('app_login_tokens').insert({
      token_hash: hash,
      user_id: target_user_id,
      organization_id,
      app,
      created_by: callerId,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // Resolve domain payload for client convenience
    const { data: dom } = await admin.from('pbx_domains')
      .select('domain_uuid,domain_name').eq('organization_id', organization_id).maybeSingle();

    return json({
      token: raw,
      expires_in: 900,
      app,
      domain: dom ? { uuid: dom.domain_uuid, name: dom.domain_name, org_id: organization_id } : null,
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
