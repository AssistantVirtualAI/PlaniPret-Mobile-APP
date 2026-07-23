// Provider Credentials Vault — encrypts secret fields at rest (AES-256-GCM)
// and writes an audit entry for every mutating/revealing action.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENC_KEY_B64 = Deno.env.get('PBX_ENCRYPTION_KEY') || '';
const KEY_VERSION = 1;
const ENC_PREFIX = `enc:v${KEY_VERSION}:`;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

let cryptoKeyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (cryptoKeyPromise) return cryptoKeyPromise;
  if (!ENC_KEY_B64) {
    throw new Error('PBX_ENCRYPTION_KEY is not configured');
  }
  let raw = b64ToBytes(ENC_KEY_B64).slice(0, 32);
  if (raw.length < 32) {
    throw new Error('PBX_ENCRYPTION_KEY must decode to at least 32 bytes');
  }
  cryptoKeyPromise = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return cryptoKeyPromise;
}

async function encrypt(plain: string): Promise<string> {
  if (!plain) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey();
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `${ENC_PREFIX}${bytesToB64(iv)}:${bytesToB64(ct)}`;
}

async function decrypt(token: string): Promise<string> {
  if (!token?.startsWith(ENC_PREFIX)) return token || '';
  const rest = token.slice(ENC_PREFIX.length);
  const [ivB64, ctB64] = rest.split(':');
  if (!ivB64 || !ctB64) return '';
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const key = await getKey();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return `••••••${value.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return j({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return j({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const provider = String(body.provider || '').toLowerCase();
    const orgId = body.organization_id || null;
    const fields: { key: string; secret: boolean }[] = Array.isArray(body.fields) ? body.fields : [];
    const reveal = !!body.reveal;
    const values: Record<string, string> = body.values || {};

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = req.headers.get('user-agent') || null;

    const audit = (act: string, field: string | null = null, meta: any = {}) =>
      admin.from('provider_credentials_audit').insert({
        organization_id: orgId,
        actor_user_id: user.id,
        actor_email: user.email,
        provider,
        action: act,
        field_changed: field,
        ip,
        user_agent: ua,
        metadata: meta,
      });

    // Authorization: only super_admin or org_admin/manager of the org may
    // mutate or reveal provider credentials. `get` without reveal is allowed
    // for any authenticated org member (returns masked values only).
    const isPrivileged = async (): Promise<boolean> => {
      try {
        const sa = await admin.rpc('is_super_admin', { _user_id: user.id });
        if (sa.data === true) return true;
      } catch {}
      if (!orgId) return false;
      const { data: roles } = await admin
        .from('user_roles').select('role')
        .eq('user_id', user.id).eq('organization_id', orgId)
        .in('role', ['org_admin', 'manager']);
      return ((roles as any[])?.length ?? 0) > 0;
    };
    const needsPrivilege = action === 'set' || (action === 'get' && reveal);
    if (needsPrivilege && !(await isPrivileged())) {
      await audit('denied', null, { action, reveal });
      return j({ error: 'forbidden' }, 403);
    }

    const keyFor = (f: string) => `PROVIDER_${provider.toUpperCase()}_${f.toUpperCase()}`;

    if (action === 'get') {
      const keys = fields.map((f) => keyFor(f.key));
      const { data: rows, error } = await admin.from('lemtel_config').select('key, value, encrypted').in('key', keys);
      if (error) return j({ error: error.message }, 400);
      const out: Record<string, string> = {};
      for (const f of fields) {
        const k = keyFor(f.key);
        const row = rows?.find((r: any) => r.key === k);
        let val = row?.value ?? '';
        if (row?.encrypted && val) {
          if (reveal) {
            val = await decrypt(val);
          } else {
            try { val = mask(await decrypt(val)); } catch { val = '••••'; }
          }
        } else if (f.secret && val && !reveal) {
          val = mask(val);
        }
        out[f.key] = val;
      }
      if (reveal) await audit('reveal', null, { fields: fields.filter((f) => f.secret).map((f) => f.key) });
      else await audit('view');
      return j({ ok: true, values: out, masked: !reveal });
    }

    if (action === 'set') {
      const rows: any[] = [];
      const changed: string[] = [];
      for (const f of fields) {
        const v = values[f.key] ?? '';
        if (v === '__KEEP__') continue;
        changed.push(f.key);
        const stored = f.secret && v ? await encrypt(v) : v;
        rows.push({
          key: keyFor(f.key),
          value: stored,
          is_secret: f.secret,
          encrypted: f.secret && !!v,
          encryption_version: f.secret && v ? KEY_VERSION : null,
        });
      }
      if (rows.length) {
        const { error } = await admin.from('lemtel_config').upsert(rows, { onConflict: 'key' });
        if (error) return j({ error: error.message }, 400);
      }
      for (const f of changed) await audit('update', f);
      return j({ ok: true, updated: changed.length });
    }

    if (action === 'audit') {
      // Only privileged users may write arbitrary audit entries (prevents log poisoning).
      if (!(await isPrivileged())) {
        return j({ error: 'forbidden' }, 403);
      }
      const allowed = new Set(['test', 'view', 'reveal', 'update', 'denied']);
      const evt = String(body.event || 'test');
      if (!allowed.has(evt)) return j({ error: 'invalid_event' }, 400);
      await audit(evt, body.field || null, body.metadata || {});
      return j({ ok: true });
    }

    return j({ error: 'unknown_action' }, 400);
  } catch (e: any) {
    return j({ error: e?.message || 'internal' }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
