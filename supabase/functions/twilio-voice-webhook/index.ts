import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/xml',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse form data from Twilio (also keep raw object for signature validation)
    const formData = await req.formData();
    const dataObj: Record<string, string> = {};
    formData.forEach((v, k) => { dataObj[k] = String(v); });

    // Validate Twilio signature
    const { validateTwilioSignature } = await import('../_shared/twilio.ts');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const signature = req.headers.get('X-Twilio-Signature') || '';
    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured — rejecting voice webhook');
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Server misconfigured</Say></Response>`,
        { status: 500, headers: corsHeaders }
      );
    }
    const isValid = await validateTwilioSignature(twilioAuthToken, signature, req.url, dataObj);
    if (!isValid) {
      console.warn('Invalid Twilio signature on voice webhook');
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Unauthorized</Say></Response>`,
        { status: 403, headers: corsHeaders }
      );
    }

    const to = dataObj['To'];
    const from = dataObj['From'];
    const callSid = dataObj['CallSid'];

    console.log(`Incoming call: From=${from}, To=${to}, CallSid=${callSid}`);

    if (!to) {
      console.error('Missing To parameter');
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid request</Say></Response>`,
        { headers: corsHeaders }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the agent assigned to this phone number
    const { data: agent, error } = await supabase
      .from('agents')
      .select('id, name, platform, platform_agent_id, config, organization_id')
      .eq('twilio_number', to)
      .single();

    if (error || !agent) {
      console.error('No agent found for number:', to, error);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No agent configured for this number</Say></Response>`,
        { headers: corsHeaders }
      );
    }

    console.log(`Found agent: ${agent.name} (${agent.platform})`);

    // Get the platform agent ID
    const platformAgentId = agent.platform_agent_id || agent.config?.agent_id;
    
    if (!platformAgentId) {
      console.error('Agent has no platform_agent_id configured');
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Agent not properly configured</Say></Response>`,
        { headers: corsHeaders }
      );
    }

    const escapeXml = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const fromSafe = escapeXml(from);
    const platformAgentIdSafe = encodeURIComponent(platformAgentId);

    // Generate TwiML based on platform
    let twiml = '';

    switch (agent.platform) {
      case 'elevenlabs':
        const elevenLabsWsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${platformAgentIdSafe}`;
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(elevenLabsWsUrl)}">
      <Parameter name="caller" value="${fromSafe}" />
    </Stream>
  </Connect>
</Response>`;
        break;

      case 'vapi':
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(`wss://api.vapi.ai/ws/${platformAgentIdSafe}`)}">
      <Parameter name="caller" value="${fromSafe}" />
    </Stream>
  </Connect>
</Response>`;
        break;

      case 'retell':
        const retellWsUrl = `wss://api.retellai.com/audio-websocket/${platformAgentIdSafe}`;
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(retellWsUrl)}">
      <Parameter name="caller" value="${fromSafe}" />
    </Stream>
  </Connect>
</Response>`;
        break;


      default:
        console.error('Unsupported platform:', agent.platform);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This agent platform is not supported for phone calls</Say>
</Response>`;
    }

    console.log('Returning TwiML:', twiml);
    return new Response(twiml, { headers: corsHeaders });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred</Say></Response>`,
      { headers: corsHeaders }
    );
  }
});
