// Contrats Maestro par agent + historique de chaque étape.
// Lecture seule : aucune écriture Maestro, aucun SMS.
//
// Source officielle (Scribe docs 2026-09-09) :
//   GET https://client.planipret.com/api/main/contracts?agent_id=&status=&date_from=&date_to=
// Repli historique : GET /api/v1/users/{telecomUserId}/clients (contrats
// imbriqués dans `task_targets.contracts`).
import { adminClient, corsHeaders, getMaestroConfig, json, maestroFetch } from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";
import { listContracts } from "../_shared/maestro-scribe.ts";

const CLIENTS_PATH = (telecomId: string, limit: number) =>
  `/api/v1/users/${encodeURIComponent(telecomId)}/clients?limit=${limit}`;

type TimelineItem = {
  at: string | null;
  kind: "maestro_request" | "call" | "transcript" | "summary" | "coaching" | "maestro_push";
  label: string;
  detail?: string | null;
  ok?: boolean;
};

type ContractRow = {
  contract_id: string;
  contract_number: string | null;
  broker_profile_id: string;
  broker_name: string | null;
  broker_telecom_id: string;
  clients: { id: string; name: string; email: string | null; created: string | null; modified: string | null }[];
  status: string;
  maestro_status?: string | null;
  loan_amt?: string | null;
  rate?: string | null;
  date_closing?: string | null;
  date_maturity?: string | null;
  source: "api" | "clients_fallback";
  last_activity_at: string | null;
  calls_total: number;
  calls_synced: number;
  with_transcript: number;
  with_summary: number;
  with_coaching: number;
  timeline: TimelineItem[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => ({} as any));
  const brokerProfileId: string | null = body?.broker_profile_id ?? null;
  const status: string | null = body?.status ?? null;
  const dateFrom: string | null = body?.date_from ?? null;
  const dateTo: string | null = body?.date_to ?? null;
  const limit = Math.min(Number(body?.limit ?? 500), 500);

  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ ok: false, error: "maestro_not_configured" }, 200);

  let q = admin
    .from("planipret_profiles")
    .select("id, full_name, maestro_telecom_user_id, maestro_broker_id")
    .not("maestro_telecom_user_id", "is", null);
  if (brokerProfileId) q = q.eq("id", brokerProfileId);
  const { data: profiles } = await q.limit(100);
  const brokers = profiles ?? [];
  if (!brokers.length) return json({ ok: true, contracts: [], brokers: [] });

  const contracts: ContractRow[] = [];
  const errors: any[] = [];

  const emptyRow = (p: any, telecomId: string, key: string, number: string | null, source: ContractRow["source"]): ContractRow => ({
    contract_id: key,
    contract_number: number,
    broker_profile_id: p.id,
    broker_name: p.full_name ?? null,
    broker_telecom_id: telecomId,
    clients: [],
    status: "demande Maestro",
    source,
    last_activity_at: null,
    calls_total: 0, calls_synced: 0, with_transcript: 0, with_summary: 0, with_coaching: 0,
    timeline: [],
  });

  for (const p of brokers) {
    const telecomId = String(p.maestro_telecom_user_id);
    const agentId = p.maestro_broker_id ? String(p.maestro_broker_id) : telecomId;
    const byContract = new Map<string, ContractRow>();
    const clientIds: string[] = [];

    // 1) Endpoint officiel.
    const api = await listContracts(cfg, {
      agent_id: agentId,
      status: status ?? undefined,
      date_from: dateFrom && dateTo ? dateFrom : undefined,
      date_to: dateFrom && dateTo ? dateTo : undefined,
      per_page: Math.min(limit, 200),
      order_by: "date_maturity",
      sort: "desc",
    });

    if (api.ok && Array.isArray(api.data) && api.data.length > 0) {
      for (const c of api.data as any[]) {
        const key = String(c?.contract_id ?? c?.id ?? "");
        if (!key) continue;
        const row = emptyRow(p, telecomId, key, c?.number ?? null, "api");
        row.maestro_status = c?.status ?? null;
        row.loan_amt = c?.loan_amt ?? null;
        row.rate = c?.rate ?? null;
        row.date_closing = c?.date_closing ?? null;
        row.date_maturity = c?.date_maturity ?? null;
        for (const cl of Array.isArray(c?.clients) ? c.clients : []) {
          const cid = String(cl?.id ?? "");
          if (cid) clientIds.push(cid);
          row.clients.push({
            id: cid,
            name: `${cl?.first_name ?? ""} ${cl?.last_name ?? ""}`.trim(),
            email: cl?.email ?? null,
            created: c?.created ?? c?.date_entry ?? null,
            modified: c?.modified ?? null,
          });
        }
        byContract.set(key, row);
      }
    } else {
      // 2) Repli : contrats imbriqués dans la liste des clients.
      errors.push({ broker: p.full_name, stage: "contracts_api", status: api.status, error: api.error, endpoint: api.endpoint });
      const res = await maestroFetch(cfg, { path: CLIENTS_PATH(telecomId, limit), token: cfg.key });
      if (!res.ok || !Array.isArray(res.data)) {
        errors.push({ broker: p.full_name, stage: "clients_fallback", status: res.status, endpoint: res.endpoint });
        continue;
      }
      for (const c of res.data as any[]) {
        const cid = String(c?.id ?? "");
        if (cid) clientIds.push(cid);
        const list = c?.task_targets?.contracts ?? [];
        for (const k of Array.isArray(list) ? list : []) {
          const key = String(k?.id ?? "");
          if (!key) continue;
          if (!byContract.has(key)) byContract.set(key, emptyRow(p, telecomId, key, k?.number ?? null, "clients_fallback"));
          byContract.get(key)!.clients.push({
            id: cid,
            name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
            email: c?.email ?? null,
            created: c?.created ?? null,
            modified: c?.modified ?? null,
          });
        }
      }
    }

    // Réparation des lignes sans client : l'endpoint officiel renvoie parfois un
    // contrat sans bloc `clients`. On complète via la liste des clients du
    // courtier (contrats imbriqués dans task_targets.contracts).
    const orphans = Array.from(byContract.values()).filter((r) => r.clients.length === 0);
    if (orphans.length) {
      const res = await maestroFetch(cfg, { path: CLIENTS_PATH(telecomId, limit), token: cfg.key });
      if (res.ok && Array.isArray(res.data)) {
        const byContractClients = new Map<string, ContractRow["clients"]>();
        for (const c of res.data as any[]) {
          const cid = String(c?.id ?? "");
          const list = c?.task_targets?.contracts ?? [];
          for (const k of Array.isArray(list) ? list : []) {
            const key = String(k?.id ?? "");
            if (!key) continue;
            if (!byContractClients.has(key)) byContractClients.set(key, []);
            byContractClients.get(key)!.push({
              id: cid,
              name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
              email: c?.email ?? null,
              created: c?.created ?? null,
              modified: c?.modified ?? null,
            });
          }
        }
        for (const row of orphans) {
          const found = byContractClients.get(row.contract_id) ?? [];
          for (const cl of found) {
            if (cl.id) clientIds.push(cl.id);
            row.clients.push(cl);
          }
        }
      } else {
        errors.push({ broker: p.full_name, stage: "orphan_repair", status: res.status, endpoint: res.endpoint });
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
      row.status = row.clients.length === 0
        ? "sans client"
        : row.calls_total === 0
        ? "aucun appel"
        : row.calls_synced === row.calls_total
          ? "complet"
          : "en attente Maestro";
      contracts.push(row);
    }
  }

  contracts.sort((a, b) => String(b.last_activity_at ?? "").localeCompare(String(a.last_activity_at ?? "")));

  // Persistance en base : l'écran Contrats lit ensuite planipret_contracts.
  let persisted = 0;
  if (contracts.length) {
    const rows = contracts.map((c) => ({
      contract_id: c.contract_id,
      contract_number: c.contract_number,
      broker_profile_id: c.broker_profile_id,
      broker_name: c.broker_name,
      maestro_status: c.maestro_status ?? null,
      status: c.status,
      loan_amt: c.loan_amt != null && String(c.loan_amt).trim() !== "" ? Number(String(c.loan_amt).replace(/[^0-9.-]/g, "")) || null : null,
      rate: c.rate ?? null,
      date_closing: c.date_closing || null,
      date_maturity: c.date_maturity || null,
      clients: c.clients,
      source: c.source,
      last_activity_at: c.last_activity_at,
      calls_total: c.calls_total,
      calls_synced: c.calls_synced,
      with_transcript: c.with_transcript,
      with_summary: c.with_summary,
      with_coaching: c.with_coaching,
      raw: { timeline: c.timeline.slice(-60) },
      synced_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: upErr } = await admin
        .from("planipret_contracts")
        .upsert(chunk, { onConflict: "contract_id,broker_profile_id" });
      if (upErr) errors.push({ stage: "persist", error: upErr.message });
      else persisted += chunk.length;
    }
  }

  return json({
    ok: true,
    endpoint: `${cfg.url}/api/main/contracts?agent_id={agentId}`,
    brokers: brokers.map((b: any) => ({ id: b.id, name: b.full_name, telecom_id: b.maestro_telecom_user_id })),
    contracts,
    persisted,
    errors,
  });
});
