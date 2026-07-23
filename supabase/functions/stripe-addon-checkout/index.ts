import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Add-on price IDs - replace with your actual Stripe price IDs
const ADDON_PRICES: Record<string, { priceId: string; name: string; availableFor: string[] }> = {
  hipaa: {
    priceId: "price_hipaa_addon",
    name: "HIPAA Compliance",
    availableFor: ["starter", "growth", "ultimate"],
  },
  saas_configurator: {
    priceId: "price_saas_addon",
    name: "SaaS Configurator",
    availableFor: ["growth"],
  },
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

    const { organizationId, addonId, successUrl, cancelUrl } = await req.json();

    if (!organizationId || !addonId) {
      throw new Error("Missing required parameters");
    }

    // Validate addon exists
    const addon = ADDON_PRICES[addonId];
    if (!addon) {
      throw new Error("Invalid addon");
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

    // Get billing config to check current plan
    const { data: billingConfig } = await supabase
      .from("billing_config")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    if (!billingConfig) {
      throw new Error("No billing configuration found");
    }

    // Check if addon is available for current plan
    if (!addon.availableFor.includes(billingConfig.plan_tier)) {
      throw new Error(`${addon.name} is not available for your current plan (${billingConfig.plan_tier})`);
    }

    // Check if already has Stripe customer
    if (!billingConfig.stripe_customer_id) {
      throw new Error("Please subscribe to a plan first before purchasing add-ons");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Create checkout session for add-on
    const session = await stripe.checkout.sessions.create({
      customer: billingConfig.stripe_customer_id,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: addon.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organization_id: organizationId,
        addon_id: addonId,
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          addon_id: addonId,
          is_addon: "true",
        },
      },
    });

    console.log("Add-on checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating add-on checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});