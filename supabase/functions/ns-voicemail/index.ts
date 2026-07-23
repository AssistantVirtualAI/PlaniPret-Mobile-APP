import { authBroker, corsHeaders, jsonResponse, nsBrokerFetch } from "../_shared/ns-broker.ts";

const DOMAIN = "planipret.ca";
const FOLDERS = new Set(["inbox", "saved", "deleted"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { admin, userId, profile } = auth;
    const url = new URL(req.url);
    const ext = encodeURIComponent(profile.extension);

    if (req.method === "GET") {
      const folder = (url.searchParams.get("folder") ?? "inbox").toLowerCase();
      if (!FOLDERS.has(folder)) return jsonResponse({ success: false, error: "folder invalide", code: 400 }, 400);
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users/${ext}/voicemails/${folder}`);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200);
      }
      const data = await res.json().catch(() => []);
      const list: any[] = Array.isArray(data) ? data : (data.voicemails ?? data.data ?? []);
      const rows = list.map((v: any) => ({
        user_id: userId,
        vm_id: v.vm_id ?? v.id,
        from_number: v.from_number ?? v.caller ?? null,
        duration_seconds: v.duration ?? v.duration_seconds ?? null,
        folder,
        is_read: v.is_read ?? v.read ?? false,
      })).filter((r) => r.vm_id);
      if (rows.length) await admin.from("planipret_voicemails").upsert(rows, { onConflict: "vm_id" });
      return jsonResponse({ success: true, data: list });
    }

    if (req.method === "DELETE") {
      const vmId = url.searchParams.get("vm_id");
      if (!vmId) return jsonResponse({ success: false, error: "vm_id requis", code: 400 }, 400);
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users/${ext}/voicemails/${encodeURIComponent(vmId)}`, { method: "DELETE" });
      if (res.status === 403) return jsonResponse({ success: false, error: "Accès non autorisé", code: 403 }, 200);
      if (!res.ok) { const t = await res.text().catch(() => ""); return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200); }
      await res.text();
      await admin.from("planipret_voicemails").delete().eq("vm_id", vmId);
      return jsonResponse({ success: true });
    }

    if (req.method === "POST" && url.pathname.endsWith("/forward")) {
      const body = await req.json().catch(() => ({}));
      const { vm_id, to_user } = body ?? {};
      if (!vm_id || !to_user) return jsonResponse({ success: false, error: "vm_id et to_user requis", code: 400 }, 400);
      const res = await nsBrokerFetch(
        admin, profile,
        `/domains/${DOMAIN}/users/${ext}/voicemails/${encodeURIComponent(vm_id)}/forward`,
        { method: "POST", body: JSON.stringify({ destination: to_user }) },
      );
      if (!res.ok) { const t = await res.text().catch(() => ""); return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200); }
      await res.text();
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "method_not_allowed", code: 405 }, 405);
  } catch (e) {
    console.error("ns-voicemail error", e);
    return jsonResponse({ success: false, error: "Connexion perdue", code: 0 }, 200);
  }
});
