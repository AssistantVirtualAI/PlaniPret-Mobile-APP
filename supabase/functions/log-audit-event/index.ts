import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuditLogRequest {
  organization_id: string;
  action: 'view' | 'create' | 'update' | 'delete' | 'export' | 'login' | 'logout' | 'access';
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
}

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

    const body: AuditLogRequest = await req.json();
    const { organization_id, action, resource_type, resource_id, metadata = {} } = body;

    if (!organization_id || !action || !resource_type) {
      throw new Error('Missing required fields: organization_id, action, resource_type');
    }

    // Check if HIPAA is enabled for this organization
    const { data: org } = await supabaseClient
      .from('organizations')
      .select('hipaa_enabled')
      .eq('id', organization_id)
      .single();

    // Only log if HIPAA is enabled
    if (!org?.hipaa_enabled) {
      return new Response(JSON.stringify({ 
        success: true, 
        logged: false, 
        reason: 'HIPAA not enabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get IP and User Agent from request
    const ip_address = req.headers.get('x-forwarded-for') || 
                       req.headers.get('x-real-ip') || 
                       'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    const { error: insertError } = await supabaseClient
      .from('audit_logs')
      .insert({
        organization_id,
        user_id: user.id,
        action,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        metadata,
      });

    if (insertError) {
      console.error('Failed to insert audit log:', insertError);
      throw new Error('Failed to create audit log');
    }

    console.log(`Audit log created: ${action} on ${resource_type} by ${user.id}`);

    return new Response(JSON.stringify({ success: true, logged: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Audit log error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
