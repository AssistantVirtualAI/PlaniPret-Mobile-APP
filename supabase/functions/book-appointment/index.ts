import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests: number = 3, windowMs: number = 60000): boolean {
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
function validateUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validatePhone(phone: string): boolean {
  // Allow international phone formats
  const phoneRegex = /^\+?[0-9\s\-()]{6,20}$/;
  return phoneRegex.test(phone);
}

function sanitizeString(str: string, maxLength: number = 500): string {
  return str.slice(0, maxLength).trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: 3 requests per minute per IP (stricter for booking)
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP, 3, 60000)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      action,
      organizationId,
      agentId,
      clientId,
      conversationId,
      title,
      description,
      startTime,
      endTime,
      attendeeName,
      attendeeEmail,
      attendeePhone,
      appointmentId
    } = await req.json();

    console.log(`Book appointment action: ${action}`, { organizationId, agentId });

    // Validate action
    const validActions = ['check-availability', 'create', 'cancel', 'list'];
    if (!action || !validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate organization ID for all actions
    if (!validateUUID(organizationId)) {
      return new Response(
        JSON.stringify({ error: 'Valid Organization ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify organization exists and is active
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, is_active')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
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

    // Get calendar integration
    const { data: integration, error: integrationError } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle();

    if (action === 'check-availability') {
      if (!integration) {
        return new Response(
          JSON.stringify({ available: true, slots: [], noCalendar: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate dates
      if (!startTime || !endTime) {
        return new Response(
          JSON.stringify({ error: 'Start and end times are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if token needs refresh
      let accessToken = integration.access_token;
      if (new Date(integration.token_expires_at) < new Date()) {
        // Refresh token logic would go here
        console.log('Token expired, would need refresh');
      }

      // Get busy times from Google Calendar
      const busyResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            timeMin: startTime,
            timeMax: endTime,
            items: [{ id: integration.calendar_id || 'primary' }]
          })
        }
      );

      if (!busyResponse.ok) {
        console.error('Failed to check availability:', await busyResponse.text());
        return new Response(
          JSON.stringify({ available: true, slots: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const busyData = await busyResponse.json();
      const busySlots = busyData.calendars?.[integration.calendar_id || 'primary']?.busy || [];

      return new Response(
        JSON.stringify({ available: busySlots.length === 0, busySlots }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'create') {
      // Validate required fields
      if (!title || typeof title !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Title is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!startTime || !endTime) {
        return new Response(
          JSON.stringify({ error: 'Start and end times are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate dates
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return new Response(
          JSON.stringify({ error: 'Invalid date format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (startDate >= endDate) {
        return new Response(
          JSON.stringify({ error: 'Start time must be before end time' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Don't allow appointments in the past
      if (startDate < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Cannot book appointments in the past' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate attendee info if provided
      if (attendeeEmail && !validateEmail(attendeeEmail)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (attendeePhone && !validatePhone(attendeePhone)) {
        return new Response(
          JSON.stringify({ error: 'Invalid phone format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate optional UUIDs
      if (agentId && !validateUUID(agentId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid Agent ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (clientId && !validateUUID(clientId)) {
        return new Response(
          JSON.stringify({ error: 'Invalid Client ID format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize text inputs
      const sanitizedTitle = sanitizeString(title, 200);
      const sanitizedDescription = description ? sanitizeString(description, 2000) : null;
      const sanitizedAttendeeName = attendeeName ? sanitizeString(attendeeName, 100) : null;

      // Create appointment in database
      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          organization_id: organizationId,
          agent_id: agentId || null,
          client_id: clientId || null,
          conversation_id: conversationId || null,
          calendar_integration_id: integration?.id || null,
          title: sanitizedTitle,
          description: sanitizedDescription,
          start_time: startTime,
          end_time: endTime,
          attendee_name: sanitizedAttendeeName,
          attendee_email: attendeeEmail || null,
          attendee_phone: attendeePhone || null,
          status: 'scheduled'
        })
        .select()
        .single();

      if (appointmentError) {
        console.error('Failed to create appointment:', appointmentError);
        return new Response(
          JSON.stringify({ error: 'Failed to create appointment' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If calendar integration exists, create Google Calendar event
      if (integration && integration.access_token) {
        let accessToken = integration.access_token;

        const event = {
          summary: sanitizedTitle,
          description: sanitizedDescription || `Appointment booked via AI agent`,
          start: {
            dateTime: startTime,
            timeZone: 'UTC'
          },
          end: {
            dateTime: endTime,
            timeZone: 'UTC'
          },
          attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 15 }
            ]
          }
        };

        try {
          const eventResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id || 'primary'}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(event)
            }
          );

          if (eventResponse.ok) {
            const eventData = await eventResponse.json();
            
            // Update appointment with external event ID
            await supabase
              .from('appointments')
              .update({ 
                external_event_id: eventData.id,
                status: 'confirmed'
              })
              .eq('id', appointment.id);

            console.log('Google Calendar event created:', eventData.id);
          } else {
            console.error('Failed to create Google Calendar event:', await eventResponse.text());
          }
        } catch (calError) {
          console.error('Error creating calendar event:', calError);
          // Don't fail - appointment was created in database
        }
      }

      console.log('Appointment created:', appointment.id, 'from IP:', clientIP);

      return new Response(
        JSON.stringify({ success: true, appointment }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'cancel' || action === 'list') {
      // Require authenticated org member for sensitive actions
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .maybeSingle();
      const { data: isSuper } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      if (!membership && !isSuper) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'cancel') {
      if (!validateUUID(appointmentId)) {
        return new Response(
          JSON.stringify({ error: 'Valid Appointment ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      // Get appointment
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .eq('organization_id', organizationId)
        .single();

      if (fetchError || !appointment) {
        return new Response(
          JSON.stringify({ error: 'Appointment not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Cancel in Google Calendar if event exists
      if (appointment.external_event_id && integration) {
        try {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id || 'primary'}/events/${appointment.external_event_id}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${integration.access_token}`
              }
            }
          );
        } catch (calError) {
          console.error('Error deleting calendar event:', calError);
        }
      }

      // Update status in database
      await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      console.log('Appointment cancelled:', appointmentId, 'from IP:', clientIP);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list') {
      const { data: appointments, error: listError } = await supabase
        .from('appointments')
        .select(`
          *,
          agents(name),
          clients(name)
        `)
        .eq('organization_id', organizationId)
        .order('start_time', { ascending: true });

      if (listError) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch appointments' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ appointments }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Book Appointment Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
