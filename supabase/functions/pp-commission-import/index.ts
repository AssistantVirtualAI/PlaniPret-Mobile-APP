import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { agentKey, buildResolver, splitName, type AliasRow, type BrokerDir } from "../_shared/broker-identity.ts";
import { claudeText } from "../_shared/anthropic.ts";
import {
  CANONICAL_FIELDS,
  FIELD_LABELS,
  KNOWN_COMMISSION_TYPES,
  buildColumnMap,
  normaliseCommissionType,
  norm,
  rowKey,
} from "../_shared/commission-mapping.ts";


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$\s,\u00a0]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);
const isoDate = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const REG = "planipret_commission_register";
const ALIAS = "planipret_commission_broker_aliases";
const MAP = "planipret_commission_mappings";

async function loadMappings(admin: any) {
  const { data } = await admin.from(MAP).select("kind,source_key,target_value,target_user_id,maestro_broker_id");
  const rows = (data ?? []) as any[];
  const columns: Record<string, string> = {};
  const commissionTypes: Record<string, string> = {};
  const brokers: Record<string, any> = {};
  for (const r of rows) {
    if (r.kind === "column") columns[r.source_key] = r.target_value;
    else if (r.kind === "commission_type") commissionTypes[r.source_key] = r.target_value;
    else if (r.kind === "broker") brokers[r.source_key] = r;
  }
  return { columns, commissionTypes, brokers };
}


async function loadResolver(admin: any) {
  const { data: profiles } = await admin
    .from("planipret_profiles")
    .select("user_id,full_name,email,first_name,last_name,maestro_broker_id");
  const { data: aliases } = await admin
    .from(ALIAS)
    .select("agent_key,broker_user_id,maestro_broker_id,first_name,last_name");
  return {
    profiles: (profiles ?? []) as BrokerDir[],
    resolve: buildResolver((profiles ?? []) as BrokerDir[], (aliases ?? []) as AliasRow[]),
  };
}

