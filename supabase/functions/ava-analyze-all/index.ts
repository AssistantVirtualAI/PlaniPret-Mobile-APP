// ava-analyze-all — Admin trigger to run ava-email-analyzer across brokers.
// Supports retry via `broker_user_ids`. Tracks per-broker per-step details.
// Falls back to Azure Application Permissions when no delegated tokens exist.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { MS365_DELEGATED_SCOPES, refreshMicrosoftAccessToken } from "../_shared/ms365.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Step = "list_inbox" | "refresh_token" | "app_token" | "analyze_email" | "no_mailbox";
type StepError = { broker?: string; broker_user_id?: string; step: Step; mid?: string; error: string };

async function getMsConfig(admin: any) {
  const { data } = await admin.from("planipret_integration_secrets").select("config").eq("provider", "microsoft").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string>;
  return {
    clientId: c.client_id ?? Deno.env.get("MICROSOFT_CLIENT_ID") ?? Deno.env.get("MS365_CLIENT_ID") ?? "",
    clientSecret: c.client_secret ?? Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? Deno.env.get("MS365_CLIENT_SECRET") ?? "",
    tenant: c.tenant_id ?? Deno.env.get("MICROSOFT_TENANT_ID") ?? Deno.env.get("MS365_TENANT_ID") ?? "common",
  };
}

async function refreshToken(admin: any, profile: any): Promise<{ token: string | null; error?: string }> {
  if (!profile.ms365_refresh_token) return { token: null, error: "missing refresh_token" };
  const token = await refreshMicrosoftAccessToken(admin, profile, MS365_DELEGATED_SCOPES);
  return token ? { token } : { token: null, error: "refresh failed" };
}

