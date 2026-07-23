import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const { callSid, organizationId } = await req.json();

    if (!callSid || !organizationId) {
      return new Response(JSON.stringify({ error: 'Missing callSid or organizationId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user has access to this organization
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get call record with recording URL
    const { data: call, error: callError } = await supabase
      .from('twilio_active_calls')
      .select('recording_url, recording_sid, organization_id')
      .eq('call_sid', callSid)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (callError || !call) {
      return new Response(JSON.stringify({ error: 'Call not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!call.recording_url) {
      return new Response(JSON.stringify({ error: 'No recording available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Twilio credentials from organization_integrations
    const { data: integration, error: integrationError } = await supabase
      .from('organization_integrations')
      .select('api_key, additional_config')
      .eq('organization_id', organizationId)
      .eq('platform', 'twilio')
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accountSid = integration.additional_config?.account_sid;
    const authToken = integration.api_key;

    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials incomplete' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch recording from Twilio with authentication
    const recordingUrl = call.recording_url;
    const basicAuth = btoa(`${accountSid}:${authToken}`);

    const recordingResponse = await fetch(recordingUrl, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
      },
    });

    if (!recordingResponse.ok) {
      console.error('Failed to fetch recording:', recordingResponse.status, recordingResponse.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch recording' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stream the audio back to the client
    const audioData = await recordingResponse.arrayBuffer();

    return new Response(audioData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error proxying recording:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
