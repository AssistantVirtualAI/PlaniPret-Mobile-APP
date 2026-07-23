import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgRole, jsonResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');


async function twilioRequest(endpoint: string, method: string = 'GET', body?: Record<string, string>) {
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}${endpoint}`,
    options
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Twilio API error:', error);
    throw new Error(`Twilio API error: ${response.status}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }

    const { action, country, areaCode, phoneNumber, phoneNumberSid, organizationId } = await req.json();
    console.log('Twilio action:', action);

    if (!organizationId) {
      return jsonResponse(400, { error: 'organizationId required' });
    }
    const authCheck = await requireOrgRole(req, organizationId, ['org_admin', 'manager']);
    if ('error' in authCheck) return authCheck.error;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);


    switch (action) {
      case 'search': {
        let endpoint = `/AvailablePhoneNumbers/${country}/Local.json?PageSize=10`;
        if (areaCode) {
          endpoint += `&AreaCode=${areaCode}`;
        }

        const data = await twilioRequest(endpoint);
        
        const numbers = (data.available_phone_numbers || []).map((num: {
          phone_number: string;
          capabilities: { voice: boolean; sms: boolean };
        }) => ({
          phoneNumber: num.phone_number,
          capabilities: num.capabilities,
          monthlyPrice: 1.15
        }));

        return new Response(JSON.stringify({ numbers }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'purchase': {
        const data = await twilioRequest('/IncomingPhoneNumbers.json', 'POST', {
          PhoneNumber: phoneNumber
        });

        const { error } = await supabase
          .from('phone_numbers')
          .insert([{
            organization_id: organizationId,
            phone_number: data.phone_number,
            provider: 'twilio',
            provider_sid: data.sid,
            friendly_name: data.friendly_name,
            capabilities: data.capabilities,
            status: 'active',
            monthly_cost: 1.15
          }]);

        if (error) {
          console.error('Database error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ success: true, phoneNumber: data.phone_number }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'release': {
        // Ensure the SID belongs to this organization before releasing
        const { data: own } = await supabase
          .from('phone_numbers')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('provider_sid', phoneNumberSid)
          .maybeSingle();
        if (!own) return jsonResponse(403, { error: 'Phone number not owned by your organization' });

        await twilioRequest(`/IncomingPhoneNumbers/${phoneNumberSid}.json`, 'DELETE');
        await supabase.from('phone_numbers').delete().eq('id', own.id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }


      case 'list': {
        const data = await twilioRequest('/IncomingPhoneNumbers.json');

        return new Response(JSON.stringify({ numbers: data.incoming_phone_numbers }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
