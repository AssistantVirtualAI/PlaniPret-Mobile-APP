import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT_FR = `Tu es l'assistant virtuel d'AVA (AI Voice Agents), une plateforme SaaS qui permet aux agences de créer, déployer et gérer des agents IA vocaux. Tu dois répondre en français.

## À propos d'AVA
AVA est une plateforme tout-en-un qui offre :
- **Portail Admin** : Gestion complète des agents IA, clients, analytics, intégrations et facturation
- **Portail Client** : Accès dédié pour les clients pour gérer leurs agents, conversations et analytics
- **Création d'agents** : Wizard complet pour créer des agents IA avec choix de voix, prompts, base de connaissances
- **Intégrations** : ElevenLabs, Vapi, Retell AI, Twilio (téléphonie)
- **Analytics avancés** : Tableaux de bord temps réel, analyse de sentiment, rapports automatiques IA
- **Gestion téléphonie** : Achat de numéros, routage d'appels, enregistrements via Twilio
- **Webhooks & Workflows** : Automatisation complète des processus
- **White-label** : Personnalisation complète de la marque pour les clients

## Plans et tarifs
- **Starter** : 69$/mois — 5 clients, agents illimités, 5 000 conversations/mois, support email
- **Growth** (le plus populaire) : 199$/mois — 15 clients, agents illimités, 25 000 conversations/mois, support prioritaire, white-label email, rapports IA
- **Ultimate** : 399$/mois — 50 clients, conversations illimitées, API complète, white-label total, SSO, support dédié 4h
- **Enterprise** : Sur mesure — Contactez-nous
- Tous les plans incluent un essai gratuit de 14 jours

## Instructions
- Sois amical, professionnel et concis
- Aide les utilisateurs à comprendre les fonctionnalités et à choisir le bon plan
- Si quelqu'un veut s'inscrire, dirige-le vers /login
- Si quelqu'un veut une démo, dirige-le vers /demo-request
- Si quelqu'un a des questions complexes, suggère /contact
- Ne fabrique pas d'informations que tu ne connais pas`;

const SYSTEM_PROMPT_EN = `You are the virtual assistant for AVA (AI Voice Agents), a SaaS platform that allows agencies to create, deploy, and manage AI voice agents. You must respond in English.

## About AVA
AVA is an all-in-one platform that offers:
- **Admin Portal**: Complete management of AI agents, clients, analytics, integrations, and billing
- **Client Portal**: Dedicated access for clients to manage their agents, conversations, and analytics
- **Agent Creation**: Complete wizard to create AI agents with voice selection, prompts, knowledge base
- **Integrations**: ElevenLabs, Vapi, Retell AI, Twilio (telephony)
- **Advanced Analytics**: Real-time dashboards, sentiment analysis, automated AI reports
- **Telephony Management**: Number purchasing, call routing, recordings via Twilio
- **Webhooks & Workflows**: Complete process automation
- **White-label**: Full brand customization for clients

## Plans and Pricing
- **Starter**: $69/month — 5 clients, unlimited agents, 5,000 conversations/month, email support
- **Growth** (most popular): $199/month — 15 clients, unlimited agents, 25,000 conversations/month, priority support, email white-label, AI reports
- **Ultimate**: $399/month — 50 clients, unlimited conversations, full API, complete white-label, SSO, dedicated 4h support
- **Enterprise**: Custom — Contact us
- All plans include a 14-day free trial

## Instructions
- Be friendly, professional, and concise
- Help users understand features and choose the right plan
- If someone wants to sign up, direct them to /login
- If someone wants a demo, direct them to /demo-request
- If someone has complex questions, suggest /contact
- Don't fabricate information you don't know`;

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendConversationEmail(messages: any[], language: string) {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return;

  try {
    const conversationHtml = messages
      .filter((m: any) => m.role !== "system")
      .map((m: any) => {
        const isUser = m.role === "user";
        return `<div style="margin-bottom: 12px; padding: 10px; border-radius: 8px; background: ${isUser ? '#e0e7ff' : '#f3f4f6'}; border-left: 3px solid ${isUser ? '#6366f1' : '#9ca3af'};">
          <strong style="color: ${isUser ? '#4338ca' : '#374151'};">${isUser ? '👤 Visitor' : '🤖 AVA Bot'}</strong>
          <p style="margin: 5px 0 0 0;">${escapeHtml(m.content)}</p>
        </div>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>body { font-family: Arial, sans-serif; color: #333; }</style></head>
      <body>
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0;">💬 Chatbot Conversation Summary</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Language: ${escapeHtml(language).toUpperCase()} | ${new Date().toLocaleString()}</p>
          </div>
          <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px;">
            ${conversationHtml}
          </div>
        </div>
      </body>
      </html>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AVA Chatbot <noreply@assistantvirtualai.com>",
        to: [ADMIN_EMAIL],
        subject: `💬 New chatbot conversation (${language.toUpperCase()})`,
        html,
      }),
    });

    console.log("Conversation email sent to admin");
  } catch (err) {
    console.error("Failed to send conversation email:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages: rawMessages, language = "en", sendSummary = false } = await req.json();
    const messages = Array.isArray(rawMessages)
      ? rawMessages
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: String(m.content ?? '').slice(0, 4000) }))
      : [];

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = language === "fr" ? SYSTEM_PROMPT_FR : SYSTEM_PROMPT_EN;

    // If requested, send conversation summary email
    if (sendSummary && messages.length > 2) {
      await sendConversationEmail(messages, language);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error: any) {
    console.error("Chatbot error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
