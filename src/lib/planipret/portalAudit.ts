import { supabase } from "@/integrations/supabase/client";

export type PortalAuditEvent = {
  portal: "admin" | "broker" | "unknown";
  outcome: "success" | "failure";
  email?: string | null;
  reason?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
};

const recent = new Set<string>();

/** Fire-and-forget portal sign-in audit entry (never blocks the UI). */
export function logPortalLogin(event: PortalAuditEvent): void {
  const key = `${event.portal}|${event.outcome}|${event.email ?? ""}|${event.reason ?? ""}`;
  if (recent.has(key)) return;
  recent.add(key);
  setTimeout(() => recent.delete(key), 60_000);

  try {
    void supabase.functions
      .invoke("pp-portal-login-audit", {
        body: {
          ...event,
          provider: "microsoft",
          path: event.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
        },
      })
      .catch(() => {});
  } catch { /* ignore */ }
}
