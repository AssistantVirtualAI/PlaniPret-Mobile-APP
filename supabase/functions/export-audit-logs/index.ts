import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ExportFormat = "json" | "csv";

async function getExportsRetentionDays(supabase: any, orgId: string) {
  const { data } = await supabase
    .from("org_retention_settings")
    .select("exports_retention_days")
    .eq("organization_id", orgId)
    .maybeSingle();
  const days = Number(data?.exports_retention_days ?? 90);
  return Number.isFinite(days) && days > 0 ? days : 90;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (obj === null || obj === undefined) {
    out[prefix] = obj;
    return out;
  }
  if (typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    flatten(v, next, out);
  }
  return out;
}

async function hasPermission(supabase: any, userId: string, orgId: string, permission: string) {
  const [{ data: isSuperAdmin }, { data: roleRow }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
  ]);
  if (isSuperAdmin) return true;
  const role = roleRow?.role as string | undefined;
  if (!role) return false;

  // Base permissions (kept minimal for server checks)
  const base: Record<string, string[]> = {
    org_admin: ["export:audit_logs"],
    manager: [],
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const format = (body?.format as ExportFormat | undefined) ?? "csv";
    const filters = (body?.filters as Record<string, unknown> | undefined) ?? {};

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canExport = await hasPermission(supabase, userRes.user.id, organization_id, "export:audit_logs");
    if (!canExport) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = supabase
      .from("audit_logs")
      .select("id, organization_id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(1000);

    const action = filters.action as string | undefined;
    const resource_type = filters.resource_type as string | undefined;
    const search = (filters.search as string | undefined)?.trim();
    const date_from = filters.date_from as string | undefined;
    const date_to = filters.date_to as string | undefined;

    if (action) q = q.eq("action", action);
    if (resource_type) q = q.eq("resource_type", resource_type);
    if (date_from) q = q.gte("created_at", date_from);
    if (date_to) q = q.lte("created_at", date_to);

    const { data: rows, error } = await q;
    if (error) throw error;

    const filtered = (rows || []).filter((r: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(r.action || "").toLowerCase().includes(s) ||
        String(r.resource_type || "").toLowerCase().includes(s) ||
        String(r.resource_id || "").toLowerCase().includes(s) ||
        JSON.stringify(r.metadata || {}).toLowerCase().includes(s)
      );
    });

    const stamp = new Date().toISOString().slice(0, 10);

    let filename = `audit-logs-${stamp}.${format}`;
    let mime = format === "csv" ? "text/csv" : "application/json";
    let content = "";

    if (format === "csv") {
      const csvRows = filtered.map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        user_id: r.user_id,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        ...flatten(r.metadata || {}, "metadata"),
      }));
      content = toCsv(csvRows);
    } else {
      content = JSON.stringify(
        {
          export_date: new Date().toISOString(),
          organization_id,
          filters,
          rows: filtered,
        },
        null,
        2,
      );
    }

    // Persist export for history + re-download
    const { data: exportRow, error: exportErr } = await supabase
      .from("org_exports")
      .insert({
        organization_id,
        created_by: userRes.user.id,
        export_type: "audit_logs",
        format,
        filters,
        filename,
        mime,
        content,
      })
      .select("id")
      .single();
    if (exportErr) throw exportErr;

    // Retention purge (event-triggered)
    const keepDays = await getExportsRetentionDays(supabase, organization_id);
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("org_exports").delete().eq("organization_id", organization_id).lt("created_at", cutoff);

    // Keep only last 20 exports
    const { data: old } = await supabase
      .from("org_exports")
      .select("id")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .range(20, 200);
    if (old?.length) {
      await supabase.from("org_exports").delete().in(
        "id",
        old.map((o: any) => o.id),
      );
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id,
      user_id: userRes.user.id,
      action: "export",
      resource_type: "audit_logs",
      resource_id: exportRow?.id,
      metadata: { format, filters, count: filtered.length },
    });

    return new Response(JSON.stringify({ filename, mime, content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("export-audit-logs error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
