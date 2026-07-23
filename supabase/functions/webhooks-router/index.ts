import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// Verify HMAC-SHA256 webhook signature
async function verifyWebhookSignature(
  signature: string,
  payload: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const data = encoder.encode(payload);
    const signatureBytes = await crypto.subtle.sign('HMAC', key, data);
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Compare signatures (constant-time comparison to prevent timing attacks)
    const providedSig = signature.toLowerCase().replace('sha256=', '');
    if (providedSig.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < providedSig.length; i++) {
      result |= providedSig.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Get webhook secret for organization and platform
async function getWebhookSecret(
  supabase: any,
  organizationId: string,
  platform: string
): Promise<string | null> {
  // Check webhook_endpoints table for per-organization secrets
  const { data: endpoint } = await supabase
    .from('webhook_endpoints')
    .select('secret')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(1)
    .single();
  
  if (endpoint?.secret) {
    return endpoint.secret;
  }
  
  // Fallback to environment variables per platform
  switch (platform.toLowerCase()) {
    case 'vapi':
      return Deno.env.get('VAPI_WEBHOOK_SECRET') || null;
    case 'retell':
      return Deno.env.get('RETELL_WEBHOOK_SECRET') || null;
    case 'elevenlabs':
      return Deno.env.get('ELEVENLABS_WEBHOOK_SECRET') || null;
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get platform from URL path (e.g., /webhooks-router?platform=vapi)
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const organizationId = url.searchParams.get('organizationId');

    if (!platform || !organizationId) {
      console.error('Missing required parameters: platform, organizationId');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: platform, organizationId' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Webhook received for platform: ${platform}, org: ${organizationId}`);

    // Get raw body for signature verification
    const rawBody = await req.text();
    
    // Extract signature from platform-specific headers
    const signature = req.headers.get('x-vapi-signature') || 
                     req.headers.get('x-retell-signature') ||
                     req.headers.get('x-elevenlabs-signature') ||
                     req.headers.get('x-webhook-signature');

    // Get webhook secret for this organization and platform
    const webhookSecret = await getWebhookSecret(supabase, organizationId, platform);

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      if (!signature) {
        console.error(`Missing webhook signature for platform: ${platform}, org: ${organizationId}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Missing webhook signature' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const isValid = await verifyWebhookSignature(signature, rawBody, webhookSecret);
      if (!isValid) {
        console.error(`Invalid webhook signature for platform: ${platform}, org: ${organizationId}`);
        // Log failed verification attempt for security monitoring
        await supabase
          .from('audit_logs')
          .insert({
            organization_id: organizationId,
            action: 'webhook_signature_invalid',
            resource_type: 'webhook',
            metadata: { platform, signature_present: true }
          });
        
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid webhook signature' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      console.log(`Webhook signature verified for platform: ${platform}`);
    } else {
      // SECURITY: never silently accept unsigned webhooks on a public endpoint.
      console.error(`No webhook secret configured for platform: ${platform}, org: ${organizationId} - rejecting request`);
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook secret not configured for this organization/platform. Configure a secret before sending events.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse webhook payload
    const rawEvent = JSON.parse(rawBody);
    
    // Normalize event based on platform
    const normalizedEvent = normalizeWebhookEvent(platform, rawEvent);

    // Store raw webhook event
    const { error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        organization_id: organizationId,
        connector: platform,
        event_type: normalizedEvent.type,
        payload: rawEvent,
        signature: signature || null,
        processed: false,
      });

    if (insertError) {
      console.error('Failed to store webhook event:', insertError);
    }

    // Update conversation if it's a call event
    if (normalizedEvent.callId) {
      await updateConversationFromWebhook(
        supabase,
        organizationId,
        normalizedEvent.callId,
        normalizedEvent
      );
    }

    console.log(`Webhook processed: ${normalizedEvent.type} for call ${normalizedEvent.callId}`);

    return new Response(
      JSON.stringify({ success: true, eventType: normalizedEvent.type }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Webhook router error:', error);
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

function normalizeWebhookEvent(platform: string, rawEvent: any) {
  let type: string;
  let callId: string;
  let timestamp: string;

  switch (platform) {
    case 'vapi':
      const vapiType = rawEvent.message?.type || rawEvent.type;
      type = vapiType === 'call-started' ? 'call.started' :
             vapiType === 'call-ended' ? 'call.ended' :
             vapiType === 'transcript' ? 'transcript.ready' :
             'conversation.updated';
      callId = rawEvent.call?.id || rawEvent.callId;
      timestamp = rawEvent.timestamp || new Date().toISOString();
      break;

    case 'retell':
      const retellEvent = rawEvent.event;
      type = retellEvent === 'call_started' ? 'call.started' :
             retellEvent === 'call_ended' ? 'call.ended' :
             retellEvent === 'call_failed' ? 'call.failed' :
             retellEvent === 'transcript_ready' ? 'transcript.ready' :
             'conversation.updated';
      callId = rawEvent.call_id;
      timestamp = rawEvent.timestamp || new Date().toISOString();
      break;

    case 'elevenlabs':
      const elevenLabsType = rawEvent.event_type || rawEvent.type;
      type = elevenLabsType === 'conversation.started' ? 'call.started' :
             elevenLabsType === 'conversation.ended' ? 'call.ended' :
             elevenLabsType === 'conversation.failed' ? 'call.failed' :
             elevenLabsType === 'transcript.complete' ? 'transcript.ready' :
             'conversation.updated';
      callId = rawEvent.conversation_id;
      timestamp = rawEvent.timestamp || new Date().toISOString();
      break;

    default:
      type = 'conversation.updated';
      callId = rawEvent.id || rawEvent.callId || rawEvent.conversation_id;
      timestamp = new Date().toISOString();
  }

  return {
    type,
    callId,
    timestamp,
    data: rawEvent,
  };
}

async function updateConversationFromWebhook(
  supabase: any,
  organizationId: string,
  callId: string,
  event: any
) {
  const updates: any = {};

  switch (event.type) {
    case 'call.started':
      updates.status = 'in_progress';
      updates.metadata = { ...event.data };
      break;

    case 'call.ended':
      updates.status = 'completed';
      if (event.data.duration) {
        updates.duration = event.data.duration;
      }
      if (event.data.transcript) {
        updates.transcript = event.data.transcript;
      }
      if (event.data.recording_url || event.data.recordingUrl) {
        updates.audio_url = event.data.recording_url || event.data.recordingUrl;
      }
      break;

    case 'call.failed':
      updates.status = 'failed';
      break;

    case 'transcript.ready':
      if (event.data.transcript) {
        updates.transcript = event.data.transcript;
      }
      break;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('external_id', callId)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Failed to update conversation:', error);
    }
  }
}
