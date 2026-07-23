import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price mapping - maps plan tier names to Stripe price IDs
// Users need to create these products/prices in their Stripe dashboard
// For now, we'll create them dynamically if they don't exist
const PLAN_PRICES: Record<string, { monthly: number; annual: number; name: string }> = {
  starter: { monthly: 4900, annual: 47000, name: "Starter Plan" },
  growth: { monthly: 9900, annual: 95000, name: "Growth Plan" },
  ultimate: { monthly: 29900, annual: 287000, name: "Ultimate Plan" },
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

    const body = await req.json();
    const { organizationId, successUrl, cancelUrl } = body;
    let { priceId, isAnnual } = body;

    if (!organizationId || !priceId) {
      throw new Error("Missing required parameters");
    }

    // Accept either plain tier ("growth") or formatted "price_<tier>_<monthly|annual>"
    const match = String(priceId).match(/^price_([a-z]+)_(monthly|annual)$/i);
    if (match) {
      priceId = match[1].toLowerCase();
      isAnnual = match[2].toLowerCase() === "annual";
    }

    // Validate plan exists
    const planConfig = PLAN_PRICES[priceId];
    if (!planConfig) {
      throw new Error(`Invalid plan: ${priceId}. Valid plans: ${Object.keys(PLAN_PRICES).join(', ')}`);
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Get or create billing config
    let { data: billingConfig } = await supabase
      .from("billing_config")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    let stripeCustomerId = billingConfig?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email,
        metadata: {
          organization_id: organizationId,
          user_id: userData.user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Update or create billing config with customer ID
      if (billingConfig) {
        await supabase
          .from("billing_config")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("organization_id", organizationId);
      } else {
        await supabase
          .from("billing_config")
          .insert({
            organization_id: organizationId,
            stripe_customer_id: stripeCustomerId,
            plan_tier: "free",
          });
      }
    }

    // Get or create the price for this plan
    const priceAmount = isAnnual ? planConfig.annual : planConfig.monthly;
    const interval = isAnnual ? "year" : "month";
    const priceLookupKey = `${priceId}_${interval}ly`;

    // Try to find existing price by lookup key
    let stripePriceId: string;
    const existingPrices = await stripe.prices.list({
      lookup_keys: [priceLookupKey],
      limit: 1,
    });

    if (existingPrices.data.length > 0) {
      stripePriceId = existingPrices.data[0].id;
    } else {
      // Create product and price if they don't exist
      let product;
      const existingProducts = await stripe.products.list({
        limit: 100,
      });
      product = existingProducts.data.find((p: Stripe.Product) => p.metadata?.plan_tier === priceId);

      if (!product) {
        product = await stripe.products.create({
          name: planConfig.name,
          metadata: { plan_tier: priceId },
        });
      }

      const newPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: priceAmount,
        currency: "usd",
        recurring: { interval },
        lookup_key: priceLookupKey,
        metadata: { plan_tier: priceId },
      });
      stripePriceId = newPrice.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organization_id: organizationId,
        plan_tier: priceId,
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan_tier: priceId,
        },
      },
    });

    console.log("Checkout session created:", session.id, "for plan:", priceId);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
