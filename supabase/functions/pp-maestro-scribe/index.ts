// Passerelle vers l'API publique Planiprêt (`/api/main`) : clients, adresses,
// téléphones, contrats, institutions financières, rapports de commissions et
// tâches. Aucun envoi de SMS n'est possible ici.
import { adminClient, corsHeaders, getMaestroConfig, json } from "../_shared/maestro.ts";
import { guardPlanipret } from "../_shared/planipret-guard.ts";
import * as api from "../_shared/maestro-scribe.ts";
import { apiRoot } from "../_shared/maestro-scribe.ts";
import { getUserMaestroAccessToken } from "../_shared/maestro-oauth.ts";

type Action =
  | "diag"
  | "clients.list" | "clients.get" | "clients.create" | "clients.update"
  | "addresses.create" | "addresses.update" | "addresses.delete"
  | "telephones.create" | "telephones.update" | "telephones.delete"
  | "contracts.list" | "contracts.get" | "contracts.create" | "contracts.update" | "contracts.delete"
  | "institutions.list" | "institutions.get"
  | "commissions.deposits" | "commissions.agents" | "commission-reports.list" | "commission-reports.get"
  | "tasks.list" | "tasks.create" | "tasks.update" | "tasks.delete";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await guardPlanipret(req);
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action ?? "diag") as Action;
  const id = body?.id;                       // client / contract / task id
  const subId = body?.sub_id;                // address / telephone id
  const payload = (body?.payload ?? {}) as Record<string, unknown>;
  const query = (body?.query ?? {}) as Record<string, any>;
  const admin = adminClient();
  const cfg = await getMaestroConfig(admin);

  // Chaque opération utilisateur est portée par le jeton OAuth du courtier.
  // Les appels AVA internes arrivent avec service-role + `_user_id`, puis le
  // garde ci-dessus résout ce même courtier; aucun jeton cabinet/global ne peut
  // agir en son nom.
  const ownToken = await getUserMaestroAccessToken(admin, guard.user.id).catch(() => null);
  const token = ownToken;
  const tokenSource = ownToken ? "broker_oauth" : "none";
  if (!token) return json({ ok: false, error: "maestro_not_configured", token_source: tokenSource }, 200);

  const o = { token };
  const needId = () => id === undefined || id === null || id === "";
  const needSub = () => subId === undefined || subId === null || subId === "";
  const missing = (what: string) => json({ ok: false, error: `${what}_required` }, 400);

  try {
    switch (action) {
      case "diag": {
        const root = apiRoot(cfg);
        const probe = await api.listFinancialInstitutions(cfg, o);
        return json({ ok: true, root, token_source: tokenSource, reachable: probe.ok, status: probe.status, endpoint: probe.endpoint, error: probe.error });
      }

      case "clients.list": return json(await api.listClients(cfg, query, o));
      case "clients.get": return needId() ? missing("id") : json(await api.getClient(cfg, id, o));
      case "clients.create": return json(await api.createClient_(cfg, payload, o));
      case "clients.update": return needId() ? missing("id") : json(await api.updateClient(cfg, id, payload, o));

      case "addresses.create": return needId() ? missing("id") : json(await api.createAddress(cfg, id, payload, o));
      case "addresses.update": return needId() || needSub() ? missing("id") : json(await api.updateAddress(cfg, id, subId, payload, o));
      case "addresses.delete": return needId() || needSub() ? missing("id") : json(await api.deleteAddress(cfg, id, subId, o));

      case "telephones.create": return needId() ? missing("id") : json(await api.createTelephone(cfg, id, payload, o));
      case "telephones.update": return needId() || needSub() ? missing("id") : json(await api.updateTelephone(cfg, id, subId, payload, o));
      case "telephones.delete": return needId() || needSub() ? missing("id") : json(await api.deleteTelephone(cfg, id, subId, o));

      case "contracts.list": return json(await api.listContracts(cfg, query, o));
      case "contracts.get": return needId() ? missing("id") : json(await api.getContract(cfg, id, o));
      case "contracts.create": return json(await api.createContract(cfg, payload, o));
      case "contracts.update": return needId() ? missing("id") : json(await api.updateContract(cfg, id, payload, o));
      case "contracts.delete": return needId() ? missing("id") : json(await api.deleteContract(cfg, id, o));

      case "institutions.list": return json(await api.listFinancialInstitutions(cfg, o));
      case "institutions.get": return needId() ? missing("id") : json(await api.getFinancialInstitution(cfg, id, o));

      case "commissions.deposits": return json(await api.commissionDeposits(cfg, query, o));
      case "commissions.agents": return json(await api.commissionAgents(cfg, o));
      case "commission-reports.list": return json(await api.listCommissionReports(cfg, query, o));
      case "commission-reports.get": return needId() ? missing("id") : json(await api.getCommissionReport(cfg, id, o));

      case "tasks.list": return json(await api.listTasks(cfg, query, o));
      case "tasks.create": return json(await api.createTask(cfg, payload, o));
      case "tasks.update": return needId() ? missing("id") : json(await api.updateTask(cfg, id, payload, o));
      case "tasks.delete": return needId() ? missing("id") : json(await api.deleteTask(cfg, id, o));

      default:
        return json({ ok: false, error: `unknown_action:${action}` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
