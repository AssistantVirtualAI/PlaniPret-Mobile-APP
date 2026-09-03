// Écriture / publication de la configuration mobile depuis le portail admin.
// Actions : get | save | publish | list_audit
import { mjson, mobileCors, requireMobileAdmin } from "../_shared/mobile-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mobileCors });

  try {
    const guard = await requireMobileAdmin(req);
    if ("error" in guard) return guard.error;
    const { admin, user } = guard;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "get");
    const appKey = String(body?.app_key ?? "planipret");
    const channel = String(body?.channel ?? "prod");

    const audit = (a: string, payload: unknown) =>
      admin.from("mobile_app_config_audit").insert({
        app_key: appKey,
        channel,
        action: a,
        actor_id: user.id,
        actor_email: user.email ?? null,
        payload: payload as any,
      });

    if (action === "get") {
      const [{ data: cfg }, { data: releases }] = await Promise.all([
        admin.from("mobile_app_config").select("*").eq("app_key", appKey).eq("channel", channel).maybeSingle(),
        admin
          .from("mobile_app_releases")
          .select("*")
          .eq("app_key", appKey)
          .eq("channel", channel)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      return mjson({ ok: true, config: cfg ?? null, releases: releases ?? [] });
    }

    if (action === "save" || action === "publish") {
      const patch: Record<string, unknown> = {
        app_key: appKey,
        channel,
        flags: body?.flags ?? {},
        messages: body?.messages ?? {},
        settings: body?.settings ?? {},
        min_version: body?.min_version ?? null,
        recommended_version: body?.recommended_version ?? null,
        maintenance_mode: !!body?.maintenance_mode,
        maintenance_message: body?.maintenance_message ?? null,
      };
      if (action === "publish") {
        patch.published_at = new Date().toISOString();
        patch.published_by = user.id;
      }
      const { data, error } = await admin
        .from("mobile_app_config")
        .upsert(patch, { onConflict: "app_key,channel" })
        .select()
        .maybeSingle();
      if (error) return mjson({ error: error.message }, 400);
      await audit(action, patch);
      return mjson({ ok: true, config: data });
    }

    if (action === "list_audit") {
      const { data } = await admin
        .from("mobile_app_config_audit")
        .select("*")
        .eq("app_key", appKey)
        .order("created_at", { ascending: false })
        .limit(50);
      return mjson({ ok: true, audit: data ?? [] });
    }

    return mjson({ error: "unknown_action", hint: "get | save | publish | list_audit" }, 400);
  } catch (e) {
    console.error("[mobile-config-admin] error", e);
    return mjson({ error: (e as Error).message }, 500);
  }
});
