import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { normalizePhone, formatDisplay } from "../_shared/phoneNormalize.ts";

interface InContact {
  external_id?: string | null;
  full_name?: string | null;
  phone: string;
  phone_label?: string | null;
  email?: string | null;
  company?: string | null;
  photo_url?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const contacts: InContact[] = Array.isArray(body?.contacts) ? body.contacts : [];
    const source: string = body?.source === "microsoft" ? "microsoft" : "device";

    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    const organization_id = (prof as any)?.organization_id ?? null;

    const rows: any[] = [];
    const seen = new Set<string>();
    for (const c of contacts) {
      const norm = normalizePhone(c.phone);
      if (!norm) continue;
      const key = `${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        user_id: userId,
        organization_id,
        source,
        external_id: c.external_id ?? null,
        full_name: c.full_name?.trim() || formatDisplay(norm),
        phone: c.phone,
        phone_normalized: norm,
        phone_display: formatDisplay(norm),
        email: c.email ?? null,
        company: c.company ?? null,
        photo_url: c.photo_url ?? null,
        last_synced_at: new Date().toISOString(),
      });
    }

    if (!rows.length) return json({ ok: true, inserted: 0, skipped: contacts.length });

    let inserted = 0;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error, count } = await admin
        .from("planipret_contacts")
        .upsert(slice, { onConflict: "user_id,source,phone_normalized", count: "exact" });
      if (error) {
        console.error("[pp-contacts-upsert] chunk failed", error.message);
        return json({ ok: false, error: error.message, inserted }, 500);
      }
      inserted += count ?? slice.length;
    }

    return json({ ok: true, inserted, total: rows.length });
  } catch (e: any) {
    console.error("[pp-contacts-upsert] fatal", e?.message);
    return json({ ok: false, error: e?.message ?? "unknown" }, 500);
  }
});
