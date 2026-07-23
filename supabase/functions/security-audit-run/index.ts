import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AppRole = "super_admin" | "org_admin" | "manager" | "agent" | "viewer";

async function getRetentionDays(supabase: any, orgId: string) {
  const { data } = await supabase
    .from("org_retention_settings")
    .select("notifications_retention_days")
    .eq("organization_id", orgId)
    .maybeSingle();
  const days = Number(data?.notifications_retention_days ?? 90);
  return Number.isFinite(days) && days > 0 ? days : 90;
}

async function hasPermission(supabase: any, userId: string, orgId: string, permission: string) {
  const [{ data: isSuperAdmin }, { data: roleRow }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
  ]);
  if (isSuperAdmin) return true;
  const role = roleRow?.role as AppRole | undefined;
  if (!role) return false;
  const base: Record<AppRole, string[]> = {
    super_admin: ["run:security_audit"],
    org_admin: ["run:security_audit"],
    manager: ["run:security_audit"],
    agent: [],
    viewer: [],
  };
  const allowed = new Set(base[role] || []);
  const { data: overrides } = await supabase
    .from("org_role_permissions")
    .select("permission, allowed")
    .eq("organization_id", orgId)
    .eq("role", role);
  for (const o of overrides || []) {
    if (o.allowed) allowed.add(o.permission);
    else allowed.delete(o.permission);
  }
  return allowed.has(permission);
}

async function sendEmail(to: string[], subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("RESEND_API_KEY missing; skipping email");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AVA <no-reply@ava.local>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("Resend email failed", res.status, t);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const organization_id = body?.organization_id as string | undefined;
    const dry_run = Boolean(body?.dry_run);
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canRun = await hasPermission(supabase, userRes.user.id, organization_id, "run:security_audit");
    if (!canRun) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: results, error: rpcErr } = await supabase.rpc("run_security_audit", { _org_id: organization_id });
    if (rpcErr) throw rpcErr;

    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, results: results ?? {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: runRow, error: insertErr } = await supabase
      .from("security_audit_runs")
      .insert({
        organization_id,
        run_by: userRes.user.id,
        results: results ?? {},
      })
      .select("id, organization_id, run_by, results, created_at")
      .single();

    if (insertErr) throw insertErr;

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id,
      user_id: userRes.user.id,
      action: "create",
      resource_type: "security_audit",
      resource_id: runRow.id,
      metadata: { results },
    });

    // Alerts on failures
    const checks = (results as any)?.checks as Array<{ id: string; status: string; title?: string }> | undefined;
    const failed = (checks || []).filter((c) => c.status === "fail");
    if (failed.length > 0) {
      const title = "Security Audit: échecs détectés";
      const bodyText = `Des contrôles ont échoué: ${failed.map((f) => f.id).join(", ")}`;

      // In-app notifications to org_admin and manager
      await supabase.from("org_notifications").insert([
        { organization_id, recipient_role: "org_admin", level: "error", title, body: bodyText, metadata: { failed } },
        { organization_id, recipient_role: "manager", level: "error", title, body: bodyText, metadata: { failed } },
      ]);

      // Retention purge (event-triggered)
      const keepDays = await getRetentionDays(supabase, organization_id);
      const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("org_notifications").delete().eq("organization_id", organization_id).lt("created_at", cutoff);

      // Email to org_admin/manager
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", organization_id)
        .in("role", ["org_admin", "manager"]);

      const userIds = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);
        const emails = (profiles || []).map((p: any) => p.email).filter(Boolean);
        if (emails.length) {
          await sendEmail(
            emails,
            title,
            `<p>${bodyText}</p><pre style="white-space:pre-wrap">${JSON.stringify(failed, null, 2)}</pre>`,
          );
        }
      }
    }

    return new Response(JSON.stringify({ run: runRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("security-audit-run error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
