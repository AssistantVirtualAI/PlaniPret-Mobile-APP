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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Exporting data for user: ${user.id}`);

    // Fetch profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Fetch user's organizations
    const { data: memberships } = await supabaseClient
      .from('organization_members')
      .select('organization_id, invited_at, accepted_at')
      .eq('user_id', user.id);

    // Fetch user roles
    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('organization_id, role, created_at')
      .eq('user_id', user.id);

    // Fetch conversations (limited to user's data)
    const { data: conversations } = await supabaseClient
      .from('conversations')
      .select('id, title, platform, status, duration, sentiment, created_at')
      .eq('user_id', user.id)
      .limit(1000);

    // Fetch consents
    const { data: consents } = await supabaseClient
      .from('user_consents')
      .select('consent_type, consented, created_at, updated_at')
      .eq('user_id', user.id);

    const exportData = {
      export_date: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      profile: profile ? {
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        locale: profile.locale,
        created_at: profile.created_at,
      } : null,
      organizations: memberships || [],
      roles: roles || [],
      conversations: conversations?.map(c => ({
        id: c.id,
        title: c.title,
        platform: c.platform,
        status: c.status,
        duration: c.duration,
        sentiment: c.sentiment,
        created_at: c.created_at,
      })) || [],
      consents: consents || [],
    };

    // Log the export action
    if (memberships && memberships.length > 0) {
      await supabaseClient.from('audit_logs').insert({
        organization_id: memberships[0].organization_id,
        user_id: user.id,
        action: 'export',
        resource_type: 'user_data',
        metadata: { export_type: 'gdpr_request' },
      });
    }

    console.log('Data export completed successfully');

    return new Response(JSON.stringify(exportData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Export error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
