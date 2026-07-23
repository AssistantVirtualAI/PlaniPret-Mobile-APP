import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertRequest {
  conversationId: string;
  agentId: string;
  organizationId: string;
  satisfactionScore: number;
  agentName?: string;
  summary?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      conversationId, 
      agentId, 
      organizationId, 
      satisfactionScore,
      agentName,
      summary 
    }: AlertRequest = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Require authenticated org member
    const { requireOrgMember } = await import("../_shared/auth.ts");
    const authCheck = await requireOrgMember(req, organizationId);
    if ('error' in authCheck) return authCheck.error;

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Processing low satisfaction alert for conversation ${conversationId}, score: ${satisfactionScore}`);


    // Vérifier si une alerte a déjà été envoyée pour cette conversation
    const { data: existingAlert } = await serviceClient
      .from('alert_notifications')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('alert_type', 'low_satisfaction')
      .maybeSingle();

    if (existingAlert) {
      console.log('Alert already sent for this conversation');
      return new Response(JSON.stringify({ message: 'Alert already sent' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer les membres de l'organisation pour envoyer les alertes
    const { data: orgMembers, error: membersError } = await serviceClient
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId);

    if (membersError) {
      console.error('Error fetching org members:', membersError);
      throw membersError;
    }

    // Récupérer les emails des membres
    const userIds = orgMembers?.map(m => m.user_id) || [];
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('email, full_name')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    const emails = profiles?.map(p => p.email).filter(Boolean) || [];
    
    if (emails.length === 0) {
      console.log('No email recipients found');
      return new Response(JSON.stringify({ message: 'No recipients' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sending alert to ${emails.length} recipients:`, emails);

    // Récupérer le nom de l'organisation
    const { data: org } = await serviceClient
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const orgName = org?.name || 'Votre organisation';

    // Envoyer l'email
    const emailResponse = await resend.emails.send({
      from: `Alertes ${orgName} <alerts@resend.dev>`,
      to: emails,
      subject: `⚠️ Alerte: Conversation avec faible satisfaction (${satisfactionScore}/10)`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
            .score-badge { display: inline-block; background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 24px; margin: 15px 0; }
            .metric { background: white; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #ef4444; }
            .metric-label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .metric-value { font-size: 18px; font-weight: 600; color: #111827; }
            .summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
            .cta { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">⚠️ Alerte Satisfaction</h1>
              <p style="margin: 10px 0 0; opacity: 0.9;">Une conversation nécessite votre attention</p>
            </div>
            <div class="content">
              <div style="text-align: center;">
                <p style="margin: 0; color: #6b7280;">Score de satisfaction</p>
                <div class="score-badge">${satisfactionScore}/10</div>
              </div>
              
              <div class="metric">
                <div class="metric-label">Agent IA</div>
                <div class="metric-value">${agentName || 'Agent'}</div>
              </div>
              
              <div class="metric">
                <div class="metric-label">ID Conversation</div>
                <div class="metric-value" style="font-size: 14px; font-family: monospace;">${conversationId}</div>
              </div>
              
              ${summary ? `
              <div class="summary">
                <div class="metric-label">Résumé de la conversation</div>
                <p style="margin: 10px 0 0;">${summary}</p>
              </div>
              ` : ''}
              
              <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <p style="margin: 0; color: #92400e;">
                  <strong>💡 Action recommandée:</strong> Examinez cette conversation pour identifier les points d'amélioration et envisagez un suivi avec le client si nécessaire.
                </p>
              </div>
              
              <div class="footer">
                <p>Cet email a été envoyé automatiquement par le système d'alertes.</p>
                <p>${orgName} • Powered by Lovable</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Alert email sent successfully:", emailResponse);

    // Enregistrer l'alerte dans la base de données
    const { error: insertError } = await serviceClient
      .from('alert_notifications')
      .insert({
        organization_id: organizationId,
        agent_id: agentId,
        conversation_id: conversationId,
        alert_type: 'low_satisfaction',
        satisfaction_score: satisfactionScore,
        email_sent_to: emails
      });

    if (insertError) {
      console.error('Error saving alert notification:', insertError);
    }

    // Marquer l'insight comme alerté
    await serviceClient
      .from('agent_insights')
      .update({ alert_sent: true })
      .eq('conversation_id', conversationId);

    return new Response(JSON.stringify({ 
      success: true, 
      emailsSent: emails.length,
      emailResponse 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in send-satisfaction-alert:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
