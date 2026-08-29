/**
 * Resolution of the "screen pop" target for an inbound call.
 *
 * Order of preference:
 *   1. the caller's most recent Maestro dossier (deal)
 *   2. their Maestro contact record
 *   3. the locally cached contact (planipret_contacts)
 *
 * There is deliberately no failure state: when Maestro returns nothing the
 * caller still gets a contact target instead of an empty screen or an error.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MaestroDeal {
  id: string;
  label: string | null;
  stage: string | null;
  lender: string | null;
  amount: number | null;
  updated_at: string | null;
  url: string;
}

export interface DossierTarget {
  /** What the banner offers to open. */
  kind: "deal" | "contact" | "none";
  label: string;
  /** External Maestro deep-link, when the target lives in Maestro. */
  url: string | null;
  /** In-app route, preferred over `url` when available. */
  route: string | null;
  deal: MaestroDeal | null;
  clientId: string | null;
  dealsCount: number;
}

export const NO_TARGET: DossierTarget = {
  kind: "none",
  label: "",
  url: null,
  route: null,
  deal: null,
  clientId: null,
  dealsCount: 0,
};

const contactRoute = (localContactId?: string | null) =>
  localContactId ? `/mplanipret/contacts?id=${encodeURIComponent(localContactId)}` : null;

const dealLabel = (deal: MaestroDeal): string => {
  const bits = [deal.label ?? `Dossier ${deal.id}`, deal.lender].filter(Boolean);
  return bits.join(" · ");
};

/**
 * Asks the backend for the caller's Maestro client + latest dossier.
 * Always resolves — network or Maestro failures fall back to the local contact.
 */
export async function resolveDossierTarget(
  phone: string | null | undefined,
  opts: { callId?: string | null; localContactId?: string | null } = {},
): Promise<DossierTarget> {
  const fallback: DossierTarget = opts.localContactId
    ? {
      ...NO_TARGET,
      kind: "contact",
      label: "Ouvrir la fiche contact",
      route: contactRoute(opts.localContactId),
    }
    : NO_TARGET;

  if (!phone) return fallback;

  try {
    const params = new URLSearchParams({ phone });
    if (opts.callId) params.set("call_id", opts.callId);
    const { data, error } = await supabase.functions.invoke(
      `maestro-client-lookup?${params.toString()}`,
      { method: "GET" },
    );
    if (error || !data?.found) return fallback;

    const deal: MaestroDeal | null = data.latest_deal ?? null;
    const clientId = data.client_id ? String(data.client_id) : null;

    if (deal?.url) {
      return {
        kind: "deal",
        label: "Ouvrir le dossier le plus récent",
        url: deal.url,
        route: null,
        deal: { ...deal, label: dealLabel(deal) },
        clientId,
        dealsCount: Number(data.deals_count ?? 1) || 1,
      };
    }

    // Maestro knows the client but exposes no dossier: offer the contact record
    // rather than an empty dossier screen.
    const route = contactRoute(opts.localContactId);
    const url = data.contact_url ?? null;
    if (!route && !url) return fallback;
    return {
      kind: "contact",
      label: "Ouvrir la fiche contact",
      url,
      route,
      deal: null,
      clientId,
      dealsCount: 0,
    };
  } catch (_e) {
    return fallback;
  }
}

/**
 * Opens a resolved target. In-app routes win over Maestro deep-links so the
 * broker stays inside the app whenever the record exists locally.
 */
export function openDossierTarget(
  target: DossierTarget,
  navigate: (path: string) => void,
): boolean {
  if (target.route) {
    navigate(target.route);
    return true;
  }
  if (target.url) {
    window.open(target.url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
