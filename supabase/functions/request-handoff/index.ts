import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  
  // Clean up old entries periodically
  if (rateLimiter.size > 10000) {
    for (const [key, value] of rateLimiter.entries()) {
      if (now > value.resetAt) {
        rateLimiter.delete(key);
      }
    }
  }
  
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (entry.count >= maxRequests) {
    return false;
  }
  
  entry.count++;
  return true;
}

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('cf-connecting-ip') || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

// Input validation
function validateInput(data: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!data.organizationId || typeof data.organizationId !== 'string') {
    return { valid: false, error: 'Organization ID is required' };
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(data.organizationId)) {
    return { valid: false, error: 'Invalid Organization ID format' };
  }
  
  if (data.conversationId && typeof data.conversationId === 'string' && !uuidRegex.test(data.conversationId)) {
    return { valid: false, error: 'Invalid Conversation ID format' };
  }
  
  if (data.agentId && typeof data.agentId === 'string' && !uuidRegex.test(data.agentId)) {
    return { valid: false, error: 'Invalid Agent ID format' };
  }
  
  // Validate text fields length
  if (data.reason && typeof data.reason === 'string' && data.reason.length > 1000) {
    return { valid: false, error: 'Reason text too long (max 1000 characters)' };
  }
  
  if (data.transcriptSnapshot && typeof data.transcriptSnapshot === 'string' && data.transcriptSnapshot.length > 50000) {
    return { valid: false, error: 'Transcript too long (max 50000 characters)' };
  }
  
  // Validate priority
  const validPriorities = ['low', 'normal', 'high', 'urgent'];
  if (data.priority && !validPriorities.includes(data.priority as string)) {
    return { valid: false, error: 'Invalid priority value' };
  }
  
  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: 5 requests per minute per IP
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP, 5, 60000)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData = await req.json();
    
    // Validate input
    const validation = validateInput(requestData);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      organizationId, 
      conversationId, 
      agentId, 
      reason, 
      priority = 'normal',
      customerInfo,
      transcriptSnapshot 
    } = requestData;

    console.log('Creating handoff request:', { organizationId, conversationId, reason, priority });

    // Verify organization exists and is active
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, is_active')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
      console.error('Organization not found:', orgError);
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!org.is_active) {
      return new Response(
        JSON.stringify({ error: 'Organization is not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If agentId provided, verify it belongs to the organization
    if (agentId) {
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id')
        .eq('id', agentId)
        .eq('organization_id', organizationId)
        .single();

      if (agentError || !agent) {
        return new Response(
          JSON.stringify({ error: 'Agent not found in organization' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create handoff request
    const { data: handoff, error: insertError } = await supabase
      .from('handoff_requests')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId || null,
        agent_id: agentId || null,
        reason: reason || null,
        priority,
        customer_info: customerInfo || {},
        transcript_snapshot: transcriptSnapshot || null,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating handoff request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create handoff request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Handoff request created:', handoff.id);

    // Notify available agents
    try {
      await supabase.functions.invoke('notify-handoff', {
        body: {
          handoffId: handoff.id,
          organizationId,
          priority,
        },
      });
      console.log('Handoff notifications sent');
    } catch (notifyError) {
      console.error('Error notifying agents:', notifyError);
      // Don't fail the request, the handoff was created successfully
    }

    console.log('Handoff request completed from IP:', clientIP);

    return new Response(
      JSON.stringify({ 
        success: true, 
        handoffId: handoff.id,
        message: 'Handoff request created successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in request-handoff:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
