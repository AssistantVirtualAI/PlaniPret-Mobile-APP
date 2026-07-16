import { supabase } from "@/integrations/supabase/client";

export type PortalGuardLevel = "info" | "warning" | "error";

export interface PortalGuardEvent {
  at: string;
  event: string;
  buildId?: string;
  level?: PortalGuardLevel;
  details?: Record<string, unknown>;
}

const QUEUE_KEY = "ava_portal_guard_event_queue";
const LEGACY_KEYS = ["ava_cache_bust_events", "ava_style_guard_events"];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const readQueue = (): PortalGuardEvent[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeQueue = (events: PortalGuardEvent[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-80)));
  } catch {}
};

export const showPortalGuardToast = (message: string, level: PortalGuardLevel = "warning") => {
  if (typeof document === "undefined") return;
  const id = "ava-portal-guard-toast";
  document.getElementById(id)?.remove();
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "max-width:min(420px,calc(100vw - 32px))",
    "padding:12px 14px",
    "border-radius:10px",
    "border:1px solid hsl(231 100% 60% / .38)",
    "background:hsl(240 6% 13% / .96)",
    "box-shadow:0 18px 54px hsl(0 0% 0% / .42)",
    "color:hsl(0 0% 98%)",
    "font:700 13px/1.4 Inter,system-ui,sans-serif",
  ].join(";");
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), level === "error" ? 9000 : 6000);
};

export const flushPortalGuardEvents = async () => {
  if (typeof localStorage === "undefined") return;
  const queued = readQueue();
  if (!queued.length) return;

  const { error } = await supabase.functions.invoke("portal-guard-log", {
    body: { events: queued },
  });

  if (!error) writeQueue([]);
};

export const trackPortalGuardEvent = (event: string, details: Record<string, unknown> = {}, level: PortalGuardLevel = "info") => {
  const entry: PortalGuardEvent = {
    at: new Date().toISOString(),
    event,
    level,
    buildId: typeof details.buildId === "string" ? details.buildId : undefined,
    details: {
      ...details,
      url: typeof location !== "undefined" ? location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    },
  };

  console[level === "error" ? "error" : level === "warning" ? "warn" : "info"]("[AVA portal-guard]", entry);

  if (typeof localStorage !== "undefined") {
    writeQueue([...readQueue(), entry]);
    for (const key of LEGACY_KEYS) {
      try {
        const legacy = JSON.parse(localStorage.getItem(key) || "[]");
        if (legacy.length) {
          writeQueue([...readQueue(), ...legacy.map((item: PortalGuardEvent) => ({ ...item, event: `legacy:${item.event || "unknown"}` }))]);
          localStorage.removeItem(key);
        }
      } catch {}
    }
  }

  if (!flushTimer && typeof window !== "undefined") {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPortalGuardEvents().catch(() => undefined);
    }, 500);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => flushPortalGuardEvents().catch(() => undefined));
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPortalGuardEvents().catch(() => undefined);
  });
}