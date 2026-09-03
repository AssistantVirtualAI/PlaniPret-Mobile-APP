// Publication d'un paquet web (OTA) vers l'application mobile.
// Actions : upload_url | register | activate | rollback | list
import { mjson, mobileCors, requireMobileAdmin } from "../_shared/mobile-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mobileCors });

  try {
    const guard = await requireMobileAdmin(req);
    if ("error" in guard) return guard.error;
    const { admin, user } = guard;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");
    const appKey = String(body?.app_key ?? "planipret");
    const channel = String(body?.channel ?? "prod");

    if (action === "list") {
      const { data } = await admin
        .from("mobile_app_releases")
        .select("*")
        .eq("app_key", appKey)
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(50);
      return mjson({ ok: true, releases: data ?? [] });
    }

    if (action === "upload_url") {
      const version = String(body?.version ?? "").trim();
      if (!version) return mjson({ error: "version_required" }, 400);
      const path = `${appKey}/${channel}/${version}.zip`;
      const { data, error } = await admin.storage
        .from("mobile-bundles")
        .createSignedUploadUrl(path);
      if (error) return mjson({ error: error.message }, 400);
      return mjson({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === "register") {
      const version = String(body?.version ?? "").trim();
      const bundlePath = String(body?.bundle_path ?? "").trim();
      if (!version || !bundlePath) return mjson({ error: "version_and_path_required" }, 400);

      const { data, error } = await admin
        .from("mobile_app_releases")
        .upsert(
          {
            app_key: appKey,
            channel,
            version,
            bundle_path: bundlePath,
            bundle_sha256: body?.sha256 ?? null,
            bundle_size: body?.size ?? null,
            native_version_min: body?.native_version_min ?? null,
            notes: body?.notes ?? null,
            is_active: false,
            published_by: user.id,
          },
          { onConflict: "app_key,channel,version" },
        )
        .select()
        .maybeSingle();
      if (error) return mjson({ error: error.message }, 400);
      await admin.from("mobile_app_config_audit").insert({
        app_key: appKey, channel, action: "release_register",
        actor_id: user.id, actor_email: user.email ?? null, payload: { version },
      });
      return mjson({ ok: true, release: data });
    }

    if (action === "activate" || action === "rollback") {
      const id = String(body?.id ?? "");
      if (!id) return mjson({ error: "id_required" }, 400);

      if (action === "activate") {
        await admin
          .from("mobile_app_releases")
          .update({ is_active: false })
          .eq("app_key", appKey)
          .eq("channel", channel);
      }
      const { data, error } = await admin
        .from("mobile_app_releases")
        .update(
          action === "activate"
            ? { is_active: true, rolled_back_at: null }
            : { is_active: false, rolled_back_at: new Date().toISOString() },
        )
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) return mjson({ error: error.message }, 400);
      await admin.from("mobile_app_config_audit").insert({
        app_key: appKey, channel, action,
        actor_id: user.id, actor_email: user.email ?? null, payload: { id },
      });
      return mjson({ ok: true, release: data });
    }

    return mjson({ error: "unknown_action", hint: "list | upload_url | register | activate | rollback" }, 400);
  } catch (e) {
    console.error("[mobile-release-publish] error", e);
    return mjson({ error: (e as Error).message }, 500);
  }
});
