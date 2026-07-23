import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Map Stripe price IDs to plan tiers
const PRICE_TO_TIER: Record<string, string> = {
  price_starter_monthly: "starter",
  price_growth_monthly: "growth",
  price_ultimate_monthly: "ultimate",
};

const TIER_NAMES: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  ultimate: "Ultimate",
};

async function sendAdminNotification(subject: string, html: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

  if (!resendKey || !adminEmail) {
    console.log("Skipping admin notification: RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set");
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AVA Platform <noreply@assistantvirtualai.com>",
        to: [adminEmail],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send admin notification:", error);
    } else {
      console.log("Admin notification sent:", subject);
    }
  } catch (err) {
    console.error("Error sending admin notification:", err);
  }
}

function buildPaymentEmailHtml(details: {
  event: string;
  customerEmail?: string;
  amount?: number;
  currency?: string;
  planName?: string;
  orgName?: string;
  date: string;
}) {
  const amountStr = details.amount
    ? `$${(details.amount / 100).toFixed(2)} ${(details.currency || "usd").toUpperCase()}`
    : "N/A";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 25px; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 25px; border-radius: 0 0 10px 10px; }
        .field { margin-bottom: 15px; }
        .label { font-weight: bold; color: #059669; margin-bottom: 4px; }
        .value { background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #10b981; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">💰 ${details.event}</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">${details.date}</p>
        </div>
        <div class="content">
          ${details.customerEmail ? `
          <div class="field">
            <div class="label">📧 Customer</div>
            <div class="value">${details.customerEmail}</div>
          </div>` : ""}
          ${details.planName ? `
          <div class="field">
            <div class="label">📋 Plan</div>
            <div class="value">${details.planName}</div>
          </div>` : ""}
          ${details.orgName ? `
          <div class="field">
            <div class="label">🏢 Organization</div>
            <div class="value">${details.orgName}</div>
          </div>` : ""}
          <div class="field">
            <div class="label">💵 Amount</div>
            <div class="value">${amountStr}</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!signature) {
      console.error("Missing Stripe signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    console.log("Processing webhook event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organization_id;

        if (organizationId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const priceId = subscription.items.data[0]?.price.id;
          const tier = PRICE_TO_TIER[priceId] || "starter";

          await supabase
            .from("billing_config")
            .update({
              stripe_subscription_id: subscription.id,
              plan_tier: tier,
              subscription_status: subscription.status,
              subscription_ends_at: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            })
            .eq("organization_id", organizationId);

          // Get org name for notification
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", organizationId)
            .single();

          await sendAdminNotification(
            `🎉 New Subscription: ${TIER_NAMES[tier] || tier} plan`,
            buildPaymentEmailHtml({
              event: "New Subscription Started",
              customerEmail: session.customer_email || undefined,
              amount: session.amount_total || undefined,
              currency: session.currency || undefined,
              planName: TIER_NAMES[tier] || tier,
              orgName: org?.name,
              date: new Date().toLocaleString(),
            })
          );

          console.log(`Updated billing for org ${organizationId} to ${tier}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;

        if (organizationId) {
          const priceId = subscription.items.data[0]?.price.id;
          const tier = PRICE_TO_TIER[priceId] || "free";

          await supabase
            .from("billing_config")
            .update({
              plan_tier: tier,
              subscription_status: subscription.status,
              subscription_ends_at: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            })
            .eq("organization_id", organizationId);

          console.log(`Subscription updated for org ${organizationId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;

        if (organizationId) {
          await supabase
            .from("billing_config")
            .update({
              plan_tier: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("organization_id", organizationId);

          console.log(`Subscription canceled for org ${organizationId}`);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            invoice.subscription as string
          );
          const organizationId = subscription.metadata?.organization_id;

          if (organizationId) {
            await supabase
              .from("billing_config")
              .update({
                subscription_ends_at: new Date(
                  subscription.current_period_end * 1000
                ).toISOString(),
              })
              .eq("organization_id", organizationId);

            // Get org name for notification
            const { data: org } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", organizationId)
              .single();

            const priceId = subscription.items.data[0]?.price.id;
            const tier = PRICE_TO_TIER[priceId] || "unknown";

            await sendAdminNotification(
              `💰 Payment Received: $${((invoice.amount_paid || 0) / 100).toFixed(2)}`,
              buildPaymentEmailHtml({
                event: "Invoice Paid",
                customerEmail: invoice.customer_email || undefined,
                amount: invoice.amount_paid || undefined,
                currency: invoice.currency || undefined,
                planName: TIER_NAMES[tier] || tier,
                orgName: org?.name,
                date: new Date().toLocaleString(),
              })
            );
          }
        }

        console.log(`Invoice paid for customer ${customerId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: config } = await supabase
          .from("billing_config")
          .select("organization_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (config) {
          await supabase
            .from("billing_config")
            .update({ subscription_status: "past_due" })
            .eq("organization_id", config.organization_id);
        }

        await sendAdminNotification(
          `⚠️ Payment Failed for customer ${customerId}`,
          buildPaymentEmailHtml({
            event: "Payment Failed",
            customerEmail: invoice.customer_email || undefined,
            amount: invoice.amount_due || undefined,
            currency: invoice.currency || undefined,
            date: new Date().toLocaleString(),
          })
        );

        console.log(`Invoice payment failed for customer ${customerId}`);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
