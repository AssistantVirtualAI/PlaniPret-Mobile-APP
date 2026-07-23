// Test provider credentials by performing a cheap auth probe per provider.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Provider = 'twilio' | 'telnyx' | 'skyetel' | 'voipms';

interface Body {
  provider: Provider;
  credentials: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const { provider, credentials } = body;
    if (!provider || !credentials) {
      return json({ ok: false, error: 'provider and credentials required' }, 400);
    }
    const res = await probe(provider, credentials);
    return json(res, res.ok ? 200 : 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function probe(p: Provider, c: Record<string, string>) {
  try {
    if (p === 'twilio') {
      const sid = c.account_sid; const token = c.auth_token;
      if (!sid || !token) return { ok: false, error: 'Missing Account SID or Auth Token' };
      const auth = btoa(`${sid}:${token}`);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!r.ok) return { ok: false, error: `Twilio ${r.status}: ${await r.text()}` };
      const j = await r.json();
      return { ok: true, info: { friendlyName: j.friendly_name, status: j.status } };
    }
    if (p === 'telnyx') {
      const key = c.api_key;
      if (!key) return { ok: false, error: 'Missing API key' };
      const r = await fetch('https://api.telnyx.com/v2/whoami', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return { ok: false, error: `Telnyx ${r.status}: ${await r.text()}` };
      return { ok: true, info: await r.json() };
    }
    if (p === 'skyetel') {
      const sid = c.sid; const secret = c.secret;
      if (!sid || !secret) return { ok: false, error: 'Missing SID or Secret' };
      const auth = btoa(`${sid}:${secret}`);
      const r = await fetch('https://api.skyetel.com/v1/endpoint_groups', {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!r.ok) return { ok: false, error: `Skyetel ${r.status}: ${await r.text()}` };
      const j = await r.json();
      return { ok: true, info: { groups: Array.isArray(j) ? j.length : 0 } };
    }
    if (p === 'voipms') {
      const user = c.api_username; const pass = c.api_password;
      if (!user || !pass) return { ok: false, error: 'Missing API username or password' };
      const url = `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(user)}&api_password=${encodeURIComponent(pass)}&method=getServerInfo`;
      const r = await fetch(url);
      if (!r.ok) return { ok: false, error: `VoIP.ms ${r.status}: ${await r.text()}` };
      const j = await r.json();
      if (j.status !== 'success') return { ok: false, error: `VoIP.ms: ${j.status}` };
      return { ok: true, info: j };
    }
    return { ok: false, error: `Unknown provider ${p}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
