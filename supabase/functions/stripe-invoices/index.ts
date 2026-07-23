import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { requireOrgRole, getServiceClient, corsHeaders, jsonResponse } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const { customerId, organizationId } = await req.json();
    if (!customerId || !organizationId) {
      return jsonResponse(400, { error: "customerId and organizationId are required" });
    }

    const authCheck = await requireOrgRole(req, organizationId, ['org_admin', 'manager']);
    if ('error' in authCheck) return authCheck.error;

    // Verify the customerId belongs to that organization's billing config
    const svc = getServiceClient();
    const { data: billing } = await svc
      .from('billing_config')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!billing || billing.stripe_customer_id !== customerId) {
      return jsonResponse(403, { error: "Customer ID does not belong to your organization" });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    console.log(`Fetching invoices for customer: ${customerId}`);

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 20,
    });


    const formattedInvoices = invoices.data.map((invoice: Stripe.Invoice) => ({
      id: invoice.id,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      created: invoice.created,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
    }));

    console.log(`Found ${formattedInvoices.length} invoices`);

    return new Response(
      JSON.stringify({ invoices: formattedInvoices }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});