// POST /functions/v1/maestro-m365-contact-sync
// Pushes the authenticated broker's Maestro clients into their Office 365
// (Outlook) personal contacts. Read-only on the Maestro side.
// Body: { limit?: number, search?: string }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function invoke(name: string, body: unknown, authHeader?: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: authHeader ?? `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data } as { ok: boolean; status: number; data: any };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return j({ success: false, error: "Unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: u } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    const userId = u?.user?.id;
    if (!userId) return j({ success: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit ?? 200), 500);

    // 1) Read the broker's Maestro clients (broker-scoped, read-only).
    const clientsRes = await invoke(
      "maestro-actions",
      { action: "list_clients", payload: { limit, offset: 0, search: body?.search ?? "", refresh: true } },
      authHeader,
    );
    if (!clientsRes.data?.success) {
      return j({ success: false, error: clientsRes.data?.error ?? "maestro_unavailable", synced: 0 });
    }
    const clients: any[] = clientsRes.data?.clients ?? clientsRes.data?.results ?? [];
    if (!clients.length) return j({ success: true, synced: 0, failed: 0, total: 0 });

    // 2) Upsert each one into Outlook contacts.
    let synced = 0;
    const failures: Array<{ name: string; error: string }> = [];
    for (const c of clients) {
      const payload = {
        external_id: c.id ? String(c.id) : undefined,
        first_name: c.first_name ?? undefined,
        last_name: c.last_name ?? undefined,
        display_name: c.full_name ?? c.name ?? undefined,
        email: c.email ?? undefined,
        mobile_phone: c.cell_phone ?? c.mobile ?? c.phone ?? undefined,
        business_phone: c.work_phone ?? undefined,
        company: c.company ?? undefined,
      };
      if (!payload.display_name && !payload.email && !payload.mobile_phone) continue;
      const r = await invoke("ms365-actions", { action: "upsert_contact", payload, _user_id: userId });
      if (r.data?.success) synced++;
      else {
        failures.push({ name: String(payload.display_name ?? payload.email ?? "?"), error: String(r.data?.error ?? r.status) });
        // Microsoft not connected → stop early, every call would fail the same way.
        if (/non connect/i.test(String(r.data?.error ?? ""))) break;
      }
    }

    return j({ success: true, total: clients.length, synced, failed: failures.length, failures: failures.slice(0, 10) });
  } catch (e: any) {
    console.error("maestro-m365-contact-sync error", e);
    return j({ success: false, error: e?.message ?? "server_error" }, 500);
  }
});
