import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

async function getCredentials(supabase: any, userId: string, orgId?: string): Promise<TwilioCredentials | null> {
  // Try to get from organization_integrations
  let query = supabase
    .from('organization_integrations')
    .select('api_key, agent_id')
    .eq('platform', 'twilio')
    .eq('user_id', userId);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }

  const { data } = await query.maybeSingle();

  if (data?.api_key && data?.agent_id) {
    // agent_id stores Account SID, api_key stores Auth Token
    return {
      accountSid: data.agent_id,
      authToken: data.api_key,
    };
  }

  // Fallback to environment variables
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

  if (accountSid && authToken) {
    return { accountSid, authToken };
  }

  return null;
}

async function twilioRequest(
  credentials: TwilioCredentials,
  endpoint: string,
  method: string = 'GET',
  body?: Record<string, string>
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}${endpoint}`;
  const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`);

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = new URLSearchParams(body).toString();
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Twilio API error: ${response.status} - ${errorText}`);
    throw new Error(`Twilio API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, organizationId, ...params } = await req.json();
    console.log(`Twilio proxy action: ${action}`, params);

    const credentials = await getCredentials(supabase, user.id, organizationId);
    if (!credentials) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;

    switch (action) {
      // ============ ACCOUNT ============
      case 'get_account': {
        result = await twilioRequest(credentials, '.json');
        break;
      }

      case 'get_usage': {
        const { startDate, endDate, category } = params;
        let endpoint = '/Usage/Records.json?';
        if (startDate) endpoint += `StartDate=${startDate}&`;
        if (endDate) endpoint += `EndDate=${endDate}&`;
        if (category) endpoint += `Category=${category}&`;
        result = await twilioRequest(credentials, endpoint);
        break;
      }

      // ============ PHONE NUMBERS ============
      case 'list_numbers': {
        result = await twilioRequest(credentials, '/IncomingPhoneNumbers.json');
        break;
      }

      case 'get_number': {
        const { phoneSid } = params;
        result = await twilioRequest(credentials, `/IncomingPhoneNumbers/${phoneSid}.json`);
        break;
      }

      case 'search_numbers': {
        const { country = 'US', areaCode, contains, type = 'Local' } = params;
        let endpoint = `/AvailablePhoneNumbers/${country}/${type}.json?`;
        if (areaCode) endpoint += `AreaCode=${areaCode}&`;
        if (contains) endpoint += `Contains=${contains}&`;
        result = await twilioRequest(credentials, endpoint);
        break;
      }

      case 'purchase_number': {
        const { phoneNumber, friendlyName, voiceUrl, smsUrl } = params;
        const body: Record<string, string> = { PhoneNumber: phoneNumber };
        if (friendlyName) body.FriendlyName = friendlyName;
        if (voiceUrl) body.VoiceUrl = voiceUrl;
        if (smsUrl) body.SmsUrl = smsUrl;
        result = await twilioRequest(credentials, '/IncomingPhoneNumbers.json', 'POST', body);
        break;
      }

      case 'update_number': {
        const { 
          phoneSid, 
          friendlyName,
          voiceUrl,
          voiceMethod,
          voiceFallbackUrl,
          voiceFallbackMethod,
          statusCallback,
          statusCallbackMethod,
          smsUrl,
          smsMethod,
          smsFallbackUrl,
          smsFallbackMethod,
          voiceApplicationSid,
          smsApplicationSid
        } = params;
        
        const body: Record<string, string> = {};
        if (friendlyName) body.FriendlyName = friendlyName;
        if (voiceUrl !== undefined) body.VoiceUrl = voiceUrl;
        if (voiceMethod) body.VoiceMethod = voiceMethod;
        if (voiceFallbackUrl !== undefined) body.VoiceFallbackUrl = voiceFallbackUrl;
        if (voiceFallbackMethod) body.VoiceFallbackMethod = voiceFallbackMethod;
        if (statusCallback !== undefined) body.StatusCallback = statusCallback;
        if (statusCallbackMethod) body.StatusCallbackMethod = statusCallbackMethod;
        if (smsUrl !== undefined) body.SmsUrl = smsUrl;
        if (smsMethod) body.SmsMethod = smsMethod;
        if (smsFallbackUrl !== undefined) body.SmsFallbackUrl = smsFallbackUrl;
        if (smsFallbackMethod) body.SmsFallbackMethod = smsFallbackMethod;
        if (voiceApplicationSid !== undefined) body.VoiceApplicationSid = voiceApplicationSid;
        if (smsApplicationSid !== undefined) body.SmsApplicationSid = smsApplicationSid;
        
        result = await twilioRequest(credentials, `/IncomingPhoneNumbers/${phoneSid}.json`, 'POST', body);
        break;
      }

      case 'release_number': {
        const { phoneSid } = params;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/IncomingPhoneNumbers/${phoneSid}.json`;
        const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`);
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Authorization': `Basic ${auth}` }
        });
        if (!response.ok) {
          throw new Error(`Failed to release number: ${response.status}`);
        }
        result = { success: true, message: 'Number released' };
        break;
      }

      // ============ TWIML APPLICATIONS ============
      case 'list_twiml_apps': {
        result = await twilioRequest(credentials, '/Applications.json');
        break;
      }

      case 'get_twiml_app': {
        const { appSid } = params;
        result = await twilioRequest(credentials, `/Applications/${appSid}.json`);
        break;
      }

      case 'create_twiml_app': {
        const {
          friendlyName,
          voiceUrl,
          voiceMethod,
          voiceFallbackUrl,
          voiceFallbackMethod,
          statusCallback,
          statusCallbackMethod,
          smsUrl,
          smsMethod,
          smsFallbackUrl,
          smsFallbackMethod,
          smsStatusCallback
        } = params;
        
        const body: Record<string, string> = {};
        if (friendlyName) body.FriendlyName = friendlyName;
        if (voiceUrl) body.VoiceUrl = voiceUrl;
        if (voiceMethod) body.VoiceMethod = voiceMethod;
        if (voiceFallbackUrl) body.VoiceFallbackUrl = voiceFallbackUrl;
        if (voiceFallbackMethod) body.VoiceFallbackMethod = voiceFallbackMethod;
        if (statusCallback) body.StatusCallback = statusCallback;
        if (statusCallbackMethod) body.StatusCallbackMethod = statusCallbackMethod;
        if (smsUrl) body.SmsUrl = smsUrl;
        if (smsMethod) body.SmsMethod = smsMethod;
        if (smsFallbackUrl) body.SmsFallbackUrl = smsFallbackUrl;
        if (smsFallbackMethod) body.SmsFallbackMethod = smsFallbackMethod;
        if (smsStatusCallback) body.SmsStatusCallback = smsStatusCallback;
        
        result = await twilioRequest(credentials, '/Applications.json', 'POST', body);
        break;
      }

      case 'update_twiml_app': {
        const {
          appSid,
          friendlyName,
          voiceUrl,
          voiceMethod,
          voiceFallbackUrl,
          voiceFallbackMethod,
          statusCallback,
          statusCallbackMethod,
          smsUrl,
          smsMethod,
          smsFallbackUrl,
          smsFallbackMethod,
          smsStatusCallback
        } = params;
        
        const body: Record<string, string> = {};
        if (friendlyName) body.FriendlyName = friendlyName;
        if (voiceUrl !== undefined) body.VoiceUrl = voiceUrl;
        if (voiceMethod) body.VoiceMethod = voiceMethod;
        if (voiceFallbackUrl !== undefined) body.VoiceFallbackUrl = voiceFallbackUrl;
        if (voiceFallbackMethod) body.VoiceFallbackMethod = voiceFallbackMethod;
        if (statusCallback !== undefined) body.StatusCallback = statusCallback;
        if (statusCallbackMethod) body.StatusCallbackMethod = statusCallbackMethod;
        if (smsUrl !== undefined) body.SmsUrl = smsUrl;
        if (smsMethod) body.SmsMethod = smsMethod;
        if (smsFallbackUrl !== undefined) body.SmsFallbackUrl = smsFallbackUrl;
        if (smsFallbackMethod) body.SmsFallbackMethod = smsFallbackMethod;
        if (smsStatusCallback !== undefined) body.SmsStatusCallback = smsStatusCallback;
        
        result = await twilioRequest(credentials, `/Applications/${appSid}.json`, 'POST', body);
        break;
      }

      case 'delete_twiml_app': {
        const { appSid } = params;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Applications/${appSid}.json`;
        const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`);
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Authorization': `Basic ${auth}` }
        });
        if (!response.ok) {
          throw new Error(`Failed to delete TwiML app: ${response.status}`);
        }
        result = { success: true, message: 'TwiML Application deleted' };
        break;
      }

      // ============ CALLS ============
      case 'list_calls': {
        const { startTime, endTime, status, limit = 50 } = params;
        let endpoint = `/Calls.json?PageSize=${limit}`;
        if (startTime) endpoint += `&StartTime>=${startTime}`;
        if (endTime) endpoint += `&EndTime<=${endTime}`;
        if (status) endpoint += `&Status=${status}`;
        result = await twilioRequest(credentials, endpoint);
        break;
      }

      case 'get_call': {
        const { callSid } = params;
        result = await twilioRequest(credentials, `/Calls/${callSid}.json`);
        break;
      }

      // ============ MESSAGES ============
      case 'list_messages': {
        const { dateSent, to, from, limit = 50 } = params;
        let endpoint = `/Messages.json?PageSize=${limit}`;
        if (dateSent) endpoint += `&DateSent=${dateSent}`;
        if (to) endpoint += `&To=${to}`;
        if (from) endpoint += `&From=${from}`;
        result = await twilioRequest(credentials, endpoint);
        break;
      }

      case 'send_message': {
        const { to, from, body: messageBody, mediaUrl } = params;
        const requestBody: Record<string, string> = {
          To: to,
          From: from,
          Body: messageBody
        };
        if (mediaUrl) requestBody.MediaUrl = mediaUrl;
        result = await twilioRequest(credentials, '/Messages.json', 'POST', requestBody);
        break;
      }

      // ============ RECORDINGS ============
      case 'list_recordings': {
        const { callSid, dateCreated, limit = 50 } = params;
        let endpoint = `/Recordings.json?PageSize=${limit}`;
        if (callSid) endpoint += `&CallSid=${callSid}`;
        if (dateCreated) endpoint += `&DateCreated=${dateCreated}`;
        result = await twilioRequest(credentials, endpoint);
        break;
      }

      case 'get_recording': {
        const { recordingSid } = params;
        result = await twilioRequest(credentials, `/Recordings/${recordingSid}.json`);
        break;
      }

      case 'delete_recording': {
        const { recordingSid } = params;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Recordings/${recordingSid}.json`;
        const auth = btoa(`${credentials.accountSid}:${credentials.authToken}`);
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Authorization': `Basic ${auth}` }
        });
        if (!response.ok) {
          throw new Error(`Failed to delete recording: ${response.status}`);
        }
        result = { success: true, message: 'Recording deleted' };
        break;
      }

      // ============ TEST CONNECTION ============
      case 'test_connection': {
        result = await twilioRequest(credentials, '.json');
        result = { 
          success: true, 
          accountName: result.friendly_name,
          accountStatus: result.status
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Twilio proxy error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
