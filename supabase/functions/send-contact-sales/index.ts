import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactFormRequest {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  expectedClients?: string;
  currentPlatform?: string;
  requirements?: string;
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOptional(value?: string) {
  const v = (value ?? "").trim();
  return v.length ? v : undefined;
}

async function sendEmail(to: string[], subject: string, html: string, replyTo?: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AVA Platform <noreply@assistantvirtualai.com>",
      to,
      subject,
      html,
      reply_to: replyTo,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
  
  return response.json();
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData: ContactFormRequest = await req.json();
    const { 
      name, 
      email, 
      company, 
      phone, 
      expectedClients, 
      currentPlatform, 
      requirements 
    } = formData;

    console.log("Received contact form submission:", { name, email, company });

    // Validate required fields + basic bounds (server-side)
    if (!name || !email) {
      return new Response(
        JSON.stringify({ error: "Name and email are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const safeName = escapeHtml(String(name).trim().slice(0, 100));
    const safeEmail = escapeHtml(String(email).trim().slice(0, 255));
    const safeCompany = normalizeOptional(company) ? escapeHtml(normalizeOptional(company)!.slice(0, 120)) : undefined;
    const safePhone = normalizeOptional(phone) ? escapeHtml(normalizeOptional(phone)!.slice(0, 40)) : undefined;
    const safeExpectedClients = normalizeOptional(expectedClients)
      ? escapeHtml(normalizeOptional(expectedClients)!.slice(0, 40))
      : undefined;
    const safeCurrentPlatform = normalizeOptional(currentPlatform)
      ? escapeHtml(normalizeOptional(currentPlatform)!.slice(0, 80))
      : undefined;
    const safeRequirements = normalizeOptional(requirements)
      ? escapeHtml(normalizeOptional(requirements)!.slice(0, 2000))
      : undefined;

    // Send email to sales team
    const salesEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .field { margin-bottom: 20px; }
          .label { font-weight: bold; color: #6366f1; margin-bottom: 5px; }
          .value { background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #6366f1; }
          .requirements { background: #fff; padding: 15px; border-radius: 5px; border: 1px solid #e5e7eb; white-space: pre-wrap; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🎯 New Enterprise Lead</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">A potential customer is interested in the Enterprise plan</p>
          </div>
          <div class="content">
            <div class="field">
              <div class="label">👤 Contact Name</div>
              <div class="value">${safeName}</div>
            </div>
            
            <div class="field">
              <div class="label">📧 Email Address</div>
               <div class="value"><a href="mailto:${safeEmail}">${safeEmail}</a></div>
            </div>
            
             ${safeCompany ? `
            <div class="field">
              <div class="label">🏢 Company</div>
               <div class="value">${safeCompany}</div>
            </div>
            ` : ''}
            
             ${safePhone ? `
            <div class="field">
              <div class="label">📱 Phone Number</div>
               <div class="value"><a href="tel:${safePhone}">${safePhone}</a></div>
            </div>
            ` : ''}
            
             ${safeExpectedClients ? `
            <div class="field">
              <div class="label">👥 Expected Number of Clients</div>
               <div class="value">${safeExpectedClients}</div>
            </div>
            ` : ''}
            
             ${safeCurrentPlatform ? `
            <div class="field">
              <div class="label">🔧 Current Platform</div>
               <div class="value">${safeCurrentPlatform}</div>
            </div>
            ` : ''}
            
             ${safeRequirements ? `
            <div class="field">
              <div class="label">📝 Requirements & Notes</div>
               <div class="requirements">${safeRequirements}</div>
            </div>
            ` : ''}
            
            <div class="footer">
              <p>This inquiry was submitted through the AVA Platform Enterprise contact form.</p>
              <p>Reply directly to this email to contact ${name}.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const adminTo = ADMIN_EMAIL || "mhassoun@assistantvirtualai.com";
    const emailResponse = await sendEmail(
      [adminTo],
      `🚀 New Enterprise Inquiry from ${safeName}${safeCompany ? ` (${safeCompany})` : ''}`,
      salesEmailHtml,
      safeEmail
    );

    console.log("Email sent successfully:", emailResponse);

    // Send confirmation email to the user
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Thank You, ${safeName}!</h1>
          </div>
          <div class="content">
            <p>We've received your inquiry about the AVA Enterprise plan.</p>
            <p>Our team will review your requirements and get back to you within <strong>24-48 hours</strong>.</p>
            <p>In the meantime, if you have any urgent questions, feel free to reply to this email.</p>
            <p>Best regards,<br><strong>The AVA Team</strong></p>
          </div>
          <div class="footer">
            <p>© 2024 AVA - AI Voice Agents Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(
      [email],
      "Thank you for your interest in AVA Enterprise",
      confirmationHtml
    );

    return new Response(
      JSON.stringify({ success: true, message: "Contact form submitted successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-contact-sales function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
