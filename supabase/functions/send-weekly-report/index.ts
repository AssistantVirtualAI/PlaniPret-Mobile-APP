import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { organizationId } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Always require authentication. Allow service-role bearer for scheduled invocations.
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userId = userData.user.id;
      const { data: isSuper } = await supabaseAdmin.rpc('is_super_admin', { _user_id: userId });
      if (organizationId) {
        const { data: membership } = await supabaseAdmin
          .from('organization_members')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!membership && !isSuper) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (!isSuper) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    // Get organizations to process
    let organizations;
    if (organizationId) {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('id, name, email_sender')
        .eq('id', organizationId);
      organizations = data;
    } else {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('id, name, email_sender')
        .eq('is_active', true);
      organizations = data;
    }

    const reports: any[] = [];

    for (const org of organizations || []) {
      console.log(`Processing organization: ${org.name}`);

      // Get all agents for this organization
      const { data: agents } = await supabaseAdmin
        .from('agents')
        .select('id, name, platform, platform_agent_id, platform_api_key')
        .eq('organization_id', org.id);

      if (!agents || agents.length === 0) {
        console.log(`No agents found for ${org.name}`);
        continue;
      }

      // Get conversations from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: conversations } = await supabaseAdmin
        .from('conversations')
        .select('id, agent_id, sentiment, satisfaction_score, duration, created_at')
        .eq('organization_id', org.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      // Calculate metrics
      const totalConversations = conversations?.length || 0;
      const avgSatisfaction = conversations && conversations.length > 0
        ? conversations.filter(c => c.satisfaction_score).reduce((sum, c) => sum + Number(c.satisfaction_score), 0) /
          conversations.filter(c => c.satisfaction_score).length || 0
        : 0;
      const avgDuration = conversations && conversations.length > 0
        ? conversations.filter(c => c.duration).reduce((sum, c) => sum + (c.duration || 0), 0) /
          conversations.filter(c => c.duration).length || 0
        : 0;

      // Sentiment distribution
      let positiveCount = 0, neutralCount = 0, negativeCount = 0;
      conversations?.forEach(c => {
        const s = (c.sentiment || '').toLowerCase();
        if (s.includes('positif') || s === 'positive') positiveCount++;
        else if (s.includes('négatif') || s === 'negative') negativeCount++;
        else neutralCount++;
      });

      // Per-agent stats
      const agentStats = agents.map(agent => {
        const agentConvs = conversations?.filter(c => c.agent_id === agent.id) || [];
        const agentSatisfaction = agentConvs.length > 0
          ? agentConvs.filter(c => c.satisfaction_score).reduce((sum, c) => sum + Number(c.satisfaction_score), 0) /
            agentConvs.filter(c => c.satisfaction_score).length || 0
          : 0;
        return {
          name: agent.name,
          conversations: agentConvs.length,
          satisfaction: agentSatisfaction.toFixed(1),
        };
      }).sort((a, b) => b.conversations - a.conversations);

      const bestAgent = agentStats[0];
      const worstAgent = agentStats.length > 1 
        ? agentStats.reduce((min, a) => parseFloat(a.satisfaction) < parseFloat(min.satisfaction) ? a : min)
        : null;

      // Get org admins
      const { data: members } = await supabaseAdmin
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', org.id);

      const { data: admins } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', org.id)
        .in('role', ['org_admin', 'super_admin']);

      const adminUserIds = admins?.map(a => a.user_id) || [];

      // Get admin emails from profiles
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .in('id', adminUserIds);

      const adminEmails = profiles?.map(p => p.email).filter(Boolean) || [];

      if (adminEmails.length === 0) {
        console.log(`No admin emails found for ${org.name}`);
        continue;
      }

      // Generate HTML email
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport Hebdomadaire - ${org.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .content { padding: 32px; }
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
    .metric { background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #1e293b; }
    .metric-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .section { margin-top: 24px; }
    .section h2 { font-size: 16px; color: #1e293b; margin: 0 0 12px; }
    .agent-row { display: flex; justify-content: space-between; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px; }
    .agent-name { font-weight: 500; }
    .agent-stats { color: #64748b; font-size: 14px; }
    .sentiment { display: flex; gap: 8px; margin-top: 8px; }
    .sentiment-bar { height: 8px; border-radius: 4px; }
    .positive { background: #22c55e; }
    .neutral { background: #f59e0b; }
    .negative { background: #ef4444; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; }
    .highlight { background: linear-gradient(135deg, #dcfce7, #d1fae5); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .highlight-title { font-weight: 600; color: #166534; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Rapport Hebdomadaire</h1>
      <p>${org.name} • Semaine du ${new Date(sevenDaysAgo).toLocaleDateString('fr-FR')} au ${new Date().toLocaleDateString('fr-FR')}</p>
    </div>
    
    <div class="content">
      <div class="metrics">
        <div class="metric">
          <div class="metric-value">${totalConversations}</div>
          <div class="metric-label">Conversations</div>
        </div>
        <div class="metric">
          <div class="metric-value">${avgSatisfaction.toFixed(1)}/10</div>
          <div class="metric-label">Satisfaction</div>
        </div>
        <div class="metric">
          <div class="metric-value">${Math.round(avgDuration / 60)}min</div>
          <div class="metric-label">Durée moyenne</div>
        </div>
        <div class="metric">
          <div class="metric-value">${agents.length}</div>
          <div class="metric-label">Agents actifs</div>
        </div>
      </div>

      ${bestAgent ? `
      <div class="highlight">
        <div class="highlight-title">🏆 Meilleur Agent: ${bestAgent.name}</div>
        <p style="margin: 8px 0 0; color: #166534;">${bestAgent.conversations} conversations • ${bestAgent.satisfaction}/10 satisfaction</p>
      </div>
      ` : ''}

      <div class="section">
        <h2>Distribution des Sentiments</h2>
        <div class="sentiment">
          <div class="sentiment-bar positive" style="flex: ${positiveCount || 1}"></div>
          <div class="sentiment-bar neutral" style="flex: ${neutralCount || 1}"></div>
          <div class="sentiment-bar negative" style="flex: ${negativeCount || 1}"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-top: 8px;">
          <span>😊 ${positiveCount} positif</span>
          <span>😐 ${neutralCount} neutre</span>
          <span>😞 ${negativeCount} négatif</span>
        </div>
      </div>

      <div class="section">
        <h2>Performance par Agent</h2>
        ${agentStats.slice(0, 5).map(a => `
        <div class="agent-row">
          <span class="agent-name">${a.name}</span>
          <span class="agent-stats">${a.conversations} conv. • ${a.satisfaction}/10</span>
        </div>
        `).join('')}
      </div>

      ${worstAgent && parseFloat(worstAgent.satisfaction) < 6 ? `
      <div class="section" style="background: #fef2f2; border-radius: 8px; padding: 16px;">
        <h2 style="color: #991b1b;">⚠️ Agent à améliorer: ${worstAgent.name}</h2>
        <p style="color: #991b1b; margin: 8px 0 0; font-size: 14px;">
          Satisfaction de ${worstAgent.satisfaction}/10 - Considérez une révision du prompt ou de la base de connaissances.
        </p>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>Ce rapport a été généré automatiquement.</p>
      <p>© ${new Date().getFullYear()} ${org.name}</p>
    </div>
  </div>
</body>
</html>
      `;

      // Send email if Resend is configured
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          
          for (const email of adminEmails) {
            const { error: emailError } = await resend.emails.send({
              from: org.email_sender || 'Rapport <onboarding@resend.dev>',
              to: [email],
              subject: `📊 Rapport Hebdomadaire - ${org.name} - Semaine du ${new Date().toLocaleDateString('fr-FR')}`,
              html: emailHtml,
            });

            if (emailError) {
              console.error(`Failed to send email to ${email}:`, emailError);
            } else {
              console.log(`Email sent to ${email}`);
            }
          }
        } catch (emailErr) {
          console.error('Email sending error:', emailErr);
        }
      } else {
        console.log('RESEND_API_KEY not configured, skipping email');
      }

      reports.push({
        organization: org.name,
        metrics: {
          totalConversations,
          avgSatisfaction: avgSatisfaction.toFixed(1),
          avgDuration: Math.round(avgDuration),
          agents: agents.length,
          sentiment: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
        },
        agentStats,
        emailsSent: adminEmails.length,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        reportsGenerated: reports.length,
        reports,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Weekly report error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
