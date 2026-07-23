import { corsHeaders, jsonResponse, nsBrokerFetch, nsEnv, requirePlanipretAdmin } from "../_shared/ns-broker.ts";

const DOMAIN = "planipret.ca";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requirePlanipretAdmin(req);
    if ("error" in auth) return auth.error;
    const { admin, profile } = auth;
    const url = new URL(req.url);

    if (req.method === "GET") {
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return jsonResponse({ success: false, error: (data as any)?.message ?? "NS-API error", code: res.status }, 200);
      return jsonResponse({ success: true, data });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { first_name, last_name, email, ns_extension, password } = body ?? {};
      if (!email || !ns_extension || !password) {
        return jsonResponse({ success: false, error: "Champs requis manquants", code: 400 }, 400);
      }
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users`, {
        method: "POST",
        body: JSON.stringify({ first_name, last_name, email, extension: ns_extension, password }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ""); return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200); }
      await res.text();

      // Create Supabase user + planipret profile
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { first_name, last_name },
      });
      if (cErr || !created.user) return jsonResponse({ success: false, error: cErr?.message ?? "Auth create failed", code: 500 }, 200);

      await admin.from("planipret_profiles").insert({
        user_id: created.user.id,
        organization_id: profile.organization_id,
        email,
        full_name: [first_name, last_name].filter(Boolean).join(" "),
        extension: ns_extension,
        ns_domain: DOMAIN,
        role: "broker",
      });
      await admin.from("user_roles").upsert({
        user_id: created.user.id,
        organization_id: profile.organization_id,
        role: "planipret_broker",
      }, { onConflict: "user_id,organization_id" });
      return jsonResponse({ success: true, user_id: created.user.id });
    }

    if (req.method === "PUT") {
      const ext = url.searchParams.get("user");
      if (!ext) return jsonResponse({ success: false, error: "user requis", code: 400 }, 400);
      const body = await req.json().catch(() => ({}));
      const { first_name, last_name, email } = body ?? {};
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users/${encodeURIComponent(ext)}`, {
        method: "PUT", body: JSON.stringify({ first_name, last_name, email }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ""); return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200); }
      await res.text();
      await admin.from("planipret_profiles").update({
        email,
        full_name: [first_name, last_name].filter(Boolean).join(" "),
      }).eq("extension", ext);
      return jsonResponse({ success: true });
    }

    if (req.method === "DELETE") {
      const ext = url.searchParams.get("user");
      if (!ext) return jsonResponse({ success: false, error: "user requis", code: 400 }, 400);
      const res = await nsBrokerFetch(admin, profile, `/domains/${DOMAIN}/users/${encodeURIComponent(ext)}`, { method: "DELETE" });
      if (!res.ok) { const t = await res.text().catch(() => ""); return jsonResponse({ success: false, error: t || "NS-API error", code: res.status }, 200); }
      await res.text();
      const { data: target } = await admin.from("planipret_profiles").select("user_id").eq("extension", ext).maybeSingle();
      if (target?.user_id) {
        await admin.from("planipret_profiles").delete().eq("user_id", target.user_id);
        await admin.auth.admin.deleteUser(target.user_id).catch(() => {});
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "method_not_allowed", code: 405 }, 405);
  } catch (e) {
    console.error("ns-users error", e);
    return jsonResponse({ success: false, error: "Connexion perdue", code: 0 }, 200);
  }
});
