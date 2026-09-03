// Lecture de la configuration mobile + version active (appelée par l'app).
import { adminClient, mjson, mobileCors, getUser } from "../_shared/mobile-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: mobileCors });

  try {
    const body = await req.json().catch(() => ({}));
    const appKey = String(body?.app_key ?? "planipret");
    const channel = String(body?.channel ?? "prod");
    const currentVersion = body?.version ? String(body.version) : null;

    const user = await getUser(req);
    if (!user) return mjson({ error: "unauthorized" }, 401);

    const admin = adminClient();

    const [{ data: cfg }, { data: rel }] = await Promise.all([
      admin
        .from("mobile_app_config")
        .select("*")
        .eq("app_key", appKey)
        .eq("channel", channel)
        .maybeSingle(),
      admin
        .from("mobile_app_releases")
        .select("id, version, notes, bundle_path, bundle_sha256, bundle_size, native_version_min, created_at")
        .eq("app_key", appKey)
        .eq("channel", channel)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let bundleUrl: string | null = null;
    if (rel?.bundle_path) {
      const signed = await admin.storage
        .from("mobile-bundles")
        .createSignedUrl(rel.bundle_path, 3600);
      bundleUrl = signed.data?.signedUrl ?? null;
    }

    const needsUpdate =
      !!rel?.version && !!currentVersion && rel.version !== currentVersion;

    return mjson({
      ok: true,
      app_key: appKey,
      channel,
      config: {
        flags: cfg?.flags ?? {},
        messages: cfg?.messages ?? {},
        settings: cfg?.settings ?? {},
        min_version: cfg?.min_version ?? null,
        recommended_version: cfg?.recommended_version ?? null,
        maintenance_mode: cfg?.maintenance_mode ?? false,
        maintenance_message: cfg?.maintenance_message ?? null,
        published_at: cfg?.published_at ?? null,
      },
      release: rel
        ? {
            version: rel.version,
            notes: rel.notes,
            sha256: rel.bundle_sha256,
            size: rel.bundle_size,
            native_version_min: rel.native_version_min,
            url: bundleUrl,
            needs_update: needsUpdate,
          }
        : null,
    });
  } catch (e) {
    console.error("[mobile-config] error", e);
    return mjson({ error: (e as Error).message }, 500);
  }
});
