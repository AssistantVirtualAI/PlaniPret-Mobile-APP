// pp-admin-attach-extension — Admin-only. Lists phone extensions whose calls
// have no broker owner, and attaches them to a chosen broker (back-fills the
// existing orphan calls and stores the mapping on the broker profile so future
// calls are attributed automatically).
//
// POST { action: "list" }
// POST { action: "assign", extension: "1004", user_id: "<uuid>", days?: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── Admin gate ──────────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    admin.rpc("is_planipret_admin", { _user_id: uid }),
    admin.rpc("is_super_admin", { _user_id: uid }),
  ]);
  if (!isAdmin && !isSuper) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "list");
  const days = Math.min(180, Math.max(1, Number(body?.days ?? 90)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // Brokers that can actually receive the calls in Maestro.
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("user_id, full_name, email, extension, maestro_connected, maestro_broker_id")
    .not("user_id", "is", null)
    .limit(1000);

  const brokers = (profiles ?? []).map((p: any) => ({
    user_id: String(p.user_id),
    name: p.full_name || p.email || String(p.user_id).slice(0, 8),
    extension: p.extension ?? null,
    connected: !!p.maestro_connected,
    broker_id: p.maestro_broker_id ?? null,
  }));

  if (action === "list") {
    const { data: orphans } = await admin
      .from("planipret_phone_calls")
      .select("id, extension, direction, started_at, created_at, duration_seconds")
      .is("user_id", null)
      .gte("created_at", since)
      .limit(5000);

    const byExt = new Map<string, { extension: string; calls: number; last: string | null; talk: number }>();
    for (const c of (orphans ?? []) as any[]) {
      const ext = String(c.extension ?? "").trim() || "—";
      const cur = byExt.get(ext) ?? { extension: ext, calls: 0, last: null, talk: 0 };
      cur.calls += 1;
      cur.talk += Number(c.duration_seconds ?? 0);
      const when = c.started_at ?? c.created_at ?? null;
      if (when && (!cur.last || when > cur.last)) cur.last = when;
      byExt.set(ext, cur);
    }

    return json({
      success: true,
      days,
      brokers,
      orphan_extensions: [...byExt.values()].sort((a, b) => b.calls - a.calls),
      orphan_calls: (orphans ?? []).length,
    });
  }

  if (action === "assign") {
    const extension = String(body?.extension ?? "").trim();
    const targetUser = String(body?.user_id ?? "").trim();
    if (!extension || extension === "—") return json({ error: "extension_required" }, 400);
    if (!targetUser) return json({ error: "user_id_required" }, 400);
    const broker = brokers.find((b) => b.user_id === targetUser);
    if (!broker) return json({ error: "broker_not_found" }, 400);

    const { data: updated, error } = await admin
      .from("planipret_phone_calls")
      .update({ user_id: targetUser })
      .is("user_id", null)
      .eq("extension", extension)
      .gte("created_at", since)
      .select("id");
    if (error) return json({ error: error.message }, 500);

    // Persist the mapping so the CDR pipeline attributes future calls itself.
    if (!broker.extension) {
      await admin.from("planipret_profiles").update({ extension }).eq("user_id", targetUser);
    }

    // Re-arm the Maestro push for the calls we just attributed.
    const ids = (updated ?? []).map((r: any) => r.id);
    if (ids.length) {
      fetch(`${SUPABASE_URL}/functions/v1/maestro-cdr-retry-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ call_ids: ids.slice(0, 50), limit: 50 }),
      }).catch(() => {});
    }

    return json({ success: true, extension, user_id: targetUser, attached: ids.length });
  }

  return json({ error: "unknown_action" }, 400);
});