async function getAppAccessToken(admin: any): Promise<{ token: string | null; error?: string }> {
  const cfg = await getMsConfig(admin);
  if (!cfg.clientId || !cfg.clientSecret || !cfg.tenant || cfg.tenant === "common") {
    return { token: null, error: "Azure app config incomplete (need tenant_id, client_id, client_secret)" };
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!r.ok) return { token: null, error: `app token failed ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const d = await r.json();
  return { token: d.access_token as string };
}

async function listInboxDelegated(admin: any, profile: any, top: number): Promise<{ ids: string[]; error?: string }> {
  let token = profile.ms365_access_token;
  const fetchList = async (tk: string) => fetch(
    `${GRAPH}/me/mailFolders/Inbox/messages?$select=id,receivedDateTime&$orderby=receivedDateTime desc&$top=${top}`,
    { headers: { Authorization: `Bearer ${tk}` } },
  );
  let r = await fetchList(token);
  if (r.status === 401) {
    const rt = await refreshToken(admin, profile);
    if (!rt.token) return { ids: [], error: rt.error ?? "unauthorized" };
    token = rt.token;
    r = await fetchList(token);
  }
  if (!r.ok) return { ids: [], error: `graph ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const d = await r.json();
  return { ids: (d.value ?? []).map((m: any) => m.id as string).filter(Boolean) };
}

async function listInboxApp(appToken: string, mailbox: string, top: number): Promise<{ ids: string[]; error?: string }> {
  const r = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/Inbox/messages?$select=id,receivedDateTime&$orderby=receivedDateTime desc&$top=${top}`,
    { headers: { Authorization: `Bearer ${appToken}` } },
  );
  if (!r.ok) return { ids: [], error: `graph ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const d = await r.json();
  return { ids: (d.value ?? []).map((m: any) => m.id as string).filter(Boolean) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = new Date().toISOString();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_planipret_admin", { _user_id: userData.user.id });
    if (isAdmin !== true) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const top = Math.min(Math.max(Number(body.top ?? 20), 1), 50);
    const maxBrokers = Math.min(Math.max(Number(body.max_brokers ?? 40), 1), 200);
    const brokerFilter: string[] | null = Array.isArray(body.broker_user_ids) && body.broker_user_ids.length
      ? body.broker_user_ids.map(String) : null;

    // Try delegated first
    let delegatedQuery = admin
      .from("planipret_profiles")
      .select("id, user_id, full_name, ms365_access_token, ms365_refresh_token, ms365_email, email")
      .not("ms365_access_token", "is", null)
      .not("user_id", "is", null)
      .limit(maxBrokers);
    if (brokerFilter) delegatedQuery = delegatedQuery.in("user_id", brokerFilter);
    const { data: delegated } = await delegatedQuery;

    let brokers = delegated ?? [];
    let mode: "delegated" | "application" = "delegated";
    let appToken: string | null = null;
    const errors: StepError[] = [];

    if (!brokers.length) {
      const rt = await getAppAccessToken(admin);
      appToken = rt.token;
      if (!appToken) {
        return json({
          ok: false,
          error: rt.error ?? "No delegated tokens and Azure app not configured.",
          analyzed_brokers: 0, total_analyses: 0, brokers_scanned: 0,
          per_broker: [], errors: [{ step: "app_token", error: rt.error ?? "app token unavailable" }],
          mode: "none", started_at: startedAt, finished_at: new Date().toISOString(),
        });
      }
      mode = "application";
      let appQuery = admin
        .from("planipret_profiles")
        .select("id, user_id, full_name, ms365_email, email")
        .not("user_id", "is", null)
        .or("ms365_email.not.is.null,email.not.is.null")
        .limit(maxBrokers);
      if (brokerFilter) appQuery = appQuery.in("user_id", brokerFilter);
      const { data: allBrokers } = await appQuery;
      brokers = (allBrokers ?? []).filter((b: any) => b.ms365_email || b.email);
    }

    let totalAnalyses = 0;
    let analyzedBrokers = 0;
    const perBroker: Array<{
      broker_user_id: string; broker: string; broker_name?: string;
      mailbox: string; analyses: number; ok: number; failed: number;
      steps: Array<{ step: Step; ok: boolean; detail?: string }>;
      note?: string;
    }> = [];

    for (const b of brokers) {
      const mailbox = (b as any).ms365_email || (b as any).email || "";
      const brokerName = (b as any).full_name || mailbox;
      const brokerUserId = (b as any).user_id as string;
      const steps: Array<{ step: Step; ok: boolean; detail?: string }> = [];
      try {
        if (!mailbox) {
          steps.push({ step: "no_mailbox", ok: false, detail: "no mailbox on profile" });
          errors.push({ broker: brokerName, broker_user_id: brokerUserId, step: "no_mailbox", error: "no mailbox" });
          perBroker.push({ broker_user_id: brokerUserId, broker: mailbox, broker_name: brokerName, mailbox, analyses: 0, ok: 0, failed: 0, steps, note: "no mailbox" });
          continue;
        }
        const list = mode === "application"
          ? await listInboxApp(appToken!, mailbox, top)
          : await listInboxDelegated(admin, b, top);
        steps.push({ step: "list_inbox", ok: !list.error, detail: list.error ?? `${list.ids.length} message(s)` });
        if (list.error) {
          errors.push({ broker: brokerName, broker_user_id: brokerUserId, step: "list_inbox", error: list.error });
          perBroker.push({ broker_user_id: brokerUserId, broker: mailbox, broker_name: brokerName, mailbox, analyses: 0, ok: 0, failed: 0, steps, note: list.error });
          continue;
        }
        if (!list.ids.length) {
          perBroker.push({ broker_user_id: brokerUserId, broker: mailbox, broker_name: brokerName, mailbox, analyses: 0, ok: 0, failed: 0, steps, note: "empty inbox" });
          continue;
        }
        analyzedBrokers++;
        let ok = 0, failed = 0;
        for (let i = 0; i < list.ids.length; i += 4) {
          const chunk = list.ids.slice(i, i + 4);
          await Promise.all(chunk.map(async (mid) => {
            try {
              const r = await fetch(`${SUPABASE_URL}/functions/v1/ava-email-analyzer`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  "x-ava-service": SUPABASE_SERVICE_ROLE_KEY,
                },
                body: JSON.stringify({ ms_message_id: mid, broker_user_id: brokerUserId, graph_mode: mode, mailbox }),
              });
              const jr = await r.json().catch(() => null);
              if (jr?.success) { totalAnalyses++; ok++; }
              else {
                failed++;
                errors.push({ broker: brokerName, broker_user_id: brokerUserId, step: "analyze_email", mid, error: jr?.error ?? `HTTP ${r.status}` });
              }
            } catch (e) {
              failed++;
              errors.push({ broker: brokerName, broker_user_id: brokerUserId, step: "analyze_email", mid, error: (e as Error).message });
            }
          }));
        }
        steps.push({ step: "analyze_email", ok: failed === 0, detail: `${ok} ok / ${failed} failed` });
        perBroker.push({ broker_user_id: brokerUserId, broker: mailbox, broker_name: brokerName, mailbox, analyses: ok, ok, failed, steps });
      } catch (e) {
        errors.push({ broker: brokerName, broker_user_id: brokerUserId, step: "analyze_email", error: (e as Error).message });
        perBroker.push({ broker_user_id: brokerUserId, broker: mailbox, broker_name: brokerName, mailbox, analyses: 0, ok: 0, failed: 0, steps, note: (e as Error).message });
      }
    }

    const finishedAt = new Date().toISOString();
    // Best-effort persist last-run into planipret_settings
    try {
      await admin.from("planipret_settings").upsert({
        key: "ava_last_analyze_run",
        value: {
          started_at: startedAt, finished_at: finishedAt, mode,
          total_analyses: totalAnalyses, analyzed_brokers: analyzedBrokers,
          brokers_scanned: brokers.length, errors_count: errors.length,
          triggered_by: userData.user.id,
        },
      }, { onConflict: "key" });
    } catch { /* ignore, settings row is a nice-to-have */ }

    return json({
      ok: true,
      mode,
      started_at: startedAt,
      finished_at: finishedAt,
      analyzed_brokers: analyzedBrokers,
      total_analyses: totalAnalyses,
      brokers_scanned: brokers.length,
      per_broker: perBroker.slice(0, 60),
      failed_broker_ids: perBroker.filter((p) => p.failed > 0 || (p.analyses === 0 && p.note && p.note !== "empty inbox")).map((p) => p.broker_user_id),
      errors: errors.slice(0, 100),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
