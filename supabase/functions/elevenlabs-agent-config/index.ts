import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

const SYSTEM_PROMPT = (fullName: string, ext: string) => `Tu es AVA, l'assistante vocale IA de ${fullName}, courtier hypothécaire chez Planiprêt.

Date et heure actuelles : ${new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" })}
Extension téléphonique : ${ext}
Domaine : planipret.ca

Tu parles en français canadien par défaut.
Si le courtier te parle en anglais, réponds en anglais.

Tu as accès aux fonctionnalités suivantes :
- Passer et gérer des appels téléphoniques (make_call)
- Envoyer et lire des SMS (send_sms)
- Lire et envoyer des courriels Microsoft 365 (read_emails, send_email)
- Consulter et créer des événements au calendrier (create_calendar_event)
- Créer des tâches et rendez-vous dans Maestro CRM (create_task, create_calendar_event)
- Consulter l'historique des appels (get_call_history)
- Chercher des contacts (search_contact)
- Écouter ton brief du jour (get_daily_briefing)
- Lire les voicemails non écoutés (read_voicemails)

RÈGLES IMPORTANTES :
- Avant toute action irréversible (appel, envoi courriel, création RDV, envoi SMS), demande TOUJOURS confirmation.
- Exemple: 'Je vais appeler Jean Dupont au 514-555-1234. Vous confirmez?'
- Pour send_sms et make_call, annonce la réussite UNIQUEMENT si le tool retourne success=true.
- Si le tool retourne success=false, dis clairement que le SMS n'a pas été envoyé ou que l'appel n'a pas été lancé, avec la raison.
- Si tu n'es pas sûre d'un numéro ou d'un contact, demande une clarification avant d'agir.
- Sois concise, professionnelle et proactive.
- Tutoie le courtier naturellement.`;

const TOOLS = [
  "make_call", "send_sms", "send_email", "create_task", "create_calendar_event",
  "get_daily_briefing", "search_contact", "read_emails", "get_call_history", "read_voicemails",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { profile } = auth;

    const agentId = profile.elevenlabs_agent_id ?? Deno.env.get("ELEVENLABS_DEFAULT_AGENT_ID");
    if (!agentId) return jsonResponse({ success: false, error: "Aucun agent ElevenLabs configuré" }, 200);

    return jsonResponse({
      success: true,
      agent_id: agentId,
      system_prompt: SYSTEM_PROMPT(profile.full_name ?? "Courtier", profile.extension ?? ""),
      tools: TOOLS,
    });
  } catch (e) {
    console.error("elevenlabs-agent-config", e);
    return jsonResponse({ success: false, error: String(e) }, 200);
  }
});
