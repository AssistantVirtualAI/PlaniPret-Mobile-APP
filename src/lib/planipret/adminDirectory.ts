import { supabase } from "@/integrations/supabase/client";

export type PlanipretBrokerRow = {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  extension?: string | null;
  ns_extension?: string | null;
  mobile_app_enabled?: boolean | null;
  voice_agent_enabled?: boolean | null;
  ns_domain?: string | null;
  elevenlabs_agent_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  dnd_enabled?: boolean | null;
  ns_only?: boolean;
  status?: string | null;
  maestro_connected?: boolean | null;
};

const extOf = (row: Partial<PlanipretBrokerRow>) => String(row.extension ?? row.ns_extension ?? "").trim();

export const isPlanipretActiveBroker = (row: Partial<PlanipretBrokerRow>) => {
  const email = String(row.email ?? "").trim();
  const status = String(row.status ?? "").toLowerCase();
  const ext = extOf(row);
  const name = String(row.full_name ?? "").trim().toLowerCase();
  return !!ext
    && !/^\d{7,}$/.test(ext)
    && !/@lemtel\.com$/i.test(email)
    && !["disabled", "suspended", "deleted", "inactive"].includes(status)
    && !["system", "system user", "anonymous", "conference", "voicemail", "operator"].includes(name);
};

export async function getPlanipretBrokerDirectory() {
  const { data: localProfiles } = await supabase
    .from("planipret_profiles")
    .select("*")
    .order("full_name", { ascending: true });

  const localList = ((localProfiles ?? []) as PlanipretBrokerRow[]).filter(isPlanipretActiveBroker);
  let nsDomain: string | null = null;
  let nsError: string | null = null;
  const debug: any[] = [{ label: "planipret_profiles", count: localList.length, sample: localList.slice(0, 3) }];

  try {
    const t0 = performance.now();
    const { data: nsRes, error: nsErr } = await supabase.functions.invoke("pp-ns-users", { body: {} });
    if (nsErr) throw new Error(nsErr.message);
    if ((nsRes as any)?.ok) {
      const nsBrokersRaw = (((nsRes as any).brokers ?? []) as PlanipretBrokerRow[]).filter(isPlanipretActiveBroker);
      // Dedupe by user_id (pp-ns-users can emit the same broker twice — once
      // from the NS device row and once from the joined DB profile with a
      // different extension). Keep the first occurrence (NS device wins).
      const seenUid = new Set<string>();
      const nsBrokers = nsBrokersRaw.filter((b) => {
        const uid = b.user_id ? String(b.user_id) : "";
        if (!uid) return true;
        if (seenUid.has(uid)) return false;
        seenUid.add(uid);
        return true;
      });
      nsDomain = (nsRes as any).domain ?? null;
      debug.push({
        label: "pp-ns-users (source exacte Courtiers/KPI/sidebar)",
        count: Number((nsRes as any).count ?? nsBrokers.length),
        ms: Math.round(performance.now() - t0),
        meta: { domain: nsDomain, strategy: (nsRes as any).strategy, warning: (nsRes as any).warning ?? (nsRes as any).ns_warning },
        sample: nsBrokers.slice(0, 3),
      });

      const byExt = new Map<string, PlanipretBrokerRow>();
      const byUid = new Map<string, string>();      // user_id -> ext key
      const byEmail = new Map<string, string>();    // email  -> ext key
      nsBrokers.forEach((b) => {
        const k = extOf(b);
        byExt.set(k, b);
        if (b.user_id) byUid.set(String(b.user_id), k);
        const em = String(b.email ?? "").toLowerCase().trim();
        if (em) byEmail.set(em, k);
      });
      localList.forEach((p) => {
        const em = String(p.email ?? "").toLowerCase().trim();
        // If the same person already exists in NS (by user_id or email),
        // merge into that NS entry instead of creating a new row at the
        // (possibly stale) local extension.
        const nsKey =
          (p.user_id && byUid.get(String(p.user_id))) ||
          (em && byEmail.get(em)) ||
          extOf(p);
        const prev = byExt.get(nsKey);
        byExt.set(nsKey, {
          ...prev,
          ...p,
          // Trust NS extension when we matched by identity, otherwise fall back to local.
          extension: prev?.extension ?? p.extension ?? p.ns_extension ?? nsKey,
          ns_extension: prev?.ns_extension ?? p.ns_extension ?? p.extension ?? nsKey,
        });
        if (p.user_id) byUid.set(String(p.user_id), nsKey);
        if (em) byEmail.set(em, nsKey);
      });
      const merged = Array.from(byExt.values()).filter(isPlanipretActiveBroker)
        .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
      return { brokers: merged, count: merged.length, nsDomain, nsError, debug };
    }
    if ((nsRes as any)?.error) nsError = (nsRes as any).error;
  } catch (e: any) {
    nsError = e?.message ?? "NS-API indisponible";
    debug.push({ label: "pp-ns-users", error: nsError });
  }

  return { brokers: localList, count: localList.length, nsDomain, nsError, debug };
}

export async function getPlanipretBrokerDirectoryCount() {
  return (await getPlanipretBrokerDirectory()).count;
}