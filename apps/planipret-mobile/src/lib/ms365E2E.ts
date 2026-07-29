/**
 * Microsoft 365 end-to-end test + auto-reconnect helper.
 * Used by "Tester maintenant" buttons on status/Teams/Mail/Calendar pages.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildMs365AuthorizeUrl } from "@/lib/ms365OAuth";
import { toast } from "sonner";

export type Ms365Feature = "status" | "teams" | "mail" | "calendar" | "all";

export type Ms365TestStep = {
  name: string;
  ok: boolean;
  ms: number;
  message: string;
  scopeHint?: string;
};

export type Ms365TestReport = {
  ok: boolean;
  steps: Ms365TestStep[];
  needsReconnect: boolean;
  scopesMissing: string[];
  elapsedMs: number;
};

async function timed<T>(name: string, scopeHint: string | undefined, fn: () => Promise<{ ok: boolean; message: string }>): Promise<Ms365TestStep> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { name, ok: r.ok, ms: Date.now() - t0, message: r.message, scopeHint };
  } catch (e: any) {
    return { name, ok: false, ms: Date.now() - t0, message: e?.message ?? String(e), scopeHint };
  }
}

async function invokeAction(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("ms365-actions", { body: { action, ...extra } });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export async function runMs365E2E(feature: Ms365Feature): Promise<Ms365TestReport> {
  const t0 = Date.now();
  const steps: Ms365TestStep[] = [];

  // Always start with status/token check
  steps.push(await timed("Statut & token", undefined, async () => {
    const { data, error } = await supabase.functions.invoke("ms365-status", { body: {} });
    if (error) throw error;
    const d = data as any;
    if (!d?.user?.connected) return { ok: false, message: "Compte Microsoft non connecté" };
    if (d.user.expired && !d.user.has_refresh) return { ok: false, message: "Token expiré, refresh manquant" };
    return { ok: true, message: `Connecté (${d.user.email ?? "?"})` };
  }));

  if (feature === "teams" || feature === "all") {
    steps.push(await timed("Teams (channels + chats)", "Chat.Read, Team.ReadBasic.All", async () => {
      const { data, error } = await supabase.functions.invoke("ms365-teams-list", { body: {} });
      if (error) throw error;
      const d = data as any;
      if (d?.connected === false) return { ok: false, message: "MS365 non connecté" };
      return { ok: true, message: `${(d?.teams ?? []).length} équipe(s), ${(d?.chats ?? []).length} chat(s)` };
    }));
  }

  if (feature === "mail" || feature === "all") {
    steps.push(await timed("Outlook Mail (lecture)", "Mail.ReadWrite", async () => {
      const d = await invokeAction("read_emails", { limit: 1 });
      const n = Array.isArray(d?.messages) ? d.messages.length : Array.isArray(d?.value) ? d.value.length : 0;
      return { ok: true, message: `${n} message(s) accessibles` };
    }));
    steps.push(await timed("Outlook Mail (dossiers)", "Mail.ReadWrite", async () => {
      const d = await invokeAction("list_folders");
      const n = Array.isArray(d?.folders) ? d.folders.length : Array.isArray(d?.value) ? d.value.length : 0;
      return { ok: n >= 0, message: `${n} dossier(s)` };
    }));
  }

  if (feature === "calendar" || feature === "all") {
    steps.push(await timed("Calendar (événements)", "Calendars.ReadWrite", async () => {
      const d = await invokeAction("list_calendar_events", { limit: 1 });
      const n = Array.isArray(d?.events) ? d.events.length : Array.isArray(d?.value) ? d.value.length : 0;
      return { ok: true, message: `${n} événement(s) accessibles` };
    }));
  }

  const needsReconnect = steps.some((s) => !s.ok && /token|expir|unauthor|401|403|consent|scope|reconnect/i.test(s.message));
  const scopesMissing = steps.filter((s) => !s.ok && s.scopeHint).map((s) => s.scopeHint!);
  return { ok: steps.every((s) => s.ok), steps, needsReconnect, scopesMissing, elapsedMs: Date.now() - t0 };
}

/**
 * Kicks off the OAuth authorize URL again (auto-reconnect flow).
 * Fetches the admin config, notifies via toast, then redirects.
 */
export async function startMs365Reconnect(reason?: string): Promise<void> {
  try {
    const { data: status } = await supabase.functions.invoke("ms365-status", { body: {} });
    const s = status as any;
    const clientId = s?.detection?.client_id;
    const tenant = s?.detection?.tenant_id ?? "common";
    if (!clientId) {
      toast.error("Configuration Microsoft manquante", { description: "Contactez l'administrateur." });
      return;
    }
    toast.message("Reconnexion Microsoft…", { description: reason ?? "Ouverture du flow OAuth" });
    const { data: userData } = await supabase.auth.getUser();
    const url = await buildMs365AuthorizeUrl({
      clientId,
      tenant,
      state: userData?.user?.id ?? "",
      prompt: "select_account",
    });
    window.location.href = url;
  } catch (e: any) {
    toast.error("Reconnexion impossible", { description: e?.message });
  }
}

/**
 * Runs E2E and, if the failure is auth-related, automatically triggers reconnect
 * with a toast notification. Returns the report.
 */
export async function runMs365E2EWithAutoReconnect(feature: Ms365Feature): Promise<Ms365TestReport> {
  const report = await runMs365E2E(feature);
  if (report.ok) {
    toast.success("Microsoft 365 opérationnel", { description: `${report.steps.length} test(s) réussis en ${report.elapsedMs}ms` });
  } else if (report.needsReconnect) {
    toast.error("Session Microsoft invalide", { description: "Reconnexion automatique lancée…" });
    setTimeout(() => { startMs365Reconnect("Session expirée détectée par le test"); }, 900);
  } else {
    const fail = report.steps.find((s) => !s.ok);
    toast.error("Test Microsoft échoué", { description: fail?.message ?? "Erreur inconnue" });
  }
  return report;
}
