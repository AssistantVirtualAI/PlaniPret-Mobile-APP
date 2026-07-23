// pp-ns-voicemail — Proxy NS-API v2 Voicemails pour Planiprêt.
// AVA Planiprêt uniquement. Segmentation stricte par extension utilisateur.
//
// GET  ?action=list&folder=inbox|saved|deleted  → Liste des voicemails
// GET  ?action=audio&vm_id=X                    → URL audio du voicemail
// PATCH ?action=mark-read body { vm_id }        → Marquer comme lu
// PATCH ?action=move body { vm_id, folder }     → Déplacer vers un dossier
// DELETE ?vm_id=X                               → Supprimer un voicemail
//
// Sécurité : requirePlanipretBroker() vérifie l'appartenance à Planiprêt
// et la présence d'une extension NS-API valide.

import {
  corsHeaders,
  jsonResponse,
  requirePlanipretBroker,
  nsFetch,
} from "../_shared/planipret-ns.ts";

const VALID_FOLDERS = new Set(["inbox", "saved", "deleted"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requirePlanipretBroker(req);
  if (guard instanceof Response) return guard;

  const { ctx, supabase } = guard;
  const url = new URL(req.url);

  // Lire le body si présent (supabase.functions.invoke envoie toujours POST + body)
  let body: any = {};
  if (req.method !== "GET" && req.method !== "DELETE") {
    body = await req.json().catch(() => ({}));
  }
  const action = (body?.action ?? url.searchParams.get("action") ?? "list").toString();

  // Base path NS-API segmenté par extension utilisateur
  const userBase = `/domains/${encodeURIComponent(ctx.nsDomain)}/users/${encodeURIComponent(ctx.extension)}`;

  try {
    // ── liste des voicemails ─────────────────────────────────────────────────
    if (action === "list") {
      const folder = ((body?.folder ?? url.searchParams.get("folder") ?? "inbox") as string).toLowerCase();
      if (!VALID_FOLDERS.has(folder)) {
        return jsonResponse({ error: `Dossier invalide: ${folder}. Valeurs: inbox, saved, deleted` }, 400);
      }


      const res = await nsFetch(`${userBase}/voicemails/${folder}`, { method: "GET" });
      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API voicemail fetch failed", status: res.status, body: txt }, 502);
      }

      const raw = await res.json();
      const items: any[] = Array.isArray(raw) ? raw : (raw?.voicemails ?? raw?.data ?? []);

      // Sync dans Supabase pour l'historique local
      if (items.length > 0) {
        const rows = items.map((v: any) => ({
          user_id: ctx.profileId,
          vm_id: v.vm_id ?? v.id ?? null,
          from_number: v.from_number ?? v.caller ?? null,
          from_name: v.from_name ?? v.caller_name ?? null,
          duration_seconds: v.duration ?? v.duration_seconds ?? null,
          folder,
          is_read: v.is_read ?? v.read ?? false,
          created_at: v.created_at ?? v.timestamp ?? new Date().toISOString(),
        })).filter((r) => r.vm_id);

        if (rows.length > 0) {
          await supabase
            .from("planipret_voicemails")
            .upsert(rows, { onConflict: "vm_id" });
        }
      }

      return jsonResponse({ ok: true, count: items.length, folder, items });
    }

    // ── URL audio d'un voicemail ─────────────────────────────────────────────
    if (action === "audio") {
      const vmId = body?.vm_id ?? url.searchParams.get("vm_id");
      if (!vmId) return jsonResponse({ error: "vm_id requis" }, 400);

      const res = await nsFetch(
        `${userBase}/voicemails/inbox/${encodeURIComponent(vmId)}/audio`,
        { method: "GET" }
      );

      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API audio fetch failed", status: res.status, body: txt }, 502);
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        return jsonResponse({ ok: true, audio_url: data.url ?? data.audio_url ?? null });
      }

      const audioBuffer = await res.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType || "audio/wav",
          "Content-Length": audioBuffer.byteLength.toString(),
        },
      });
    }

    // ── marquer comme lu ─────────────────────────────────────────────────────
    if (action === "mark-read") {
      const vmId = body?.vm_id;
      if (!vmId) return jsonResponse({ error: "vm_id requis" }, 400);

      const res = await nsFetch(
        `${userBase}/voicemails/inbox/${encodeURIComponent(vmId)}`,
        { method: "PATCH", body: JSON.stringify({ is_read: true }) }
      );

      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API mark-read failed", status: res.status, body: txt }, 502);
      }

      await supabase
        .from("planipret_voicemails")
        .update({ is_read: true })
        .eq("vm_id", vmId)
        .eq("user_id", ctx.profileId);

      return jsonResponse({ ok: true });
    }

    // ── déplacer vers un dossier ─────────────────────────────────────────────
    if (action === "move") {
      const { vm_id, folder } = body ?? {};
      if (!vm_id || !folder) return jsonResponse({ error: "vm_id et folder requis" }, 400);
      if (!VALID_FOLDERS.has(folder)) return jsonResponse({ error: "Dossier invalide" }, 400);

      const res = await nsFetch(
        `${userBase}/voicemails/inbox/${encodeURIComponent(vm_id)}/move`,
        { method: "PATCH", body: JSON.stringify({ folder }) }
      );

      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API move failed", status: res.status, body: txt }, 502);
      }

      await supabase
        .from("planipret_voicemails")
        .update({ folder })
        .eq("vm_id", vm_id)
        .eq("user_id", ctx.profileId);

      return jsonResponse({ ok: true });
    }

    // ── supprimer un voicemail ───────────────────────────────────────────────
    if (action === "delete" || req.method === "DELETE") {
      const vmId = body?.vm_id ?? url.searchParams.get("vm_id");
      if (!vmId) return jsonResponse({ error: "vm_id requis" }, 400);

      const res = await nsFetch(
        `${userBase}/voicemails/inbox/${encodeURIComponent(vmId)}`,
        { method: "DELETE" }
      );

      if (!res.ok && res.status !== 404) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API delete failed", status: res.status, body: txt }, 502);
      }

      await supabase
        .from("planipret_voicemails")
        .delete()
        .eq("vm_id", vmId)
        .eq("user_id", ctx.profileId);

      return jsonResponse({ ok: true });
    }


    // ── transférer un voicemail à un autre utilisateur ───────────────────────
    if (action === "forward") {
      const { vm_id, to_user } = body ?? {};
      if (!vm_id || !to_user) return jsonResponse({ error: "vm_id et to_user requis" }, 400);
      const res = await nsFetch(
        `${userBase}/voicemails/inbox/${encodeURIComponent(vm_id)}/forward`,
        { method: "POST", body: JSON.stringify({ to_user }) }
      );
      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ error: "NS-API forward failed", status: res.status, body: txt }, 502);
      }
      return jsonResponse({ ok: true, success: true });
    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);

  } catch (e) {
    console.error("[pp-ns-voicemail] Erreur:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
