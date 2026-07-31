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
  const { data, error } = await admin.from("planipret_did_assignments")
    .select("phone_number_e164,phone_number_digits,extension")
    .eq("domain", domain)
    .order("phone_number_e164");
  if (error) return json({ success: false, error: error.message }, 500);

  const numbers = (data ?? []).map((row) => ({
    raw: row.phone_number_digits,
    e164: row.phone_number_e164,
    pretty: pretty(row.phone_number_e164),
    extension: row.extension,
    application: "user",
    active: true,
  }));
  return json({ success: true, domain, count: numbers.length, numbers });
});