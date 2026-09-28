// Ensures a Maestro client carries an exact caller number, using only the
// documented telephones sub-resource, then re-reads the client to confirm.
import type { MaestroConfig } from "./maestro.ts";
import { createTelephone, getClient } from "./maestro-scribe.ts";

export const tenDigits = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : "";
};

export function clientHasTelephone(client: any, phone: string): boolean {
  const want = tenDigits(phone);
  if (!want) return false;
  const tels: any[] = Array.isArray(client?.telephones) ? client.telephones : [];
  return tels.some((t) => tenDigits(t?.telephone_number) === want);
}

export async function ensureClientTelephone(
  cfg: MaestroConfig,
  clientId: string,
  client: any,
  phone: string,
  token: string,
): Promise<{ confirmed: boolean; client: any; added: boolean; status?: number }> {
  if (clientHasTelephone(client, phone)) return { confirmed: true, client, added: false };
  const number = tenDigits(phone);
  if (!number) return { confirmed: false, client, added: false };
  const tel = await createTelephone(cfg, clientId, {
    telephone_type: "mobile",
    telephone_number: number,
    extension: "",
    priority: "principal",
  }, { token });
  if (!tel.ok) return { confirmed: false, client, added: false, status: tel.status };
  const rb = await getClient(cfg, clientId, { token });
  if (!rb.ok || !rb.data) return { confirmed: false, client, added: true, status: rb.status };
  return { confirmed: clientHasTelephone(rb.data, phone), client: rb.data, added: true, status: rb.status };
}
