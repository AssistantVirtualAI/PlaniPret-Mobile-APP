import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PLATFORMS = ['elevenlabs', 'vapi', 'retell'] as const;
type ValidPlatform = typeof VALID_PLATFORMS[number];

function isValidUUID(value: unknown): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isValidPlatform(value: unknown): value is ValidPlatform {
  return typeof value === 'string' && VALID_PLATFORMS.includes(value as ValidPlatform);
}

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
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { platform, organizationId } = body;

    // Input validation
    if (!platform) {
      return new Response(
        JSON.stringify({ success: false, error: 'Platform is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidPlatform(platform)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Organization ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(organizationId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid organization ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[connector-test] Testing platform: ${platform}, org: ${organizationId}`);

    // Fetch integration config from database
    const { data: integration, error: integrationError } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('platform', platform)
      .eq('user_id', user.id)
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: `Integration not found for platform: ${platform}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test connection based on platform
    let testResult;
    
    switch (platform) {
      case 'vapi':
        testResult = await testVapiConnection(integration.api_key);
        break;
      case 'retell':
        testResult = await testRetellConnection(integration.api_key);
        break;
      case 'elevenlabs':
        testResult = await testElevenLabsConnection(integration.api_key);
        break;
    }

    // Update integration test status
    await supabase
      .from('organization_integrations')
      .update({
        test_status: testResult.success ? 'success' : 'failed',
        test_error: testResult.error || null,
        last_tested_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return new Response(
      JSON.stringify(testResult),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: testResult.success ? 200 : 400,
      }
    );

  } catch (error: any) {
    console.error('Error testing connection:', error);
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

async function testVapiConnection(apiKey: string) {
  try {
    const response = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Vapi API error (${response.status}): ${errorText}`,
      };
    }

    return {
      success: true,
      capabilities: {
        supportsOutboundCalls: true,
        supportsInboundCalls: true,
        supportsTranscription: true,
        supportsRecording: true,
        supportsSentimentAnalysis: true,
        supportsWebhooks: true,
        supportsTTS: true,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Connection failed: ${error.message}`,
    };
  }
}

async function testRetellConnection(apiKey: string) {
  try {
    const response = await fetch('https://api.retellai.com/v1/agent', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Retell AI API error (${response.status}): ${errorText}`,
      };
    }

    return {
      success: true,
      capabilities: {
        supportsOutboundCalls: true,
        supportsInboundCalls: true,
        supportsTranscription: true,
        supportsRecording: true,
        supportsSentimentAnalysis: true,
        supportsWebhooks: true,
        supportsTTS: true,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Connection failed: ${error.message}`,
    };
  }
}

async function testElevenLabsConnection(apiKey: string) {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `ElevenLabs API error (${response.status}): ${errorText}`,
      };
    }

    return {
      success: true,
      capabilities: {
        supportsOutboundCalls: true,
        supportsInboundCalls: false,
        supportsTranscription: true,
        supportsRecording: true,
        supportsSentimentAnalysis: false,
        supportsWebhooks: true,
        supportsTTS: true,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Connection failed: ${error.message}`,
    };
  }
}
