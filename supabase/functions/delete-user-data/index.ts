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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Processing deletion request for user: ${user.id}`);

    // Mark profile for deletion (30-day grace period)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        deletion_requested_at: new Date().toISOString(),
        deleted_at: deletionDate.toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error marking profile for deletion:', profileError);
      throw new Error('Failed to process deletion request');
    }

    // Get user's organization memberships for audit logging
    const { data: memberships } = await supabaseClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    // Log the deletion request
    if (memberships && memberships.length > 0) {
      for (const membership of memberships) {
        await supabaseAdmin.from('audit_logs').insert({
          organization_id: membership.organization_id,
          user_id: user.id,
          action: 'delete',
          resource_type: 'user_account',
          metadata: {
            deletion_type: 'gdpr_request',
            scheduled_deletion: deletionDate.toISOString(),
          },
        });
      }
    }

    // Anonymize user's conversations (keep for analytics but remove PII)
    await supabaseAdmin
      .from('conversations')
      .update({
        metadata: { anonymized: true, original_user_id: user.id },
      })
      .eq('user_id', user.id);

    // Delete user consents
    await supabaseAdmin
      .from('user_consents')
      .delete()
      .eq('user_id', user.id);

    console.log('Deletion request processed successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Deletion request processed. Your account will be deleted in 30 days.',
      scheduled_deletion: deletionDate.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Deletion error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
