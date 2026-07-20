// Prefetch lazy route chunks on hover/focus/idle so navigation feels instant.
// The factories mirror the lazy() imports in App.tsx. Adding a new lazy route
// here is optional — hovering a <PrefetchLink> to that path just becomes a no-op.

type Factory = () => Promise<any>;

const registry: Record<string, Factory> = {
  // Planipret admin
  "/planipret/admin": () => import("@/pages/planipret/admin/PlanipretAdminLayout"),
  "/planipret/admin/overview": () => import("@/pages/planipret/admin/PAOverview"),
  "/planipret/admin/users": () => import("@/pages/planipret/admin/PAUsers"),
  "/planipret/admin/calls": () => import("@/pages/planipret/admin/PACalls"),
  "/planipret/admin/messages": () => import("@/pages/planipret/admin/PAMessages"),
  "/planipret/admin/recordings": () => import("@/pages/planipret/admin/PARecordings"),
  "/planipret/admin/reports": () => import("@/pages/planipret/admin/PAReports"),
  "/planipret/admin/leads": () => import("@/pages/planipret/admin/PALeads"),
  "/planipret/admin/templates": () => import("@/pages/planipret/admin/PATemplates"),
  "/planipret/admin/integrations": () => import("@/pages/planipret/PlanipretIntegrations"),
  "/planipret/admin/debug": () => import("@/pages/planipret/admin/PADebug"),
  "/planipret/admin/ava": () => import("@/pages/planipret/admin/PAAva"),
  "/planipret/admin/ava-agent": () => import("@/pages/planipret/admin/PAAvaAgent"),
  "/planipret/admin/ava-logs": () => import("@/pages/planipret/admin/PAAvaLogs"),
  "/planipret/admin/audit": () => import("@/pages/planipret/admin/PAAuditLog"),
  "/planipret/admin/audit-checklist": () => import("@/pages/planipret/admin/PAAuditChecklist"),
  "/planipret/admin/compliance": () => import("@/pages/planipret/admin/PACompliance"),
  "/planipret/admin/mobile-devices": () => import("@/pages/planipret/admin/PAMobileDevices"),
  "/planipret/admin/sip-diagnostic": () => import("@/pages/planipret/admin/PASipDiagnostic"),
  "/planipret/admin/diagnostics": () => import("@/pages/planipret/admin/PADiagnostics"),

  // Planipret mobile screens
  "/mplanipret": () => import("@/pages/planipret/mobile/MHome"),
  "/mplanipret/home": () => import("@/pages/planipret/mobile/MHome"),
  "/mplanipret/calls": () => import("@/pages/planipret/mobile/MCalls"),
  "/mplanipret/messages": () => import("@/pages/planipret/mobile/MMessages"),
  "/mplanipret/voicemail": () => import("@/pages/planipret/mobile/MVoicemail"),
  "/mplanipret/contacts": () => import("@/pages/planipret/mobile/MContacts"),
  "/mplanipret/more": () => import("@/pages/planipret/mobile/MMore"),
  "/mplanipret/pipeline": () => import("@/pages/planipret/mobile/MPipeline"),
  "/mplanipret/search": () => import("@/pages/planipret/mobile/MSearch"),
  "/mplanipret/stats": () => import("@/pages/planipret/mobile/MStats"),
  "/mplanipret/ava": () => import("@/pages/planipret/mobile/MAvaChat"),
  "/mplanipret/notifications": () => import("@/pages/planipret/mobile/MAvaNotifications"),
  "/mplanipret/extension-sync": () => import("@/pages/planipret/mobile/MExtensionSync"),
  "/mplanipret/ms365-diagnostics": () => import("@/pages/planipret/mobile/MMs365Diagnostics"),
};

const started = new Set<string>();
const done = new Set<string>();

export function prefetchRoute(path: string): void {
  if (!path || done.has(path) || started.has(path)) return;
  // Match by exact path, or by best prefix match.
  const factory =
    registry[path] ||
    Object.entries(registry)
      .filter(([k]) => path === k || path.startsWith(k + "/"))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  if (!factory) return;
  started.add(path);
  Promise.resolve()
    .then(factory)
    .then(() => done.add(path))
    .catch(() => started.delete(path));
}

/**
 * Fire-and-forget: prefetch common next-hops during idle time after boot.
 */
export function scheduleIdlePrefetch(paths: string[]): void {
  const run = () => paths.forEach(prefetchRoute);
  const ric: any = (window as any).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** All mobile Planiprêt routes — used to warm every chunk on app boot. */
export const ALL_MPLANIPRET_PATHS = [
  "/mplanipret/home",
  "/mplanipret/calls",
  "/mplanipret/messages",
  "/mplanipret/voicemail",
  "/mplanipret/contacts",
  "/mplanipret/more",
  "/mplanipret/pipeline",
  "/mplanipret/search",
  "/mplanipret/stats",
  "/mplanipret/ava",
  "/mplanipret/notifications",
  "/mplanipret/extension-sync",
  "/mplanipret/ms365-diagnostics",
];

/** Aggressive: prefetch every mobile chunk immediately on mount. */
export function prefetchAllMplanipret(): void {
  // Kick off right away (microtask) so chunks download in parallel with initial paint.
  Promise.resolve().then(() => ALL_MPLANIPRET_PATHS.forEach(prefetchRoute));
}

// ── Aliases pour PlanipretMobile.tsx ─────────────────────────────────────────

/** Alias of ALL_MPLANIPRET_PATHS — kept for backward compatibility. */
export const ALL_MOBILE_TAB_PATHS = ALL_MPLANIPRET_PATHS;

/** Alias of prefetchAllMplanipret — kept for backward compatibility. */
export function prefetchAllMobileTabs(): void {
  prefetchAllMplanipret();
}

/** Cancel any in-flight prefetch requests (no-op — prefetches are fire-and-forget). */
export function cancelPendingPrefetches(): void {
  // Nothing to cancel — prefetches are microtask-based and non-cancellable.
  // This function exists to satisfy import contracts.
}
