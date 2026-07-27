// pp-moh-list — bibliothèque locale + MOH présentes côté NetSapiens.
// Actions: list | delete | rename | set_default | signed_url | ns_delete
import { corsHeaders, json, requirePlanipretAdmin } from "../_shared/pp-admin.ts";
import { getEnv, nsFetch } from "../_shared/planipret-ns.ts";

const FN = "pp-moh-list";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requirePlanipretAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { action = "list", id, name, index } =
    (await req.json().catch(() => ({}))) as {
      action?: string; id?: string; name?: string; index?: string | number;
    };
  const domain = getEnv().NS_DEFAULT_DOMAIN;

  try {
    if (action === "delete" && id) {
      const { data: row } = await admin.from("planipret_hold_music")
        .select("storage_path").eq("id", id).maybeSingle();
      const p = (row as { storage_path?: string } | null)?.storage_path;
      if (p) await admin.storage.from("planipret-hold-music").remove([p]);
      await admin.from("planipret_hold_music").delete().eq("id", id);
      return json({ success: true });
    }

    if (action === "rename" && id && name) {
      await admin.from("planipret_hold_music").update({ name }).eq("id", id);
      return json({ success: true });
    }

    if (action === "set_default" && id) {
      await admin.from("planipret_hold_music").update({ is_default: false }).neq("id", id);
      await admin.from("planipret_hold_music").update({ is_default: true }).eq("id", id);
      return json({ success: true });
    }

    if (action === "signed_url" && id) {
      const { data: row } = await admin.from("planipret_hold_music")
        .select("storage_path").eq("id", id).maybeSingle();
      const p = (row as { storage_path?: string } | null)?.storage_path;
      if (!p) return json({ success: false, error: "no_audio" }, 200);
      const { data } = await admin.storage.from("planipret-hold-music").createSignedUrl(p, 3600);
      return json({ success: true, url: data?.signedUrl ?? null });
    }

    if (action === "ns_delete" && index !== undefined) {
      // NS-API v2: DELETE /domains/{domain}/moh/{index}
      const res = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/moh/${encodeURIComponent(String(index))}`,
        { method: "DELETE" },
        { functionName: FN },
      );
      const txt = await res.text().catch(() => "");
      return json({ success: res.ok, status: res.status, detail: txt.slice(0, 300) });
    }

    // --- list ---
    const { data: rows, error } = await admin.from("planipret_hold_music")
      .select("*").order("created_at", { ascending: false }).limit(100);
    if (error) return json({ success: false, error: error.message }, 200);

    const withUrls = await Promise.all((rows ?? []).map(async (r: any) => {
      let audio_url: string | null = null;
      if (r.storage_path) {
        const { data } = await admin.storage
          .from("planipret-hold-music").createSignedUrl(r.storage_path, 3600);
        audio_url = data?.signedUrl ?? null;
      }
      return { ...r, audio_url };
    }));

    // MOH déjà présentes sur le domaine NetSapiens
    let ns: unknown[] = [];
    let ns_error: string | null = null;
    try {
      const res = await nsFetch(`/domains/${encodeURIComponent(domain)}/moh`, {}, { functionName: FN });
      if (res.ok) {
        const j = await res.json().catch(() => []);
        ns = Array.isArray(j) ? j : (j?.data ?? []);
      } else {
        ns_error = `HTTP ${res.status}`;
      }
    } catch (e) {
      ns_error = String(e);
    }

    return json({ success: true, greetings: withUrls, ns, ns_error, domain });
  } catch (e) {
    return json({ success: false, error: String(e) }, 200);
  }
});
