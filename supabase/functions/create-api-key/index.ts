import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { name, scopes, expiresAt, organizationId } = await req.json();

    if (!name || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Name and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this organization
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: "Not a member of this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only org_admin / super_admin can create API keys
    const { data: isSuper } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuper) {
      const { data: roleRow } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (!roleRow || roleRow.role !== 'org_admin') {
        return new Response(
          JSON.stringify({ error: "Only organization admins can create API keys" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate secure API key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const generatedKey = "sk_" + Array.from(keyBytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    
    const keyPrefix = generatedKey.substring(0, 12);

    // Hash the key with bcrypt (cost factor 12 for good security)
    const salt = bcrypt.genSaltSync(12);
    const keyHash = bcrypt.hashSync(generatedKey, salt);

    // Insert into database
    const { data: keyData, error: insertError } = await supabaseAdmin
      .from("organization_api_keys")
      .insert({
        organization_id: organizationId,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: scopes || [],
        created_by: user.id,
        expires_at: expiresAt || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating API key:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create API key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the plain key (only time it's visible) and the key data
    return new Response(
      JSON.stringify({ 
        key: generatedKey, 
        keyData: {
          id: keyData.id,
          name: keyData.name,
          key_prefix: keyData.key_prefix,
          scopes: keyData.scopes,
          is_active: keyData.is_active,
          last_used_at: keyData.last_used_at,
          created_at: keyData.created_at,
          expires_at: keyData.expires_at,
          created_by: keyData.created_by,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-api-key:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
