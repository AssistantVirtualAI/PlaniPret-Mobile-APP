// pp-ns-strip-emails — Removes every email address and email alert setting from
// all PBX (NetSapiens/UCStack) subscribers so the platform can never email
// brokers "unread messages", voicemail or missed-call notifications.
// Safe to re-run. Read-only preview with { dry_run: true }.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { nsFetchAll, NS_API_BASE_URL, NS_API_KEY } from "../_shared/ns-pagination.ts";

const NS_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SILENCE_PAYLOAD = {
  "email-address": "",
  "email-send-alert-new-voicemail-enabled": "no",
  "email-send-alert-new-voicemail-behavior": "no",
  "email-send-alert-new-voicemail-cc-list-csv": "",
  "email-send-alert-new-missed-call-enabled": "no",
  "email-send-alert-data-storage-limit-reached-enabled": "no",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE);

    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const CRON_SECRETS = [Deno.env.get("PP_CRON_SECRET"), Deno.env.get("CRON_PBX_SECRET"), Deno.env.get("CRON_SECRET")].filter((v): v is string => !!v);
    const isCron = (!!token && token === SERVICE) || (!!cronHeader && CRON_SECRETS.includes(cronHeader));
    if (!isCron) {
      if (!token || token === ANON) return json({ error: "Unauthorized" }, 401);
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user?.id) return json({ error: "Unauthorized" }, 401);
      const { data: member } = await admin.rpc("is_planipret_member", { _user_id: u.user.id });
      if (member !== true) return json({ error: "Forbidden" }, 403);
    }

    if (!NS_API_KEY) return json({ error: "NS_API_KEY missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const domain = String(body?.domain ?? NS_DOMAIN);

    const list = await nsFetchAll<any>(`/domains/${encodeURIComponent(domain)}/users`, {
      pageSize: 200,
      maxPages: 50,
      keyOf: (u: any) => String(u?.user ?? u?.extension ?? u?.id ?? ""),
    });

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${NS_API_KEY}`,
    };

    const results: any[] = [];
    let cleared = 0, alreadyClean = 0, failed = 0;

    for (const u of list.items) {
      const ext = String(u?.user ?? u?.extension ?? "").trim();
      if (!ext) continue;
      const currentEmail = String(u?.["email-address"] ?? u?.email_address ?? u?.email ?? "").trim();
      const alertsOn = ["email-send-alert-new-voicemail-enabled", "email-send-alert-new-missed-call-enabled", "email-send-alert-data-storage-limit-reached-enabled"]
        .some((k) => String(u?.[k] ?? "no").toLowerCase() === "yes");
      if (!currentEmail && !alertsOn) { alreadyClean++; continue; }
      if (dryRun) { results.push({ ext, email: currentEmail, alertsOn, action: "would_clear" }); cleared++; continue; }

      const res = await fetch(`${NS_API_BASE_URL}/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(ext)}`, {
        method: "PUT", headers, body: JSON.stringify(SILENCE_PAYLOAD),
      });
      const ok = res.ok || res.status === 202 || res.status === 204;
      if (ok) cleared++; else failed++;
      results.push({ ext, had_email: !!currentEmail, alertsOn, status: res.status, ok });
    }

    return json({ ok: true, domain, dry_run: dryRun, total_users: list.items.length, cleared, already_clean: alreadyClean, failed, results: results.slice(0, 300) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
