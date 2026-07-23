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
    const { campaign_id, action } = await req.json();
    
    console.log(`Campaign ${action} for:`, campaign_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get campaign details
    const { data: campaign, error: fetchError } = await supabase
      .from('outbound_campaigns')
      .select(`
        *,
        agents (
          id,
          name,
          platform,
          platform_api_key,
          platform_agent_id
        )
      `)
      .eq('id', campaign_id)
      .single();

    if (fetchError || !campaign) {
      throw new Error('Campaign not found');
    }

    // Verify manager+ for campaign org
    const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuper) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', campaign.organization_id)
        .maybeSingle();
      if (!roleRow || !['org_admin', 'manager'].includes(roleRow.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Campaign:', campaign.name, 'Status:', campaign.status);

    // Handle different actions
    switch (action) {
      case 'start': {
        if (campaign.status === 'running') {
          return new Response(JSON.stringify({ error: 'Campaign already running' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const phoneNumbers = campaign.phone_numbers as string[];
        if (!phoneNumbers || phoneNumbers.length === 0) {
          return new Response(JSON.stringify({ error: 'No phone numbers in campaign' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create call records for each phone number
        const callRecords = phoneNumbers.map((phone: string) => ({
          campaign_id: campaign.id,
          phone_number: phone,
          status: 'pending'
        }));

        const { error: insertError } = await supabase
          .from('campaign_calls')
          .insert(callRecords);

        if (insertError) {
          console.error('Failed to create call records:', insertError);
          throw insertError;
        }

        // Update campaign status
        const { error: updateError } = await supabase
          .from('outbound_campaigns')
          .update({
            status: 'running',
            started_at: new Date().toISOString(),
            total_calls: phoneNumbers.length,
            completed_calls: 0,
            successful_calls: 0,
            failed_calls: 0
          })
          .eq('id', campaign_id);

        if (updateError) throw updateError;

        // In a real implementation, you would:
        // 1. Queue calls with a job processor
        // 2. Integrate with ElevenLabs/Vapi/Retell API for outbound calls
        // 3. Handle call results via webhooks
        
        // For now, we simulate starting the campaign
        console.log(`Campaign started with ${phoneNumbers.length} calls queued`);

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Campaign started with ${phoneNumbers.length} calls`,
          campaign_id,
          total_calls: phoneNumbers.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'pause': {
        const { error: updateError } = await supabase
          .from('outbound_campaigns')
          .update({ status: 'paused' })
          .eq('id', campaign_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Campaign paused' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resume': {
        const { error: updateError } = await supabase
          .from('outbound_campaigns')
          .update({ status: 'running' })
          .eq('id', campaign_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Campaign resumed' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'cancel': {
        // Cancel all pending calls
        await supabase
          .from('campaign_calls')
          .update({ status: 'failed' })
          .eq('campaign_id', campaign_id)
          .eq('status', 'pending');

        const { error: updateError } = await supabase
          .from('outbound_campaigns')
          .update({ 
            status: 'cancelled',
            completed_at: new Date().toISOString()
          })
          .eq('id', campaign_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Campaign cancelled' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'complete': {
        const { error: updateError } = await supabase
          .from('outbound_campaigns')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', campaign_id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Campaign marked as completed' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('start-outbound-campaign error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
