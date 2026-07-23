import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    // Get the calling user from the auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the calling user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callingUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !callingUser) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name, organization_id, role } = await req.json();

    console.log(`Creating member: ${email} for org: ${organization_id} with role: ${role}`);

    // Validate inputs
    if (!email || !password || !organization_id || !role) {
      return new Response(
        JSON.stringify({ error: "Email, mot de passe, organisation et rôle sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent privilege escalation: only explicit roles allowed (never super_admin)
    const ALLOWED_ROLES = ['org_admin', 'manager', 'agent', 'viewer'];
    if (!ALLOWED_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: "Rôle invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Le mot de passe doit contenir au moins 8 caractères" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if calling user is admin of this organization
    const { data: callerRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: callingUser.id });

    if (!isSuperAdmin && callerRole?.role !== 'org_admin') {
      return new Response(
        JSON.stringify({ error: "Vous devez être administrateur pour créer des membres" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Un utilisateur avec cet email existe déjà" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the new user using admin API
    const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: full_name || email.split('@')[0],
      },
    });

    if (createError || !newAuthUser.user) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError?.message || "Erreur lors de la création de l'utilisateur" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newAuthUser.user.id;
    console.log(`Created auth user: ${newUserId}`);

    // The profile should be created automatically by trigger, but let's ensure it exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', newUserId)
      .maybeSingle();

    if (!profile) {
      // Create profile manually if trigger didn't fire
      await supabase.from('profiles').insert({
        id: newUserId,
        email,
        full_name: full_name || null,
      });
    }

    // Add to organization_members
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id,
        user_id: newUserId,
        invited_by: callingUser.id,
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error("Error adding member:", memberError);
      // Rollback: delete the created user
      await supabase.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Erreur lors de l'ajout du membre à l'organisation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        organization_id,
        user_id: newUserId,
        role,
      });

    if (roleError) {
      console.error("Error adding role:", roleError);
      return new Response(
        JSON.stringify({ error: "Erreur lors de l'attribution du rôle" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully created member ${email} with role ${role}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Membre créé avec succès",
        user: {
          id: newUserId,
          email,
          full_name: full_name || null,
          role,
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Une erreur inattendue s'est produite" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
