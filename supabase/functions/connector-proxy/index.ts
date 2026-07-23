import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, platform, organizationId, ...params } = await req.json();

    if (!action || !platform || !organizationId) {
      throw new Error('Missing required parameters: action, platform, organizationId');
    }

    // Verify the caller is a member of the requested organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!membership && !isSuper) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Connector proxy: ${action} for ${platform} in org ${organizationId}`);

    // Fetch integration config
    const { data: integration, error: integrationError } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('platform', platform)
      .single();

    if (integrationError || !integration) {
      throw new Error(`Integration not found for platform: ${platform}`);
    }

    if (!integration.is_active) {
      throw new Error(`Integration for ${platform} is not active`);
    }

    // Route to appropriate handler
    let result;
    
    switch (action) {
      case 'createCall':
        result = await createCall(platform, integration.api_key, params);
        break;
      case 'getCallDetails':
        result = await getCallDetails(platform, integration.api_key, params.callId);
        break;
      case 'listCalls':
        result = await listCalls(platform, integration.api_key, params);
        break;
      case 'getAnalytics':
        result = await getAnalytics(platform, integration.api_key, params.timeframe);
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Connector proxy error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function createCall(platform: string, apiKey: string, params: any) {
  switch (platform) {
    case 'vapi':
      return createVapiCall(apiKey, params);
    case 'retell':
      return createRetellCall(apiKey, params);
    case 'elevenlabs':
      return createElevenLabsCall(apiKey, params);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function createVapiCall(apiKey: string, params: any) {
  const payload: any = {
    phoneNumberId: params.from,
    customer: {
      number: params.to,
    },
  };

  if (params.agentId) payload.assistantId = params.agentId;
  if (params.metadata) payload.metadata = params.metadata;
  if (params.webhookUrl) payload.serverUrl = params.webhookUrl;

  const response = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vapi API error: ${errorText}`);
  }

  return response.json();
}

async function createRetellCall(apiKey: string, params: any) {
  const payload = {
    to_number: params.to,
    from_number: params.from,
    agent_id: params.agentId,
    metadata: params.metadata || {},
  };

  const response = await fetch('https://api.retellai.com/v1/call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Retell AI API error: ${errorText}`);
  }

  return response.json();
}

async function createElevenLabsCall(apiKey: string, params: any) {
  if (!params.agentId) {
    throw new Error('Agent ID is required for ElevenLabs calls');
  }

  const payload = {
    agent_id: params.agentId,
    phone_number: params.to,
    metadata: params.metadata || {},
  };

  const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations/phone', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${errorText}`);
  }

  return response.json();
}

async function getCallDetails(platform: string, apiKey: string, callId: string) {
  let url: string;
  let headers: Record<string, string>;

  switch (platform) {
    case 'vapi':
      url = `https://api.vapi.ai/call/${callId}`;
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      break;
    case 'retell':
      url = `https://api.retellai.com/v1/call/${callId}`;
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      break;
    case 'elevenlabs':
      url = `https://api.elevenlabs.io/v1/convai/conversations/${callId}`;
      headers = {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      };
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${platform} API error: ${errorText}`);
  }

  return response.json();
}

async function listCalls(platform: string, apiKey: string, params: any) {
  const searchParams = new URLSearchParams();
  
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.startDate) searchParams.append('start_date', params.startDate);
  if (params.endDate) searchParams.append('end_date', params.endDate);

  let url: string;
  let headers: Record<string, string>;

  switch (platform) {
    case 'vapi':
      url = `https://api.vapi.ai/call?${searchParams.toString()}`;
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      break;
    case 'retell':
      url = `https://api.retellai.com/v1/call?${searchParams.toString()}`;
      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      break;
    case 'elevenlabs':
      url = `https://api.elevenlabs.io/v1/convai/conversations?${searchParams.toString()}`;
      headers = {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      };
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${platform} API error: ${errorText}`);
  }

  return response.json();
}

async function getAnalytics(platform: string, apiKey: string, timeframe: string) {
  // Calculate date range
  const now = new Date();
  const endDate = now.toISOString();
  
  const startDate = new Date(now);
  switch (timeframe) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
  }

  // Fetch calls and calculate analytics
  const calls = await listCalls(platform, apiKey, {
    startDate: startDate.toISOString(),
    endDate,
    limit: 1000,
  });

  const callsArray = Array.isArray(calls) ? calls : calls.calls || [];
  
  return {
    totalCalls: callsArray.length,
    callsByStatus: callsArray.reduce((acc: any, call: any) => {
      const status = call.status || call.call_status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
  };
}