async function fetchAllRows(admin: any, cols: string) {
  const out: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(REG).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: isAdminData } = await admin.rpc("is_planipret_admin", { _user_id: user.id });
    const { data: isSuperData } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isAdminData && !isSuperData) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "import");

    if (action === "summary" || action === "validate") {
      const rows = await fetchAllRows(
        admin,
        "source_row,fiscal_year,broker_user_id,agent_name,agent_key,first_name,last_name,maestro_broker_id,match_method,loan_amt,amount,commission_type,date_trans,number,institution,mortgage_type",
      );
      const byYear: Record<string, number> = {};
      const brokers = new Map<string, any>();
      const unmatchedMap = new Map<string, any>();
      let totalVolume = 0;
      let totalCommission = 0;
      let noDate = 0;
      const KNOWN_TYPES = new Set(["base", "bonus", "bonus2", "perform", "adjustment", "ajustement"]);
      const anomalies: any[] = [];
      const pushAnomaly = (r: any, kind: string, detail: string) => {
        if (anomalies.length < 500) {
          anomalies.push({ kind, detail, sourceRow: r.source_row ?? null, number: r.number ?? null, agent: r.agent_name ?? null, year: r.fiscal_year ?? null });
        }
      };
      const anomalyCounts: Record<string, number> = {};
      const bump = (k: string) => { anomalyCounts[k] = (anomalyCounts[k] ?? 0) + 1; };
      const dealSet = new Set<string>();
      const volSet = new Set<string>();

      for (const r of rows) {
        byYear[r.fiscal_year] = (byYear[r.fiscal_year] ?? 0) + 1;
        if (!r.date_trans) { noDate++; bump("date_manquante"); pushAnomaly(r, "date_manquante", "date_trans absente"); }
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date_trans))) { bump("date_invalide"); pushAnomaly(r, "date_invalide", String(r.date_trans)); }
        if (r.amount !== null && r.amount !== undefined && !Number.isFinite(Number(r.amount))) { bump("montant_non_numerique"); pushAnomaly(r, "montant_non_numerique", String(r.amount)); }
        if (r.loan_amt !== null && r.loan_amt !== undefined && !Number.isFinite(Number(r.loan_amt))) { bump("loan_amt_non_numerique"); pushAnomaly(r, "loan_amt_non_numerique", String(r.loan_amt)); }
        const ct = String(r.commission_type ?? "").trim().toLowerCase();
        if (!ct) { bump("type_commission_manquant"); pushAnomaly(r, "type_commission_manquant", ""); }
        else if (!KNOWN_TYPES.has(ct)) { bump("type_commission_inconnu"); pushAnomaly(r, "type_commission_inconnu", ct); }
        if (ct === "base" && Number(r.loan_amt ?? 0) <= 0) { bump("base_sans_montant_pret"); pushAnomaly(r, "base_sans_montant_pret", String(r.loan_amt ?? "")); }
        if (!r.number) { bump("contrat_manquant"); pushAnomaly(r, "contrat_manquant", ""); }
        if (!r.agent_name) { bump("agent_manquant"); pushAnomaly(r, "agent_manquant", ""); }
        totalCommission += Number(r.amount ?? 0);
        if (r.commission_type === "base" && Number(r.loan_amt) > 0) {
          const vk = `${r.number}|${r.institution ?? ""}|${r.mortgage_type ?? ""}|${Number(r.loan_amt).toFixed(2)}`;
          if (!volSet.has(vk)) { volSet.add(vk); totalVolume += Number(r.loan_amt ?? 0); }
        }
        if (r.commission_type === "base" && r.number) dealSet.add(String(r.number));

        const key = r.agent_key ?? agentKey(r.agent_name) ?? "(inconnu)";
        if (r.broker_user_id) {
          const b = brokers.get(key) ?? {
            agent_key: key,
            raw_name: r.agent_name,
            broker_user_id: r.broker_user_id,
            first_name: r.first_name,
            last_name: r.last_name,
            maestro_broker_id: r.maestro_broker_id,
            match_method: r.match_method,
            rows: 0, volume: 0, commission: 0, deals: new Set<string>(),
          };
          b.rows++;
          b.commission += Number(r.amount ?? 0);
          if (r.commission_type === "base" && Number(r.loan_amt) > 0) b.volume += Number(r.loan_amt ?? 0);
          if (r.commission_type === "base" && r.number) b.deals.add(String(r.number));
          brokers.set(key, b);
        } else if (r.agent_name) {
          const u = unmatchedMap.get(key) ?? { agent_key: key, raw_name: r.agent_name, rows: 0, commission: 0, volume: 0 };
          u.rows++;
          u.commission += Number(r.amount ?? 0);
          if (r.commission_type === "base") u.volume += Number(r.loan_amt ?? 0);
          unmatchedMap.set(key, u);
        }
      }

      const brokerList = [...brokers.values()]
        .map((b) => ({ ...b, deals: b.deals.size }))
        .sort((a, b) => b.volume - a.volume);
      const unmatched = [...unmatchedMap.values()].sort((a, b) => b.rows - a.rows);

      const { data: imports } = await admin
        .from("planipret_commission_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const dispatchedRows = rows.filter((r: any) => r.broker_user_id).length;
      return json({
        ok: true,
        total: rows.length,
        byYear,
        unmatched: unmatched.map((u) => u.raw_name),
        unmatchedDetail: unmatched,
        brokers: brokerList,
        imports: imports ?? [],
        report: {
          rows: rows.length,
          dispatchedRows,
          orphanRows: rows.length - dispatchedRows,
          noDate,
          totalVolume,
          totalCommission,
          totalDeals: dealSet.size,
          brokerVolumeSum: brokerList.reduce((s: number, b: any) => s + b.volume, 0),
          brokerCommissionSum: brokerList.reduce((s: number, b: any) => s + b.commission, 0),
          brokerDealsSum: brokerList.reduce((s: number, b: any) => s + b.deals, 0),
          withMaestroId: rows.filter((r: any) => r.maestro_broker_id).length,
          withNames: rows.filter((r: any) => r.first_name || r.last_name).length,
          anomalyCounts,
          anomalyTotal: Object.values(anomalyCounts).reduce((a: number, b: number) => a + b, 0),
        },
        anomalies,
      });
    }

    if (action === "alias.upsert") {
      const rawName = String(body?.rawName ?? "").trim();
      const key = agentKey(rawName);
      if (!key) return json({ error: "invalid_name" }, 400);
      const sp = splitName(rawName);
      const { error } = await admin.from(ALIAS).upsert({
        agent_key: key,
        raw_name: rawName,
        broker_user_id: body?.brokerUserId ?? null,
        maestro_broker_id: body?.maestroBrokerId ? String(body.maestroBrokerId).trim() : null,
        first_name: body?.firstName ?? sp.first,
        last_name: body?.lastName ?? sp.last,
        created_by: user.id,
      }, { onConflict: "agent_key" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, agent_key: key });
    }

    if (action === "brokers.list") {
      const { data } = await admin
        .from("planipret_profiles")
        .select("user_id,full_name,email,first_name,last_name,maestro_broker_id")
        .order("full_name");
      return json({ ok: true, brokers: data ?? [] });
    }

    if (action === "alias.list") {
      const { data } = await admin.from(ALIAS).select("*").order("raw_name");
      return json({ ok: true, aliases: data ?? [] });
    }

    // ---------- Mapping (columns A:S, commission types, broker labels) ----------
    if (action === "mapping.get") {
      const { data } = await admin.from(MAP).select("*").order("kind").order("source_key");
      const rows = (data ?? []) as any[];
      return json({
        ok: true,
        mappings: rows,
        columns: Object.fromEntries(rows.filter((r) => r.kind === "column").map((r) => [r.source_key, r.target_value])),
        commissionTypes: Object.fromEntries(rows.filter((r) => r.kind === "commission_type").map((r) => [r.source_key, r.target_value])),
        brokers: rows.filter((r) => r.kind === "broker"),
        fields: CANONICAL_FIELDS,
        fieldLabels: FIELD_LABELS,
        knownTypes: KNOWN_COMMISSION_TYPES,
      });
    }

    if (action === "mapping.upsert") {
      const items: any[] = Array.isArray(body?.items) ? body.items : [body?.item].filter(Boolean);
      if (!items.length) return json({ error: "no_items" }, 400);
      const payload = items.map((it) => ({
        kind: String(it.kind),
        scope: String(it.scope ?? "default"),
        source_key: norm(it.sourceKey ?? it.source_key),
        source_label: str(it.sourceLabel ?? it.source_label ?? it.sourceKey ?? it.source_key),
        target_value: str(it.targetValue ?? it.target_value),
        target_user_id: it.targetUserId ?? it.target_user_id ?? null,
        maestro_broker_id: str(it.maestroBrokerId ?? it.maestro_broker_id),
        created_by: user.id,
      })).filter((p) => p.source_key && ["column", "commission_type", "broker"].includes(p.kind));
      if (!payload.length) return json({ error: "invalid_items" }, 400);
      const { error } = await admin.from(MAP).upsert(payload, { onConflict: "kind,scope,source_key" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, saved: payload.length });
    }

    if (action === "mapping.delete") {
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "missing_id" }, 400);
      const { error } = await admin.from(MAP).delete().eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ---------- Analyze: propose a mapping for the uploaded workbook ----------
    if (action === "analyze") {
      const sheets: any[] = Array.isArray(body?.sheets) ? body.sheets : [];
      if (!sheets.length) return json({ error: "no_sheets" }, 400);
      const saved = await loadMappings(admin);

      const headerSet: string[] = Array.from(new Set(sheets.flatMap((s: any) => (s.headers ?? []).map((h: any) => String(h ?? "").trim()))));
      const { map, unknown } = buildColumnMap(headerSet, saved.columns);

      const typeLabels: string[] = Array.from(new Set(
        sheets.flatMap((s: any) => (s.commissionTypeSamples ?? []).map((t: any) => String(t ?? "").trim())),
      )).filter(Boolean).slice(0, 120);
      const typeMap: Record<string, { value: string | null; known: boolean }> = {};
      const unknownTypes: string[] = [];
      for (const t of typeLabels) {
        const r = normaliseCommissionType(t, saved.commissionTypes);
        typeMap[t] = r;
        if (!r.known) unknownTypes.push(t);
      }

      let ai: any = null;
      if (unknown.length || unknownTypes.length) {
        try {
          const samples = sheets.slice(0, 6).map((s: any) => ({
            sheet: s.name,
            headers: (s.headers ?? []).slice(0, 40),
            rows: (s.samples ?? []).slice(0, 3),
          }));
          const text = await claudeText(
            [
              "Tu es un expert en registres de commissions hypothécaires (Planiprêt).",
              "On te donne les entêtes et quelques lignes d'un classeur Excel.",
              `Champs cibles possibles: ${CANONICAL_FIELDS.join(", ")} ou "__ignore__".`,
              `Types de commission normalisés possibles: ${KNOWN_COMMISSION_TYPES.join(", ")} ou "other".`,
              'Réponds UNIQUEMENT en JSON: {"columns":{"<entete brute>":"<champ>"},"commissionTypes":{"<libelle brut>":"<type>"},"notes":["..."]}',
            ].join("\n"),
            JSON.stringify({ unknownHeaders: unknown, unknownCommissionTypes: unknownTypes, samples }).slice(0, 16000),
            { model: "claude-sonnet-4-5-20250929", max_tokens: 1200, temperature: 0, label: "commission-mapping" },
          );
          const m = text?.match(/\{[\s\S]*\}/);
          if (m) ai = JSON.parse(m[0]);
        } catch (e) {
          console.error("analyze ai error", e);
        }
      }

      const suggestions: Record<string, string> = {};
      for (const [h, f] of Object.entries(map)) if (f) suggestions[h] = f;
      if (ai?.columns) {
        for (const [h, f] of Object.entries(ai.columns as Record<string, string>)) {
          if (!suggestions[h] && ([...CANONICAL_FIELDS, "__ignore__"] as string[]).includes(String(f))) suggestions[h] = String(f);
        }
      }
      const typeSuggestions: Record<string, string> = {};
      for (const [t, r] of Object.entries(typeMap)) if (r.value) typeSuggestions[t] = r.value;
      if (ai?.commissionTypes) {
        for (const [t, v] of Object.entries(ai.commissionTypes as Record<string, string>)) {
          if (([...KNOWN_COMMISSION_TYPES, "other"] as string[]).includes(String(v))) typeSuggestions[t] = String(v);
        }
      }

      return json({
        ok: true,
        headers: headerSet,
        columns: suggestions,
        unknownHeaders: unknown.filter((h) => !suggestions[h]),
        commissionTypes: typeSuggestions,
        unknownCommissionTypes: unknownTypes.filter((t) => !typeSuggestions[t] || typeSuggestions[t] === "other"),
        notes: ai?.notes ?? [],
        aiUsed: !!ai,
        savedColumns: saved.columns,
        savedCommissionTypes: saved.commissionTypes,
        fields: CANONICAL_FIELDS,
        fieldLabels: FIELD_LABELS,
        knownTypes: KNOWN_COMMISSION_TYPES,
      });
    }

    // ---------- Remap: re-apply saved mappings to rows already imported ----------
    if (action === "remap") {
      const saved = await loadMappings(admin);
      const { resolve } = await loadResolver(admin);
      const rows = await fetchAllRows(admin, "id,agent_name,maestro_broker_id,commission_type,raw");
      let updated = 0;
      let unmappedCount = 0;
      const CH = 200;
      for (let i = 0; i < rows.length; i += CH) {
        const slice = rows.slice(i, i + CH);
        await Promise.all(slice.map(async (r: any) => {
          const rawType = r.raw?.commission_type ?? r.commission_type;
          const t = normaliseCommissionType(rawType, saved.commissionTypes);
          const rawAgent = r.raw?.agent_name ?? r.agent_name;
          const res = resolve(rawAgent, r.maestro_broker_id ?? r.raw?.maestro_broker_id ?? null);
          const mapStatus = res.broker_user_id && t.known ? "ok" : "unmapped";
          if (mapStatus === "unmapped") unmappedCount++;
          const { error } = await admin.from(REG).update({
            commission_type: t.value,
            broker_user_id: res.broker_user_id,
            first_name: res.first_name,
            last_name: res.last_name,
            maestro_broker_id: res.maestro_broker_id,
            match_method: res.match_method,
            agent_key: agentKey(rawAgent),
            map_status: mapStatus,
          }).eq("id", r.id);
          if (!error) updated++;
        }));
      }
      return json({ ok: true, updated, unmapped: unmappedCount, total: rows.length });
    }

    if (action === "redispatch") {

      const { resolve } = await loadResolver(admin);
      const rows = await fetchAllRows(admin, "id,agent_name,target_name,maestro_broker_id,cabinet");
      let updated = 0;
      const CH = 200;
      for (let i = 0; i < rows.length; i += CH) {
        const slice = rows.slice(i, i + CH);
        await Promise.all(slice.map(async (r: any) => {
          const hint = r.maestro_broker_id ?? r.cabinet ?? null;
          let res = resolve(r.agent_name, hint);
          if (!res.broker_user_id && r.target_name && r.target_name !== r.agent_name) {
            const alt = resolve(r.target_name, hint);
            if (alt.broker_user_id) res = { ...alt, match_method: `${alt.match_method ?? "name"}_target` };
          }
          const { error } = await admin.from(REG).update({
            broker_user_id: res.broker_user_id,
            first_name: res.first_name,
            last_name: res.last_name,
            maestro_broker_id: res.maestro_broker_id ?? r.cabinet ?? null,
            match_method: res.match_method,
            agent_key: agentKey(r.agent_name),
          }).eq("id", r.id);
          if (!error) updated++;
        }));
      }
      return json({ ok: true, updated });
    }

    if (action === "purge") {
      const year = Number(body?.year);
      const q = admin.from("planipret_commission_register").delete();
      const { error } = year ? await q.eq("fiscal_year", year) : await q.neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // action === "import"
    const rawRows: any[] = Array.isArray(body?.rows) ? body.rows : [];
    if (!rawRows.length) return json({ error: "no_rows" }, 400);
    const fileName = String(body?.fileName ?? "registre.xlsx");
    const mode = body?.mode === "merge" ? "merge" : "replace";
    const replaceYears: boolean = mode === "replace" && body?.replaceYears !== false;

    const saved = await loadMappings(admin);
    const typeOverrides = { ...saved.commissionTypes, ...(body?.commissionTypes ?? {}) };
    const { resolve } = await loadResolver(admin);

    const prepared = rawRows.map((r, i) => {
      const date = isoDate(r.date_trans);
      const agent = str(r.agent_name);
      const targetName = str(r.target_name);
      const cabinetId = str(r.cabinet);
      const maestroHint = str(r.maestro_broker_id ?? r.maestro_id) ?? cabinetId;
      let ident = resolve(agent, maestroHint);
      if (!ident.broker_user_id && targetName && targetName !== agent) {
        const alt = resolve(targetName, maestroHint);
        if (alt.broker_user_id) ident = { ...alt, match_method: `${alt.match_method ?? "name"}_target` };
      }
      if (!ident.maestro_broker_id && cabinetId) ident = { ...ident, maestro_broker_id: cabinetId };
      const ctype = normaliseCommissionType(r.commission_type, typeOverrides);
      const sheet = str(r.sheet ?? r.sheet_name);
      const sourceRow = Number(r.source_row ?? i + 2);
      return {
        number: str(r.number),
        loan_amt: num(r.loan_amt),
        primary_client_name: str(r.primary_client_name),
        secondary_client_name: str(r.secondary_client_name),
        institution: str(r.institution),
        financial_inst_id: str(r.financial_inst_id),
        is_adjustment: str(r.is_adjustment),
        points: r.points === undefined ? null : num(r.points),
        buy_down: r.buy_down === undefined ? null : num(r.buy_down),
        amount: num(r.amount),
        mortgage_type: str(r.mortgage_type),
        term: str(r.term),
        agent_name: agent,
        target_name: str(r.target_name),
        date_trans: date,
        commission_type: ctype.value,
        split_type: str(r.split_type),
        agent_company: str(r.agent_company),
        cabinet: str(r.cabinet),
        source_row: sourceRow,
        sheet_name: sheet,
        raw: r.raw ?? r,
        row_key: rowKey({
          sheet,
          sourceRow,
          number: str(r.number),
          date,
          commissionType: ctype.value,
          amount: num(r.amount),
        }),
        map_status: ident.broker_user_id && ctype.known ? "ok" : "unmapped",
        fiscal_year: date ? Number(date.slice(0, 4)) : null,
        ym_key: date ? date.slice(0, 7) : null,
        broker_user_id: ident.broker_user_id,
        first_name: ident.first_name,
        last_name: ident.last_name,
        maestro_broker_id: ident.maestro_broker_id,
        match_method: ident.match_method,
        agent_key: agentKey(agent),
      };
    }).filter((r) => r.date_trans);

    const years = Array.from(new Set(prepared.map((r) => r.fiscal_year!))).sort();

    const { data: imp, error: impErr } = await admin
      .from("planipret_commission_imports")
      .insert({ file_name: fileName, row_count: prepared.length, years, created_by: user.id, status: "running" })
      .select()
      .single();
    if (impErr) return json({ error: impErr.message }, 500);

    if (replaceYears && years.length) {
      const { error: delErr } = await admin.from(REG).delete().in("fiscal_year", years);
      if (delErr) return json({ error: delErr.message }, 500);
    }

    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < prepared.length; i += CHUNK) {
      const slice = prepared.slice(i, i + CHUNK).map((r) => ({ ...r, import_batch_id: imp.id }));
      const { error } = mode === "merge"
        ? await admin.from(REG).upsert(slice, { onConflict: "row_key" })
        : await admin.from(REG).insert(slice);
      if (error) {
        await admin.from("planipret_commission_imports").update({ status: "failed", notes: { error: error.message } }).eq("id", imp.id);
        return json({ error: error.message, inserted }, 500);
      }
      inserted += slice.length;
    }

    const unmatched = Array.from(new Set(prepared.filter((r) => !r.broker_user_id && r.agent_name).map((r) => r.agent_name!)));
    const unmappedTypes = Array.from(new Set(prepared.filter((r) => r.map_status === "unmapped").map((r) => r.commission_type ?? "")))
      .filter(Boolean);
    await admin
      .from("planipret_commission_imports")
      .update({ status: "completed", row_count: inserted, notes: { unmatched, unmappedTypes, mode } })
      .eq("id", imp.id);

    return json({ ok: true, inserted, years, unmatched, unmappedTypes, mode, importId: imp.id });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
