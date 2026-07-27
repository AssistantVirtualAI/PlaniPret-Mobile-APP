// pp-moh-push — pousse un fichier de musique d'attente vers NetSapiens.
// scope = "domain"       → POST /domains/{domain}/moh
// scope = "all_brokers"  → POST /domains/{domain}/users/{ext}/moh pour chaque courtier
// Docs NS-API v2: Media/Music on Hold (Domain & User), upload multipart.
import { corsHeaders, json, requirePlanipretAdmin } from "../_shared/pp-admin.ts";
import { getEnv, nsFetch } from "../_shared/planipret-ns.ts";

const FN = "pp-moh-push";

/** Build a multipart/form-data body manually so we control the boundary
 *  (nsFetch forces a default Content-Type otherwise). */
function multipart(fields: Record<string, string>, file: { name: string; bytes: Uint8Array; type: string }) {
  const boundary = `----ppmoh${crypto.randomUUID().replace(/-/g, "")}`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
    `Content-Type: ${file.type}\r\n\r\n`,
  ));
  parts.push(file.bytes);
  parts.push(enc.encode(`\r\n--${boundary}--\r\n`));
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const body = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { body.set(p, off); off += p.byteLength; }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function pushOne(path: string, fields: Record<string, string>, bytes: Uint8Array, filename: string) {
  const { body, contentType } = multipart(fields, { name: filename, bytes, type: "audio/wav" });
  const res = await nsFetch(path, {
    method: "POST",
    body,
    headers: { "Content-Type": contentType },
  }, { functionName: FN });
  const txt = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, detail: txt.slice(0, 240) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requirePlanipretAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin, userId } = auth;

  const { id, scope = "domain", index = 1, offset = 0, limit = 500 } =
    (await req.json().catch(() => ({}))) as {
      id?: string; scope?: "domain" | "all_brokers"; index?: number; offset?: number; limit?: number;
    };
  if (!id) return json({ success: false, error: "id_required" }, 400);

  const { data: row } = await admin.from("planipret_hold_music")
    .select("id, name, storage_path, status").eq("id", id).maybeSingle();
  const moh = row as { id: string; name: string; storage_path?: string; status: string } | null;
  if (!moh) return json({ success: false, error: "not_found" }, 404);
  if (moh.status !== "ready" || !moh.storage_path) {
    return json({ success: false, error: "audio_not_ready" }, 200);
  }

  const dl = await admin.storage.from("planipret-hold-music").download(moh.storage_path);
  if (dl.error || !dl.data) return json({ success: false, error: "download_failed" }, 200);
  const bytes = new Uint8Array(await dl.data.arrayBuffer());

  const domain = getEnv().NS_DEFAULT_DOMAIN;
  const filename = `${moh.name.replace(/[^\w.-]+/g, "_").slice(0, 48) || "hold_music"}.wav`;
  const idx = Math.min(Math.max(Number(index) || 1, 1), 9);
  const fields = { index: String(idx), description: moh.name.slice(0, 64) };

  try {
    if (scope === "domain") {
      const r = await pushOne(`/domains/${encodeURIComponent(domain)}/moh`, fields, bytes, filename);
      await admin.from("planipret_hold_music").update({
        pushed_at: new Date().toISOString(),
        push_scope: "domain",
        push_result: { ok: r.ok, status: r.status, detail: r.detail, by: userId },
      }).eq("id", id);
      return json({ success: r.ok, scope, status: r.status, detail: r.detail, domain });
    }

    // ---- all brokers ----
    const { data: brokers } = await admin.from("planipret_profiles")
      .select("id, user_id, full_name, extension, ns_extension, ns_domain")
      .not("extension", "is", null)
      .order("extension", { ascending: true })
      .range(offset, offset + limit - 1);

    const list = (brokers ?? []) as Array<Record<string, string | null>>;
    const results: Array<Record<string, unknown>> = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const chunk = list.slice(i, i + CONCURRENCY);
      const out = await Promise.all(chunk.map(async (b) => {
        const ext = b.ns_extension ?? b.extension;
        const dom = b.ns_domain ?? domain;
        if (!ext) return { broker: b.full_name, success: false, error: "no_extension" };
        const r = await pushOne(
          `/domains/${encodeURIComponent(dom)}/users/${encodeURIComponent(ext)}/moh`,
          fields, bytes, filename,
        );
        return { broker: b.full_name, extension: ext, success: r.ok, status: r.status, detail: r.ok ? undefined : r.detail };
      }));
      results.push(...out);
    }

    const ok = results.filter((r) => r.success).length;
    await admin.from("planipret_hold_music").update({
      pushed_at: new Date().toISOString(),
      push_scope: "all_brokers",
      push_result: { ok, total: results.length, by: userId, failures: results.filter((r) => !r.success).slice(0, 25) },
    }).eq("id", id);

    try {
      await admin.from("planipret_audit_log").insert({
        action: "hold_music_push",
        resource_type: "hold_music",
        resource_id: id,
        admin_id: userId,
        user_id: userId,
        metadata: { scope, ok, total: results.length, domain },
      });
    } catch { /* audit best effort */ }

    return json({ success: true, scope, programmed: ok, total: results.length, results: results.slice(0, 400) });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message ?? e) }, 200);
  }
});
