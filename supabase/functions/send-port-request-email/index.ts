import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { request_id, numbers, carrier, account_number, authorized_name, desired_port_date, service_address, notes, domain_uuid } = body;
    const RESEND = Deno.env.get('RESEND_API_KEY');
    if (!RESEND) throw new Error('RESEND_API_KEY missing');

    const html = `<h2>New Number Porting Request</h2>
<p><b>Request ID:</b> ${request_id}</p>
<p><b>Domain UUID:</b> ${domain_uuid || '—'}</p>
<p><b>Numbers:</b> ${(numbers || []).join(', ')}</p>
<p><b>Current carrier:</b> ${carrier}</p>
<p><b>Account #:</b> ${account_number}</p>
<p><b>Authorized name:</b> ${authorized_name}</p>
<p><b>Desired port date:</b> ${desired_port_date || '—'}</p>
<p><b>Service address:</b> ${JSON.stringify(service_address)}</p>
<p><b>Notes:</b> ${notes || '—'}</p>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AVA Telecom <portage@ava-telecom.ca>',
        to: ['support@ava-telecom.ca'],
        subject: `Port request: ${(numbers || []).join(', ')}`,
        html,
      }),
    });
    const txt = await res.text();
    return new Response(JSON.stringify({ ok: res.ok, response: txt }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
