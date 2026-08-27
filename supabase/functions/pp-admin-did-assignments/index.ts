import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const pretty = (e164: string) => {
  const digits = e164.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    : e164;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Méthode non permise" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!url || !anonKey || !serviceKey || !authorization) return json({ success: false, error: "Non autorisé" }, 401);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ success: false, error: "Session invalide" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin.from("planipret_profiles")
    .select("role, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return json({ success: false, error: "Accès refusé" }, 403);

  const body = await req.json().catch(() => ({}));
  const domain = String(body?.domain ?? "planipret.ca");
  const action = String(body?.action ?? "list");

  // ---- Mutations (DB only — NetSapiens DID objects are never written from here) ----
  if (action === "assign" || action === "release") {
    const e164 = String(body?.e164 ?? "").trim();
    if (!e164) return json({ success: false, error: "Numéro manquant" }, 400);

    if (action === "release") {
      const { error } = await admin.from("planipret_did_assignments")
        .update({ status: "available", extension: null, display_name: null, callerid_name: null, updated_at: new Date().toISOString() })
        .eq("phone_number_e164", e164)
        .eq("domain", domain);
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, e164, status: "available" });
    }

    const extension = String(body?.extension ?? "").trim();
    if (!extension) return json({ success: false, error: "Poste manquant" }, 400);
    const { data: target } = await admin.from("planipret_profiles")
      .select("full_name")
      .eq("extension", extension)
      .maybeSingle();
    const { error } = await admin.from("planipret_did_assignments")
      .update({
        status: "assigned",
        extension,
        display_name: target?.full_name ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("phone_number_e164", e164)
      .eq("domain", domain);
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: true, e164, status: "assigned", extension });
  }

  // ---- List ----
  const { data, error } = await admin.from("planipret_did_assignments")
    .select("phone_number_e164,phone_number_digits,extension,status,display_name,callerid_name,updated_at")
    .eq("domain", domain)
    .order("phone_number_e164");
  if (error) return json({ success: false, error: error.message }, 500);

  const numbers = (data ?? []).map((row: any) => ({
    raw: row.phone_number_digits,
    e164: row.phone_number_e164,
    pretty: pretty(row.phone_number_e164),
    extension: row.extension,
    status: row.status ?? (row.extension ? "assigned" : "available"),
    display_name: row.display_name ?? row.callerid_name ?? null,
    updated_at: row.updated_at,
    application: "user",
    active: !!row.extension,
  }));

  const brokers = action === "list_with_brokers"
    ? ((await admin.from("planipret_profiles")
        .select("extension,full_name,email")
        .not("extension", "is", null)
        .order("extension")).data ?? [])
    : [];

  return json({
    success: true,
    domain,
    count: numbers.length,
    available: numbers.filter((n) => n.status === "available").length,
    numbers,
    brokers,
  });
});
