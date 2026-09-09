// Contrats Maestro par agent + historique de chaque étape.
// Lecture seule : aucune écriture Maestro, aucun SMS.
import { adminClient, corsHeaders, getMaestroConfig, json, maestroFetch } from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";

// Route réellement exposée par Maestro (validée en production) :
// GET {base}/api/v1/users/{telecomUserId}/clients?machine=1
// Les contrats sont renvoyés dans `task_targets.contracts` de chaque client.
const CLIENTS_PATH = (telecomId: string, limit: number) =>
  `/api/v1/users/${encodeURIComponent(telecomId)}/clients?limit=${limit}`;

type ContractRow = {
  contract_id: string;
  contract_number: string | null;
  broker_profile_id: string;
  broker_name: string | null;
  broker_telecom_id: string;
  clients: { id: string; name: string; email: string | null; created: string | null; modified: string | null }[];
  status: string;
  last_activity_at: string | null;
  calls_total: number;
  calls_synced: number;
  with_transcript: number;
  with_summary: number;
  with_coaching: number;
  timeline: {
    at: string | null;
    kind: "maestro_request" | "call" | "transcript" | "summary" | "coaching" | "maestro_push";
    label: string;
    detail?: string | null;
    ok?: boolean;
  }[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => ({} as any));
  const brokerProfileId: string | null = body?.broker_profile_id ?? null;
  const limit = Math.min(Number(body?.limit ?? 500), 500);

  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ ok: false, error: "maestro_not_configured" }, 200);

  let q = admin
    .from("planipret_profiles")
    .select("id, full_name, maestro_telecom_user_id")
    .not("maestro_telecom_user_id", "is", null);
  if (brokerProfileId) q = q.eq("id", brokerProfileId);
  const { data: profiles } = await q.limit(100);
  const brokers = profiles ?? [];
  if (!brokers.length) return json({ ok: true, contracts: [], brokers: [] });

  const contracts: ContractRow[] = [];
  const errors: any[] = [];

  for (const p of brokers) {
    const telecomId = String(p.maestro_telecom_user_id);
    const res = await maestroFetch(cfg, { path: CLIENTS_PATH(telecomId, limit), token: cfg.key });
    if (!res.ok || !Array.isArray(res.data)) {
      errors.push({ broker: p.full_name, status: res.status, endpoint: res.endpoint });
      continue;
    }

    // Regroupe clients par contrat Maestro.
    const byContract = new Map<string, ContractRow>();
    const clientIds: string[] = [];
    for (const c of res.data as any[]) {
      const cid = String(c?.id ?? "");
      if (cid) clientIds.push(cid);
      const list = c?.task_targets?.contracts ?? [];
      for (const k of Array.isArray(list) ? list : []) {
        const key = String(k?.id ?? "");
        if (!key) continue;
        if (!byContract.has(key)) {
          byContract.set(key, {
            contract_id: key,
            contract_number: k?.number ?? null,
            broker_profile_id: p.id,
            broker_name: p.full_name ?? null,
            broker_telecom_id: telecomId,
            clients: [],
            status: "demande Maestro",
            last_activity_at: null,
            calls_total: 0, calls_synced: 0, with_transcript: 0, with_summary: 0, with_coaching: 0,
            timeline: [],
          });
        }
        const row = byContract.get(key)!;
        row.clients.push({
          id: cid,
          name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
          email: c?.email ?? null,
          created: c?.created ?? null,
          modified: c?.modified ?? null,
        });
      }
    }

    // Appels locaux rattachés aux clients Maestro de ce courtier.
    const callsByClient = new Map<string, any[]>();
    if (clientIds.length) {
      for (let i = 0; i < clientIds.length; i += 200) {
        const chunk = clientIds.slice(i, i + 200);
        const { data: calls } = await admin
          .from("planipret_phone_calls")
          .select("id, maestro_client_id, maestro_call_id, direction, started_at, created_at, duration_seconds, transcript, ai_summary, ai_coaching, maestro_media_synced_at, maestro_media_sync_error")
          .eq("user_id", p.id)
          .in("maestro_client_id", chunk)
          .order("started_at", { ascending: true })
          .limit(2000);
        for (const call of calls ?? []) {
          const key = String(call.maestro_client_id);
          if (!callsByClient.has(key)) callsByClient.set(key, []);
          callsByClient.get(key)!.push(call);
        }
      }
    }

    for (const row of byContract.values()) {
      for (const cl of row.clients) {
        row.timeline.push({
          at: cl.created,
          kind: "maestro_request",
          label: `Demande Maestro — ${cl.name || "client"}`,
          detail: row.contract_number ? `Dossier ${row.contract_number}` : `Contrat ${row.contract_id}`,
          ok: true,
        });
        for (const call of callsByClient.get(cl.id) ?? []) {
          const at = call.started_at ?? call.created_at;
          row.calls_total++;
          row.timeline.push({
            at,
            kind: "call",
            label: `Appel ${call.direction === "inbound" ? "entrant" : "sortant"} — ${cl.name || "client"}`,
            detail: `${Math.round((call.duration_seconds ?? 0) / 60)} min`,
            ok: true,
          });
          if (call.transcript) {
            row.with_transcript++;
            row.timeline.push({ at, kind: "transcript", label: "Transcription", detail: String(call.transcript).slice(0, 240), ok: true });
          }
          if (call.ai_summary) {
            row.with_summary++;
            row.timeline.push({ at, kind: "summary", label: "Résumé IA", detail: String(call.ai_summary).slice(0, 400), ok: true });
          }
          if (call.ai_coaching) {
            row.with_coaching++;
            row.timeline.push({ at, kind: "coaching", label: "Coaching IA", detail: String(call.ai_coaching).slice(0, 400), ok: true });
          }
          if (call.maestro_call_id) row.calls_synced++;
          row.timeline.push({
            at: call.maestro_media_synced_at ?? at,
            kind: "maestro_push",
            label: call.maestro_call_id ? "Remonté dans Maestro" : "En attente d'envoi vers Maestro",
            detail: call.maestro_media_sync_error ?? (call.maestro_call_id ? `Communication ${call.maestro_call_id}` : null),
            ok: !!call.maestro_call_id,
          });
        }
      }
      row.timeline.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
      row.last_activity_at = row.timeline.length ? row.timeline[row.timeline.length - 1].at : null;
      row.status = row.calls_total === 0
        ? "aucun appel"
        : row.calls_synced === row.calls_total
          ? "complet"
          : "en attente Maestro";
      contracts.push(row);
    }
  }

  contracts.sort((a, b) => String(b.last_activity_at ?? "").localeCompare(String(a.last_activity_at ?? "")));

  return json({
    ok: true,
    endpoint: `${cfg.url}/api/v1/users/{telecomUserId}/clients?machine=1`,
    brokers: brokers.map((b: any) => ({ id: b.id, name: b.full_name, telecom_id: b.maestro_telecom_user_id })),
    contracts,
    errors,
  });
});
