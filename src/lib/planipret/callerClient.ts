// Résout un numéro d'appelant vers un client Maestro vérifié (identifiant Maestro).
// 1) cache du courtier (maestro-client-lookup), 2) répertoire Maestro officiel
// (maestro-actions list_clients, correspondance téléphone exacte sur 10 chiffres).
import { supabase } from "@/integrations/supabase/client";

export interface CallerClient {
  found: boolean;
  maestroClientId: string | null;
  name: string | null;
}

const NOT_FOUND: CallerClient = { found: false, maestroClientId: null, name: null };
const cache = new Map<string, { at: number; v: CallerClient }>();
const TTL_FOUND = 10 * 60_000;
const TTL_MISS = 60_000;

const last10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

export function invalidateCallerClient(phone?: string | null) {
  if (phone) cache.delete(last10(phone)); else cache.clear();
}

export async function resolveCallerClient(phone: string | null | undefined): Promise<CallerClient> {
  const key = last10(phone);
  if (key.length < 10) return NOT_FOUND;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.v.found ? TTL_FOUND : TTL_MISS)) return hit.v;

  let result: CallerClient = NOT_FOUND;
  try {
    const { data } = await supabase.functions.invoke("maestro-client-lookup", { body: { phone: String(phone) } });
    const d = data as any;
    const id = d?.found ? String(d?.raw?.maestro_client_id ?? d?.client_id ?? "").trim() : "";
    if (id && /^\d+$/.test(id)) result = { found: true, maestroClientId: id, name: d?.name || d?.raw?.full_name || null };
  } catch { /* fallback below */ }

  if (!result.found) {
    try {
      const { data } = await supabase.functions.invoke("maestro-actions", {
        body: { action: "list_clients", payload: { search: key, limit: 10 } },
      });
      const rows: any[] = Array.isArray((data as any)?.clients) ? (data as any).clients : [];
      const row = rows.find((c) => [c.phone, c.mobile, c.cell_phone, c.mobile_number, c.telephone_number, ...(Array.isArray(c.phones) ? c.phones : [])]
        .some((p) => last10(p) === key));
      const id = row ? String(row.id ?? row.client_id ?? "").trim() : "";
      if (id) {
        result = {
          found: true,
          maestroClientId: id,
          name: String(row.full_name ?? row.name ?? [row.first_name, row.last_name].filter(Boolean).join(" ")).trim() || null,
        };
      }
    } catch { /* not found */ }
  }

  cache.set(key, { at: Date.now(), v: result });
  return result;
}

export function clientDetailPath(c: { maestroClientId: string | null; name: string | null }) {
  const key = encodeURIComponent((c.name || c.maestroClientId || "client").toLowerCase());
  return `/mplanipret/clients-360/${key}${c.maestroClientId ? `?mid=${encodeURIComponent(c.maestroClientId)}` : ""}`;
}
