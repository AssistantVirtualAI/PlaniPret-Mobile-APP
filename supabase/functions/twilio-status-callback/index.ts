import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse URL-encoded form data from Twilio
function parseFormData(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// Normalize phone number to E.164 format
function normalizePhoneNumber(phone: string): string {
  return phone?.replace(/[\s\-\(\)]/g, '') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse Twilio's form-urlencoded body
    const bodyText = await req.text();
    const data = parseFormData(bodyText);

    // Validate Twilio signature to prevent forged webhook calls
    const { validateTwilioSignature } = await import('../_shared/twilio.ts');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const signature = req.headers.get('X-Twilio-Signature') || '';
    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured — rejecting status callback');
      return new Response('Server misconfigured', { status: 500, headers: corsHeaders });
    }
    const isValid = await validateTwilioSignature(twilioAuthToken, signature, req.url, data);
    if (!isValid) {
      console.warn('Invalid Twilio signature for status callback');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    console.log('Twilio Status Callback received:', JSON.stringify(data, null, 2));

    const {
      CallSid,
      CallStatus,
      From,
      To,
      Direction,
      Duration,
      RecordingUrl,
      RecordingSid,
      RecordingStatus,
    } = data;

    if (!CallSid || !CallStatus) {
      console.error('Missing required fields: CallSid or CallStatus');
      return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }

    // Determine which number is "ours" (the Twilio number)
    const twilioNumber = Direction === 'inbound' ? normalizePhoneNumber(To) : normalizePhoneNumber(From);

    // Find the agent assigned to this Twilio number
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, organization_id, name')
      .or(`twilio_number.eq.${twilioNumber},twilio_number.ilike.%${twilioNumber.slice(-10)}%`)
      .maybeSingle();

    if (agentError) {
      console.error('Error finding agent:', agentError);
    }

    const organizationId = agent?.organization_id || null;
    const agentId = agent?.id || null;

    console.log(`Call ${CallSid} status: ${CallStatus}, Agent: ${agent?.name || 'None'}, Org: ${organizationId}`);

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'canceled',
    };

    const normalizedStatus = statusMap[CallStatus] || CallStatus;
    const isTerminal = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(normalizedStatus);

    // Check if call already exists
    const { data: existingCall } = await supabase
      .from('twilio_active_calls')
      .select('id')
      .eq('call_sid', CallSid)
      .maybeSingle();

    if (existingCall) {
      // Update existing call
      const updateData: Record<string, any> = {
        status: normalizedStatus,
        updated_at: new Date().toISOString(),
      };

      if (isTerminal) {
        updateData.ended_at = new Date().toISOString();
        if (Duration) {
          updateData.duration = parseInt(Duration, 10);
        }
      }

      // Handle recording URL (Twilio sends it when recording is ready)
      if (RecordingUrl && RecordingStatus === 'completed') {
        // Add .mp3 extension for direct playback
        updateData.recording_url = RecordingUrl + '.mp3';
        updateData.recording_sid = RecordingSid;
      }

      const { error: updateError } = await supabase
        .from('twilio_active_calls')
        .update(updateData)
        .eq('call_sid', CallSid);

      if (updateError) {
        console.error('Error updating call:', updateError);
      } else {
        console.log(`Updated call ${CallSid} to status ${normalizedStatus}`);
      }
    } else {
      // Insert new call record
      const insertData = {
        call_sid: CallSid,
        organization_id: organizationId,
        agent_id: agentId,
        from_number: From || '',
        to_number: To || '',
        direction: Direction === 'inbound' ? 'inbound' : 'outbound',
        status: normalizedStatus,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ended_at: isTerminal ? new Date().toISOString() : null,
        duration: Duration ? parseInt(Duration, 10) : null,
        recording_url: RecordingUrl && RecordingStatus === 'completed' ? RecordingUrl + '.mp3' : null,
        recording_sid: RecordingSid || null,
      };

      const { error: insertError } = await supabase
        .from('twilio_active_calls')
        .insert(insertData);

      if (insertError) {
        console.error('Error inserting call:', insertError);
      } else {
        console.log(`Inserted new call ${CallSid} with status ${normalizedStatus}`);
      }
    }

    // Return empty TwiML response (Twilio expects XML)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Error processing status callback:', error);
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
  }
});
