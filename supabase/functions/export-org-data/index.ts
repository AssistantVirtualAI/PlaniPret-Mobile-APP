import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ExportType = "topics" | "prompt_templates" | "both";
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

async function hasPermission(supabase: any, userId: string, orgId: string, permission: string) {
  const [{ data: isSuperAdmin }, { data: roleRow }] = await Promise.all([
    supabase.rpc("is_super_admin", { _user_id: userId }),
    supabase.from("user_roles").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
  ]);
  if (isSuperAdmin) return true;
  const role = roleRow?.role as string | undefined;
  if (!role) return false;
  const base: Record<string, string[]> = {
    org_admin: ["export:org_data"],
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

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
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

    const { organization_id, export_type, format } = await req.json();

    const orgId = organization_id as string | undefined;
    const exportType = (export_type as ExportType | undefined) ?? "both";
    const exportFormat = (format as ExportFormat | undefined) ?? "json";

    if (!orgId) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canExport = await hasPermission(supabase, userRes.user.id, orgId, "export:org_data");
    if (!canExport) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const stamp = now.toISOString().slice(0, 10);

    const payload: Record<string, unknown> = {
      export_date: now.toISOString(),
      organization_id: orgId,
    };

    if (exportType === "topics" || exportType === "both") {
      const { data: topics, error } = await supabase
        .from("topic_aggregates")
        .select("id, topic, category, total_mentions, avg_sentiment, last_mentioned_at, created_at, updated_at")
        .eq("organization_id", orgId)
        .order("total_mentions", { ascending: false })
        .limit(1000);

      if (error) throw error;
      payload.topics = topics ?? [];
    }

    if (exportType === "prompt_templates" || exportType === "both") {
      const { data: templates, error } = await supabase
        .from("prompt_templates")
        .select(
          "id, organization_id, name, description, system_prompt, first_message, temperature, max_tokens, tags, is_default, created_at, updated_at",
        )
        .or(`organization_id.eq.${orgId},and(organization_id.is.null,is_default.eq.true)`)
        .order("is_default", { ascending: false })
        .order("name")
        .limit(1000);

      if (error) throw error;
      payload.prompt_templates = templates ?? [];
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      user_id: userRes.user.id,
      action: "export",
      resource_type: "organization_data",
      metadata: {
        export_type: exportType,
        format: exportFormat,
      },
    });

    if (exportFormat === "csv") {
      // For CSV, return a single CSV by flattening keys (best-effort)
      const rows: Record<string, unknown>[] = [];
      if (Array.isArray(payload.topics)) {
        (payload.topics as Record<string, unknown>[]).forEach((r) => rows.push({ kind: "topic", ...r }));
      }
      if (Array.isArray(payload.prompt_templates)) {
        (payload.prompt_templates as Record<string, unknown>[]).forEach((r) => rows.push({ kind: "prompt_template", ...r }));
      }

       const csv = toCsv(rows);
       const filename = `org-export-${stamp}.csv`;

       await supabase.from("org_exports").insert({
         organization_id: orgId,
         created_by: userRes.user.id,
         export_type: exportType,
         format: exportFormat,
         filters: { export_type: exportType },
         filename,
         mime: "text/csv",
         content: csv,
       });

       const keepDays = await getExportsRetentionDays(supabase, orgId);
       const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
       await supabase.from("org_exports").delete().eq("organization_id", orgId).lt("created_at", cutoff);

       const { data: old } = await supabase
         .from("org_exports")
         .select("id")
         .eq("organization_id", orgId)
         .order("created_at", { ascending: false })
         .range(20, 200);
       if (old?.length) await supabase.from("org_exports").delete().in("id", old.map((o: any) => o.id));

       return new Response(JSON.stringify({ filename, mime: "text/csv", content: csv }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    const json = JSON.stringify(payload, null, 2);
    const filename = `org-export-${stamp}.json`;

    await supabase.from("org_exports").insert({
      organization_id: orgId,
      created_by: userRes.user.id,
      export_type: exportType,
      format: exportFormat,
      filters: { export_type: exportType },
      filename,
      mime: "application/json",
      content: json,
    });

    const keepDays = await getExportsRetentionDays(supabase, orgId);
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("org_exports").delete().eq("organization_id", orgId).lt("created_at", cutoff);

    const { data: old } = await supabase
      .from("org_exports")
      .select("id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .range(20, 200);
    if (old?.length) await supabase.from("org_exports").delete().in("id", old.map((o: any) => o.id));

    return new Response(JSON.stringify({ filename, mime: "application/json", content: json }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("export-org-data error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
