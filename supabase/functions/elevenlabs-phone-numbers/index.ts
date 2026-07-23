import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { action, agentId, phoneNumberId, phoneConfig, apiKey: providedApiKey, organizationId, pbxGatewayUuid, did, direction } = await req.json();

    console.log(`[elevenlabs-phone-numbers] Action: ${action}`);

    let apiKey = providedApiKey;
    let userId: string | null = null;

    // Resolve API key
    if (!apiKey) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          userId = user.id;
          if (agentId) {
            const { data: agentData } = await supabase
              .from('agents')
              .select('platform_api_key, config')
              .eq('platform_agent_id', agentId)
              .maybeSingle();
            if (agentData?.platform_api_key) apiKey = agentData.platform_api_key;
            else if ((agentData?.config as any)?.api_key) apiKey = (agentData?.config as any).api_key;
          }
          if (!apiKey) {
            const { data: integration } = await supabase
              .from('organization_integrations')
              .select('api_key')
              .eq('user_id', user.id)
              .eq('platform', 'elevenlabs')
              .eq('is_active', true)
              .maybeSingle();
            if (integration?.api_key) apiKey = integration.api_key;
          }
        }
      }
      // Connector-synced workspace key as final fallback
      if (!apiKey) apiKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key required (connect ElevenLabs in Integrations)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'list': {
        console.log('[elevenlabs-phone-numbers] Listing phone numbers');
        
        const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
          headers: { 'xi-api-key': apiKey },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[elevenlabs-phone-numbers] API error:', response.status, errorText);
          throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const data = await response.json();
        
        return new Response(
          JSON.stringify({ phone_numbers: data.phone_numbers || data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create': {
        console.log('[elevenlabs-phone-numbers] Creating phone number');
        
        if (!phoneConfig || !agentId) {
          return new Response(
            JSON.stringify({ error: 'Phone config and agent ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body: any = {
          phone_number: phoneConfig.phone_number,
          agent_id: agentId,
          label: phoneConfig.label,
        };

        if (phoneConfig.phone_number_type === 'twilio' && phoneConfig.twilio_config) {
          body.telephony_provider = {
            type: 'twilio',
            twilio_account_sid: phoneConfig.twilio_config.account_sid,
            twilio_auth_token: phoneConfig.twilio_config.auth_token,
            twilio_phone_number_sid: phoneConfig.twilio_config.phone_number_sid,
          };
        } else if (phoneConfig.phone_number_type === 'sip' && phoneConfig.sip_config) {
          body.telephony_provider = {
            type: 'sip_trunk',
            sip_trunk_uri: phoneConfig.sip_config.sip_trunk_uri,
            sip_trunk_username: phoneConfig.sip_config.username,
            sip_trunk_password: phoneConfig.sip_config.password,
          };
        }

        const response = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[elevenlabs-phone-numbers] Create error:', response.status, errorText);
          throw new Error(`Failed to create phone number: ${errorText}`);
        }

        const data = await response.json();
        
        return new Response(
          JSON.stringify({ success: true, phone_number: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        console.log('[elevenlabs-phone-numbers] Deleting phone number:', phoneNumberId);
        
        if (!phoneNumberId) {
          return new Response(
            JSON.stringify({ error: 'Phone number ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`,
          {
            method: 'DELETE',
            headers: { 'xi-api-key': apiKey },
          }
        );

        if (!response.ok && response.status !== 204) {
          const errorText = await response.text();
          console.error('[elevenlabs-phone-numbers] Delete error:', response.status, errorText);
          throw new Error(`Failed to delete phone number: ${errorText}`);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'assign_agent': {
        console.log('[elevenlabs-phone-numbers] Assigning agent to phone:', phoneNumberId, agentId);
        
        if (!phoneNumberId || !agentId) {
          return new Response(
            JSON.stringify({ error: 'Phone number ID and agent ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/phone-numbers/${phoneNumberId}`,
          {
            method: 'PATCH',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agent_id: agentId }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[elevenlabs-phone-numbers] Assign error:', response.status, errorText);
          throw new Error(`Failed to assign agent: ${errorText}`);
        }

        const data = await response.json();

        // Persist binding override
        if (organizationId) {
          await admin.from('voice_agent_gateway_routes')
            .update({ agent_id: agentId, manual_override: true, auto_bound: false, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId)
            .eq('elevenlabs_phone_id', phoneNumberId);
        }

        return new Response(
          JSON.stringify({ success: true, phone_number: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_sip_trunk_via_pbx': {
        // Provision an ElevenLabs SIP trunk that registers against a FusionPBX gateway,
        // bind it to a voice agent, and persist the route.
        if (!agentId || !pbxGatewayUuid || !did || !organizationId) {
          return new Response(
            JSON.stringify({ error: 'organizationId, agentId, pbxGatewayUuid and did are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: gw, error: gwErr } = await admin
          .from('pbx_gateways')
          .select('pbx_uuid,name,proxy,realm,username,profile,config')
          .eq('pbx_uuid', pbxGatewayUuid)
          .maybeSingle();
        if (gwErr || !gw) {
          return new Response(JSON.stringify({ error: 'Gateway not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const proxy = gw.proxy || gw.realm || '';
        const sipUri = `sip:${proxy};transport=udp`;
        const sipUser = gw.username || (gw.config as any)?.username || '';
        const sipPass = (gw.config as any)?.password || '';

        const body: any = {
          phone_number: did,
          agent_id: agentId,
          label: `${gw.name} → ${did}`,
          telephony_provider: {
            type: 'sip_trunk',
            sip_trunk_uri: sipUri,
            sip_trunk_username: sipUser,
            sip_trunk_password: sipPass,
          },
        };

        const r = await fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const respText = await r.text();
        if (!r.ok) {
          console.error('[elevenlabs-phone-numbers] SIP trunk create failed', r.status, respText);
          return new Response(JSON.stringify({ error: respText }), {
            status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const data = JSON.parse(respText);

        // Persist route. Auto-bind if a phone_number_assignment exists for this DID.
        const { data: existingAssign } = await admin
          .from('pbx_phone_number_assignments')
          .select('agent_id')
          .eq('organization_id', organizationId)
          .eq('e164', did)
          .maybeSingle();

        const finalAgentId = existingAssign?.agent_id || agentId;
        const autoBound = !!existingAssign?.agent_id;

        await admin.from('voice_agent_gateway_routes').upsert({
          organization_id: organizationId,
          agent_id: finalAgentId,
          elevenlabs_phone_id: data?.phone_number_id || data?.id || null,
          pbx_gateway_uuid: pbxGatewayUuid,
          did_e164: did,
          direction: direction || 'both',
          auto_bound: autoBound,
          manual_override: !autoBound,
          metadata: { gateway_name: gw.name },
        }, { onConflict: 'organization_id,did_e164' });

        return new Response(
          JSON.stringify({ success: true, phone_number: data, auto_bound: autoBound }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list_routes': {
        if (!organizationId) {
          return new Response(JSON.stringify({ error: 'organizationId required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data, error } = await admin
          .from('voice_agent_gateway_routes')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ routes: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[elevenlabs-phone-numbers] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
