import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgRole, corsHeaders } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, organization_id, period_start, period_end } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authCheck = await requireOrgRole(req, organization_id, ['org_admin', 'manager']);
    if ('error' in authCheck) return authCheck.error;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );


    // Get billing config
    const { data: billingConfig, error: configError } = await supabaseClient
      .from('billing_config')
      .select('*')
      .eq('organization_id', organization_id)
      .single();

    if (configError) throw configError;

    const pricePerAppointment = billingConfig.price_per_appointment || 5;
    const pricePerQualifiedLead = billingConfig.price_per_qualified_lead || 10;
    const pricePerConvertedLead = billingConfig.price_per_converted_lead || 25;

    if (action === 'calculate') {
      // Calculate current period metrics
      const startDate = period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const endDate = period_end || new Date().toISOString();

      // Count appointments
      const { data: appointments, error: appError } = await supabaseClient
        .from('appointments')
        .select('id, status')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (appError) throw appError;

      const appointmentsBooked = appointments?.filter(a => a.status === 'scheduled').length || 0;
      const appointmentsCompleted = appointments?.filter(a => a.status === 'completed').length || 0;

      // Count leads
      const { data: leads, error: leadsError } = await supabaseClient
        .from('leads')
        .select('id, status')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (leadsError) throw leadsError;

      const leadsGenerated = leads?.length || 0;
      const leadsQualified = leads?.filter(l => l.status === 'qualified' || l.status === 'contacted' || l.status === 'converted').length || 0;
      const leadsConverted = leads?.filter(l => l.status === 'converted').length || 0;

      // Count conversations
      const { data: conversations, error: convError } = await supabaseClient
        .from('conversations')
        .select('id, duration')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (convError) throw convError;

      const conversationsCount = conversations?.length || 0;
      const totalDurationMinutes = Math.round(
        (conversations?.reduce((acc, c) => acc + (c.duration || 0), 0) || 0) / 60
      );

      // Calculate billable amount
      const billableAmount = 
        (appointmentsBooked * pricePerAppointment) +
        (leadsQualified * pricePerQualifiedLead) +
        (leadsConverted * pricePerConvertedLead);

      const metrics = {
        organization_id,
        period_start: startDate.split('T')[0],
        period_end: endDate.split('T')[0],
        appointments_booked: appointmentsBooked,
        appointments_completed: appointmentsCompleted,
        leads_generated: leadsGenerated,
        leads_qualified: leadsQualified,
        leads_converted: leadsConverted,
        conversations_count: conversationsCount,
        total_duration_minutes: totalDurationMinutes,
        billable_amount: billableAmount,
        pricing: {
          price_per_appointment: pricePerAppointment,
          price_per_qualified_lead: pricePerQualifiedLead,
          price_per_converted_lead: pricePerConvertedLead
        }
      };

      console.log('Calculated performance metrics:', metrics);

      return new Response(
        JSON.stringify({ success: true, metrics }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'save_period') {
      // Save or update period metrics
      const startDate = period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const endDate = period_end || new Date().toISOString().split('T')[0];

      // First calculate the metrics
      const calcResponse = await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/calculate-performance-billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ action: 'calculate', organization_id, period_start, period_end })
      });

      // Upsert metrics
      const { data: appointments } = await supabaseClient
        .from('appointments')
        .select('id, status')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      const { data: leads } = await supabaseClient
        .from('leads')
        .select('id, status')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      const { data: conversations } = await supabaseClient
        .from('conversations')
        .select('id, duration')
        .eq('organization_id', organization_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      const appointmentsBooked = appointments?.filter(a => a.status === 'scheduled').length || 0;
      const appointmentsCompleted = appointments?.filter(a => a.status === 'completed').length || 0;
      const leadsGenerated = leads?.length || 0;
      const leadsQualified = leads?.filter(l => ['qualified', 'contacted', 'converted'].includes(l.status)).length || 0;
      const leadsConverted = leads?.filter(l => l.status === 'converted').length || 0;
      const conversationsCount = conversations?.length || 0;
      const totalDurationMinutes = Math.round((conversations?.reduce((acc, c) => acc + (c.duration || 0), 0) || 0) / 60);
      
      const billableAmount = 
        (appointmentsBooked * pricePerAppointment) +
        (leadsQualified * pricePerQualifiedLead) +
        (leadsConverted * pricePerConvertedLead);

      const { data: savedMetrics, error: saveError } = await supabaseClient
        .from('performance_metrics')
        .upsert({
          organization_id,
          period_start: startDate,
          period_end: endDate,
          appointments_booked: appointmentsBooked,
          appointments_completed: appointmentsCompleted,
          leads_generated: leadsGenerated,
          leads_qualified: leadsQualified,
          leads_converted: leadsConverted,
          conversations_count: conversationsCount,
          total_duration_minutes: totalDurationMinutes,
          billable_amount: billableAmount
        }, {
          onConflict: 'organization_id,period_start'
        })
        .select()
        .single();

      if (saveError) throw saveError;

      return new Response(
        JSON.stringify({ success: true, metrics: savedMetrics }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_history') {
      // Get historical metrics
      const { data: history, error: historyError } = await supabaseClient
        .from('performance_metrics')
        .select('*')
        .eq('organization_id', organization_id)
        .order('period_start', { ascending: false })
        .limit(12);

      if (historyError) throw historyError;

      return new Response(
        JSON.stringify({ success: true, history }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error('Error in performance billing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
