// Exchange a mint-app-login-token for a real Supabase session + active domain.
// Public endpoint — anyone who holds the token can consume it once.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body || {};
    if (!token || typeof token !== 'string' || token.length < 32) {
      return json({ error: 'missing_token' }, 400);
    }
    const hash = await sha256(token);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Atomically claim the token (single-use + expiration enforced here)
    const { data: row, error } = await admin.from('app_login_tokens')
      .update({ consumed_at: new Date().toISOString() })
      .eq('token_hash', hash)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('user_id,organization_id,app')
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!row) return json({ error: 'invalid_or_expired' }, 401);

    // Domain-scoping check: target user must still belong to that org
    // (or be super_admin). Tokens cannot grant access to other domains.
    const { data: roles } = await admin.from('user_roles')
      .select('role,organization_id').eq('user_id', row.user_id);
    const isSuper = (roles || []).some((r: any) => r.role === 'super_admin');
    const inOrg = (roles || []).some((r: any) => r.organization_id === row.organization_id);
    if (!isSuper && !inOrg) return json({ error: 'not_in_domain' }, 403);

    // Fetch user email to generate a magic-link
    const { data: usr } = await admin.auth.admin.getUserById(row.user_id);
    const email = usr?.user?.email;
    if (!email) return json({ error: 'user_missing' }, 500);

    // Generate a magic-link the client can verify to obtain a session
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) return json({ error: linkErr.message }, 500);

    // Domain payload
    const { data: dom } = await admin.from('pbx_domains')
      .select('domain_uuid,domain_name').eq('organization_id', row.organization_id).maybeSingle();

    return json({
      email,
      // Client should call supabase.auth.verifyOtp({ type:'magiclink', token_hash, email })
      token_hash: link.properties?.hashed_token,
      action_link: link.properties?.action_link,
      app: row.app,
      domain: dom
        ? { uuid: dom.domain_uuid, name: dom.domain_name, org_id: row.organization_id }
        : { uuid: '', name: '', org_id: row.organization_id },
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
