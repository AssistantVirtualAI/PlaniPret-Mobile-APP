import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Profile {
  email: string;
  full_name: string | null;
}

interface MemberWithProfile {
  user_id: string;
  profiles: Profile | Profile[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { handoffId, organizationId, customerInfo, reason } = await req.json();

    if (!handoffId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "handoffId and organizationId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Require authenticated org member
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!membership && !isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get organization details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, email_sender, email_sender_name")
      .eq("id", organizationId)
      .single();

    // Get all agents/managers in the organization who can handle handoffs
    const { data: members } = await supabase
      .from("organization_members")
      .select(`
        user_id,
        profiles:user_id (email, full_name)
      `)
      .eq("organization_id", organizationId);

    // Get user roles to filter agents and managers
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .in("role", ["agent", "manager", "org_admin"]);

    const agentUserIds = roles?.map(r => r.user_id) || [];
    
    // Filter members who are agents/managers
    const agentMembers = (members as MemberWithProfile[] | null)?.filter(m => 
      agentUserIds.includes(m.user_id)
    ) || [];

    console.log(`Notifying ${agentMembers.length} agents about handoff request`);

    // Send email notifications to each agent
    const emailPromises = agentMembers.map(async (member) => {
      const profileData = member.profiles;
      const profile: Profile | null = Array.isArray(profileData) ? profileData[0] : profileData;
      
      if (!profile?.email) return;

      const customerName = customerInfo?.name || "Client";
      const subject = `🚨 Nouvelle demande de transfert - ${customerName}`;
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #8B5CF6, #06b6d4); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
            .info-row { display: flex; margin: 10px 0; }
            .info-label { font-weight: bold; width: 120px; }
            .button { display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Demande de Transfert</h1>
            </div>
            <div class="content">
              <div class="alert-box">
                <strong>Un client demande à parler à un agent humain</strong>
              </div>
              
              <h3>Informations du client</h3>
              <div class="info-row">
                <span class="info-label">Nom:</span>
                <span>${customerInfo?.name || "Non renseigné"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Email:</span>
                <span>${customerInfo?.email || "Non renseigné"}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Téléphone:</span>
                <span>${customerInfo?.phone || "Non renseigné"}</span>
              </div>
              
              <h3>Raison du transfert</h3>
              <p>${reason || "Le client a demandé à parler à un humain"}</p>
              
              <p>Connectez-vous à votre tableau de bord pour prendre en charge cette demande.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Log the notification (in production, integrate with email service like Resend)
      console.log(`Would send email to: ${profile.email}`);
      console.log(`Subject: ${subject}`);
      
      // Store notification in audit log
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        user_id: member.user_id,
        action: "handoff_notification_sent",
        resource_type: "handoff_request",
        resource_id: handoffId,
        metadata: {
          email: profile.email,
          customer_name: customerName,
          reason,
        },
      });
    });

    await Promise.all(emailPromises);

    // Also broadcast via Realtime for push notifications
    const channel = supabase.channel(`handoff-notifications-${organizationId}`);
    await channel.send({
      type: "broadcast",
      event: "new_handoff",
      payload: {
        handoffId,
        customerInfo,
        reason,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        notified: agentMembers.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error("Unknown error");
    console.error("Error sending handoff notifications:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
