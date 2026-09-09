// Passerelle vers la nouvelle API Scribe de Maestro (clients, adresses,
// téléphones, contrats). Aucun envoi de SMS n'est possible ici.
import { adminClient, corsHeaders, getMaestroConfig, json } from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";
import * as scribe from "../_shared/maestro-scribe.ts";
import { resolveScribeRoot } from "../_shared/maestro-scribe.ts";

type Action =
  | "diag"
  | "clients.list" | "clients.get" | "clients.create" | "clients.update" | "clients.delete"
  | "addresses.list" | "addresses.get" | "addresses.create" | "addresses.update" | "addresses.delete"
  | "telephones.list" | "telephones.get" | "telephones.create" | "telephones.update" | "telephones.delete"
  | "contracts.list" | "contracts.get" | "contracts.create";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "diag") as Action;
  const id = body?.id;
  const payload = (body?.payload ?? {}) as Record<string, unknown>;
  const query = (body?.query ?? {}) as Record<string, any>;
  const prefix: string | null = body?.prefix ?? null;

  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);
  if (!cfg.url || !cfg.key) return json({ ok: false, error: "maestro_not_configured" }, 200);

  const needsId = () => (id === undefined || id === null || id === "");

  try {
    switch (action) {
      case "diag": {
        const root = await resolveScribeRoot(cfg, prefix);
        const probe = await scribe.listClients(cfg, { limit: 1 }, prefix);
        return json({ ok: true, root, reachable: probe.ok, status: probe.status, endpoint: probe.endpoint, error: probe.error });
      }

      case "clients.list": return json(await scribe.listClients(cfg, query, prefix));
      case "clients.get": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.getClient(cfg, id, prefix));
      case "clients.create": return json(await scribe.createClient_(cfg, payload, prefix));
      case "clients.update": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.updateClient(cfg, id, payload, prefix));
      case "clients.delete": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.deleteClient(cfg, id, prefix));

      case "addresses.list": return json(await scribe.listAddresses(cfg, query, prefix));
      case "addresses.get": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.getAddress(cfg, id, prefix));
      case "addresses.create": return json(await scribe.createAddress(cfg, payload, prefix));
      case "addresses.update": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.updateAddress(cfg, id, payload, prefix));
      case "addresses.delete": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.deleteAddress(cfg, id, prefix));

      case "telephones.list": return json(await scribe.listTelephones(cfg, query, prefix));
      case "telephones.get": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.getTelephone(cfg, id, prefix));
      case "telephones.create": return json(await scribe.createTelephone(cfg, payload, prefix));
      case "telephones.update": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.updateTelephone(cfg, id, payload, prefix));
      case "telephones.delete": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.deleteTelephone(cfg, id, prefix));

      case "contracts.list": return json(await scribe.listContracts(cfg, query, prefix));
      case "contracts.get": return needsId() ? json({ ok: false, error: "id_required" }, 400) : json(await scribe.getContract(cfg, id, prefix));
      case "contracts.create": return json(await scribe.createContract(cfg, payload, prefix));

      default:
        return json({ ok: false, error: `unknown_action:${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
