import { supabase } from "@/integrations/supabase/client";
import { openMs365Authorize } from "@/lib/ms365OAuth";
import { markMs365Pending } from "@/lib/ms365Pending";

const INTENT_KEY = "pp_ms365_auth_intent";
const NEXT_KEY = "pp_ms365_auth_next";

export async function isMs365LoginConfigured(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("ms365-public-config", { body: {} });
  return !error && Boolean((data as any)?.configured && (data as any)?.client_id);
}

export async function startMicrosoftSignIn(nextPath = "/mplanipret"): Promise<void> {
  const { data, error } = await supabase.functions.invoke("ms365-public-config", { body: {} });
  const cfg = data as any;
  if (error || !cfg?.configured || !cfg?.client_id) {
    throw new Error("Microsoft SSO n'est pas configuré.");
  }
  try {
    localStorage.setItem(INTENT_KEY, "login");
    localStorage.setItem(NEXT_KEY, nextPath);
  } catch {}
  markMs365Pending();
  await openMs365Authorize({ clientId: cfg.client_id, tenant: cfg.tenant_id || "common", state: "login" });
}

export function getMicrosoftSignInIntent(): string | null {
  try { return localStorage.getItem(INTENT_KEY); } catch { return null; }
}

export function getMicrosoftSignInNext(defaultPath = "/mplanipret"): string {
  try {
    const next = localStorage.getItem(NEXT_KEY) || defaultPath;
    return next.startsWith("/") && !next.startsWith("//") ? next : defaultPath;
  } catch {
    return defaultPath;
  }
}

export function clearMicrosoftSignInIntent(): void {
  try { localStorage.removeItem(INTENT_KEY); } catch {}
  try { localStorage.removeItem(NEXT_KEY); } catch {}
}