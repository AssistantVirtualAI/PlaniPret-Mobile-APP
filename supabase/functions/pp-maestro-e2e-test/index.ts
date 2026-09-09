// pp-maestro-e2e-test — vérification bout en bout de la liaison Maestro.
//
// POST { user_id?: uuid, write_test?: boolean }
//   - un courtier ne peut tester que son propre compte
//   - un admin Planiprêt peut tester n'importe quel courtier
//
// Étapes:
//   1. profil + identifiant courtier Maestro
//   2. lecture identité   GET /api/v1/users/{brokerId}
//   3. lecture clients    GET /api/v1/users/{brokerId}/clients
//   4. lecture appels     GET /api/v1/users/{brokerId}/calls
//   5. écriture réelle    maestro-sync-call sur le dernier appel du courtier
//   6. comptage 14 jours  appels / textos / enregistrements / résumés IA
import {
  adminClient,
  corsHeaders,
  getMaestroConfig,
  json,
  maestroFetch,
  telecomAuth,
} from "../_shared/maestro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Step = {
  key: string;
  label: string;
  ok: boolean;
  status?: number;
  detail?: string;
  data?: unknown;
};

const since14 = () => new Date(Date.now() - 14 * 86400_000).toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = adminClient();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isService = token && token === SERVICE_ROLE;

  let callerId: string | null = null;
  let isAdmin = false;
  if (!isService) {
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    callerId = u.user.id;
    const { data: adminFlag } = await admin.rpc("is_planipret_admin", { _user_id: callerId });
    isAdmin = adminFlag === true;
  }

  const body = await req.json().catch(() => ({} as any));
  const targetId: string | null = body?.user_id ?? callerId;
  if (!targetId) return json({ error: "user_id_required" }, 400);
  if (!isService && !isAdmin && targetId !== callerId) return json({ error: "forbidden" }, 403);
  const writeTest = body?.write_test !== false;

  const steps: Step[] = [];
  const push = (s: Step) => { steps.push(s); return s; };

  // ── 1. Profil courtier ────────────────────────────────────────────────
  const { data: prof } = await admin
    .from("planipret_profiles")
    .select("id, user_id, full_name, email, extension, maestro_broker_id, maestro_connected, maestro_last_sync_at, maestro_token_expires_at")
    .or(`user_id.eq.${targetId},id.eq.${targetId}`)
    .limit(1)
    .maybeSingle();

  push({
    key: "profile",
    label: "Profil courtier",
    ok: !!prof,
    detail: prof ? `${prof.full_name ?? prof.email ?? targetId} — poste ${prof.extension ?? "—"}` : "profil introuvable",
  });
  if (!prof) return json({ success: false, steps });

  const expiresAt = prof.maestro_token_expires_at ? Date.parse(prof.maestro_token_expires_at) : 0;
  push({
    key: "authorization",
    label: "Autorisation Maestro",
    ok: !!prof.maestro_broker_id && !!prof.maestro_connected,
    detail: prof.maestro_broker_id
      ? `ID Maestro ${prof.maestro_broker_id}${expiresAt ? ` — jeton valide jusqu'au ${new Date(expiresAt).toLocaleString("fr-CA")}` : ""}`
      : "aucune autorisation Maestro — le courtier doit se connecter depuis son compte",
  });

  const cfg = await getMaestroConfig(admin);
  const auth = await telecomAuth(admin, String(prof.user_id ?? targetId), false);
  const brokerId = auth.brokerId ?? prof.maestro_broker_id ?? null;

  if (!cfg.url) push({ key: "config", label: "Configuration Maestro", ok: false, detail: "URL Maestro non configurée" });

  // ── 2-4. Lectures ─────────────────────────────────────────────────────
  const read = async (key: string, label: string, path: string) => {
    if (!cfg.url || !brokerId) return push({ key, label, ok: false, detail: "identifiant courtier manquant" });
    try {
      const r: any = await maestroFetch(cfg, { method: "GET", path, token: auth.token, machine: auth.machine });
      const d = r.data;
      const list = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.clients) ? d.clients : (Array.isArray(d?.calls) ? d.calls : null)));
      return push({
        key,
        label,
        ok: !!r.ok,
        status: r.status,
        detail: r.ok
          ? (list ? `${d?.total_count ?? d?.total ?? list.length} éléments` : "réponse reçue")
          : `refus Maestro (HTTP ${r.status})`,
      });
    } catch (e: any) {
      return push({ key, label, ok: false, detail: e?.message ?? "erreur réseau" });
    }
  };

  const b = encodeURIComponent(String(brokerId ?? ""));
  await read("identity", "Identité Maestro", `/api/v1/users/${b}`);
  await read("clients", "Lecture des clients", `/api/v1/users/${b}/clients?limit=1`);
  await read("calls_read", "Lecture des appels", `/api/v1/users/${b}/calls?limit=1`);

  // ── 5. Écriture réelle sur le dernier appel ───────────────────────────
  let writeCallId: string | null = null;
  if (writeTest) {
    const { data: lastCall } = await admin
      .from("planipret_phone_calls")
      .select("id, created_at, maestro_call_id, duration_seconds")
      .eq("user_id", prof.user_id ?? targetId)
      .gte("duration_seconds", 1)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastCall) {
      push({ key: "write", label: "Écriture d'un appel dans Maestro", ok: false, detail: "aucun appel récent à publier" });
    } else {
      writeCallId = lastCall.id;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/maestro-sync-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ call_id: lastCall.id, force: true }),
        });
        const d: any = await r.json().catch(() => ({}));
        push({
          key: "write",
          label: "Écriture d'un appel dans Maestro",
          ok: d?.success === true,
          status: r.status,
          detail: d?.success
            ? `appel publié sous le courtier (fiche Maestro ${d?.maestro_call_id ?? "—"})`
            : `échec: ${d?.error ?? `HTTP ${r.status}`}`,
          data: d?.steps ?? null,
        });
      } catch (e: any) {
        push({ key: "write", label: "Écriture d'un appel dans Maestro", ok: false, detail: e?.message });
      }
    }
  }

  // ── 6. Comptages réels ────────────────────────────────────────────────
  const uid = String(prof.user_id ?? targetId);
  const s = since14();
  const count = async (table: string, build: (q: any) => any) => {
    const { count: c } = await build(
      admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", uid),
    );
    return c ?? 0;
  };

  const [calls, callsLinked, msgs, msgsSynced, recSynced, recPending, aiCalls] = await Promise.all([
    count("planipret_phone_calls", (q) => q.gte("created_at", s)),
    count("planipret_phone_calls", (q) => q.gte("created_at", s).not("maestro_call_id", "is", null)),
    count("planipret_phone_messages", (q) => q.gte("created_at", s)),
    count("planipret_phone_messages", (q) => q.gte("created_at", s).eq("maestro_synced", true)),
    count("planipret_recording_uploads", (q) => q.gte("created_at", s).eq("status", "synced")),
    count("planipret_recording_uploads", (q) => q.gte("created_at", s).eq("status", "pending")),
    count("planipret_phone_calls", (q) => q.gte("created_at", s).not("ai_summary", "is", null)),
  ]);

  const { data: pushes } = await admin
    .from("planipret_pipeline_logs")
    .select("step, status")
    .eq("user_id", uid)
    .gte("created_at", s)
    .in("step", ["recording_push", "ai_summary_push", "transcript_push", "message_push"])
    .limit(5000);
  const pushCounts: Record<string, { ok: number; error: number }> = {};
  for (const p of pushes ?? []) {
    const k = String((p as any).step);
    pushCounts[k] ??= { ok: 0, error: 0 };
    if ((p as any).status === "success") pushCounts[k].ok += 1;
    else if ((p as any).status === "error") pushCounts[k].error += 1;
  }

  const totals = {
    calls, calls_linked: callsLinked,
    messages: msgs, messages_synced: msgsSynced,
    recordings_synced: recSynced, recordings_pending: recPending,
    ai_summaries: aiCalls,
    pushes: pushCounts,
  };

  const success = steps.every((x) => x.ok);
  return json({
    success,
    broker: {
      user_id: uid,
      name: prof.full_name ?? prof.email,
      maestro_broker_id: brokerId,
      last_sync_at: prof.maestro_last_sync_at,
    },
    tested_call_id: writeCallId,
    steps,
    totals,
  });
});
