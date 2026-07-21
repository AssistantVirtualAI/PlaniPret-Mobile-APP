/**
 * useAvaContext — Snapshot du contexte de la page active pour AVA.
 * Déduit la route courante, l'onglet actif et l'item sélectionné depuis l'URL.
 * Envoyé dans chaque appel à pp-ava-chat pour que AVA sache où est l'utilisateur.
 */
import { useLocation } from "react-router-dom";
import { useMemo } from "react";

export type AvaContext = {
  current_route: string;
  current_tab?: string;
  active_item?: string | null;
};

export function useAvaContext(activeItem?: string | null): AvaContext {
  const location = useLocation();

  return useMemo(() => {
    const pathname = location.pathname;
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab") ?? undefined;

    // Resolve a human-readable route label
    let route = pathname;
    if (pathname.includes("/mplanipret/home")) route = "/mplanipret/home";
    else if (pathname.includes("/mplanipret/calls")) route = "/mplanipret/calls";
    else if (pathname.includes("/mplanipret/messages")) route = "/mplanipret/messages";
    else if (pathname.includes("/mplanipret/contacts")) route = "/mplanipret/contacts";
    else if (pathname.includes("/mplanipret/voicemail")) route = "/mplanipret/voicemail";
    else if (pathname.includes("/mplanipret/stats")) route = "/mplanipret/stats";
    else if (pathname.includes("/mplanipret/pipeline")) route = "/mplanipret/pipeline";
    else if (pathname.includes("/mplanipret/notifications")) route = "/mplanipret/notifications";
    else if (pathname.includes("/mplanipret/search")) route = "/mplanipret/search";
    else if (pathname.includes("/mplanipret/more")) route = "/mplanipret/more";
    else if (pathname.includes("/mplanipret/ava")) route = "/mplanipret/ava";

    return {
      current_route: route,
      ...(tab ? { current_tab: tab } : {}),
      ...(activeItem !== undefined ? { active_item: activeItem ?? null } : {}),
    };
  }, [location.pathname, location.search, activeItem]);
}
