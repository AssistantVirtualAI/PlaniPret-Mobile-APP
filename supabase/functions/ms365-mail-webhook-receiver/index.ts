// AVA — Récepteur des notifications Microsoft Graph (nouveaux courriels).
// Public: verify_jwt=false. Valide clientState + validationToken. Déclenche ava-email-analyzer.
import { createClient } from "npm:@supabase/supabase-js@2";

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  // Microsoft valide l'endpoint via ?validationToken=...
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (req.method !== "POST") return j({ ok: true });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const projectId = Deno.env.get("SUPABASE_URL")!.replace("https://", "").split(".")[0];

    const body = await req.json().catch(() => ({}));
    const notifications = (body?.value ?? []) as any[];
    console.log(`[mail-webhook-receiver] ${notifications.length} notif(s)`);

    // Respond fast (Graph exige <30s). Traitement en parallèle mais sans attendre.
    const tasks = notifications.map(async (n) => {
      try {
        const subId = n.subscriptionId as string;
        const clientState = n.clientState as string;
        const resourceData = n.resourceData ?? {};
        const messageId = resourceData.id as string | undefined;
        if (!subId || !messageId) return;

        const { data: sub } = await admin
          .from("planipret_ava_mail_subscriptions")
          .select("*")
          .eq("ms_subscription_id", subId)
          .maybeSingle();
        if (!sub) { console.warn("[mail-webhook-receiver] sub not found", subId); return; }
        if (sub.client_state !== clientState) { console.warn("[mail-webhook-receiver] clientState mismatch"); return; }

        await admin.from("planipret_ava_mail_subscriptions")
          .update({ last_notification_at: new Date().toISOString() })
          .eq("id", sub.id);

        // Invoke analyzer server-side
        const r = await fetch(`https://${projectId}.functions.supabase.co/ava-email-analyzer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-ava-service": svcKey, Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({ ms_message_id: messageId, broker_user_id: sub.broker_user_id }),
        });
        const analysisResp = await r.json().catch(() => ({}));
        if (!analysisResp?.success) { console.warn("[mail-webhook-receiver] analyzer failed", analysisResp); return; }

        const analysis = analysisResp.analysis;
        // Push notification si important
        const importantIntent = ["contrat_signe", "nouveau_lead", "demande_rdv"].includes(analysis?.intent);
        const isUrgent = analysis?.urgency === "high" || (analysis?.lead_score ?? 0) >= 7;
        if (importantIntent || isUrgent) {
          const title = analysis.intent === "nouveau_lead" ? "💡 Nouveau lead"
            : analysis.intent === "contrat_signe" ? "📄 Contrat signé"
            : analysis.intent === "demande_rdv" ? "📅 Demande de RDV"
            : "🤖 AVA — courriel important";
          await fetch(`https://${projectId}.functions.supabase.co/pp-push-notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
            body: JSON.stringify({
              user_id: sub.broker_user_id,
              title,
              body: analysis.notification_summary ?? analysis.email_subject ?? "",
              data: {
                type: "ava_email",
                analysis_id: analysis.id,
                ms_message_id: analysis.ms_message_id,
                deep_link: `/mplanipret/messages?email=${encodeURIComponent(analysis.ms_message_id)}&ava=1`,
              },
            }),
          }).catch((e) => console.warn("[mail-webhook-receiver] push failed", e));
        }
      } catch (e) {
        console.error("[mail-webhook-receiver] notif error", e);
      }
    });
    // Fire-and-forget dans EdgeRuntime
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(Promise.allSettled(tasks));
    } else {
      await Promise.allSettled(tasks);
    }

    return new Response("", { status: 202 });
  } catch (e: any) {
    console.error("[ms365-mail-webhook-receiver]", e);
    return j({ error: e?.message ?? "err" }, 500);
  }
});
