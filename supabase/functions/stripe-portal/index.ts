import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("Stripe secret key not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the user from the authorization header
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("Unauthorized");
    }

    const { organizationId, returnUrl } = await req.json();

    if (!organizationId) {
      throw new Error("Missing organization ID");
    }

    // Verify user has access to this organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .single();

    if (!membership) {
      throw new Error("Not authorized for this organization");
    }

    // Get billing config with Stripe customer ID
    const { data: billingConfig, error: billingError } = await supabase
      .from("billing_config")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .single();

    if (billingError || !billingConfig?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this organization");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: billingConfig.stripe_customer_id,
      return_url: returnUrl,
    });

    console.log("Portal session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
