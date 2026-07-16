import { APP_VERSION, BUILD_ID, hardReload } from "@/lib/version";
import { showPortalGuardToast, trackPortalGuardEvent } from "@/lib/portalGuardMonitoring";

const STYLE_EVENTS_KEY = "ava_style_guard_events";
const STYLE_RELOAD_KEY = `ava_style_reload_count:${BUILD_ID}`;
const OVERLAY_ID = "ava-style-repair-overlay";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

const remember = (event: string, details: Record<string, unknown> = {}) => {
  const entry = { at: new Date().toISOString(), buildId: BUILD_ID, event, details };
  console.warn("%c[AVA style-guard]", "color:#0023e6;font-weight:700", entry);
  trackPortalGuardEvent(event, { ...details, buildId: BUILD_ID, version: APP_VERSION }, event.includes("failed") || event.includes("missing") ? "warning" : "info");

  try {
    const events = JSON.parse(localStorage.getItem(STYLE_EVENTS_KEY) || "[]").slice(-24);
    events.push(entry);
    localStorage.setItem(STYLE_EVENTS_KEY, JSON.stringify(events));
    (window as any).__avaStyleGuardEvents = events;
  } catch {}
};

const hasRuntimeStyles = () => {
  if (!document.body) return true;

  const probe = document.createElement("div");
  probe.className = "hidden p-4 bg-primary text-primary-foreground rounded-lg";
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  const rootStyles = getComputedStyle(document.documentElement);
  const probeStyles = getComputedStyle(probe);
  const hasTokens = Boolean(rootStyles.getPropertyValue("--primary").trim());
  const hasUtilities = probeStyles.display === "none" && probeStyles.paddingTop !== "0px";

  probe.remove();
  return hasTokens && hasUtilities;
};

const showOverlay = () => {
  if (!document.body || document.getElementById(OVERLAY_ID)) return;

  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("role", "alert");
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:grid",
    "place-items:center",
    "padding:24px",
    "background:hsl(240 6% 10% / .96)",
    "color:hsl(0 0% 98%)",
    "font:500 15px/1.45 Inter,system-ui,sans-serif",
  ].join(";");
  el.innerHTML = `
    <div style="width:min(460px,100%);border:1px solid hsl(231 100% 60% / .35);border-radius:14px;padding:20px;background:hsl(240 6% 13%);box-shadow:0 24px 80px hsl(0 0% 0% / .45)">
      <div style="font-weight:800;font-size:18px;margin-bottom:8px">Réparation de l’affichage…</div>
      <div style="color:hsl(218 15% 75%);margin-bottom:14px">Le portail a détecté une ancienne version sans styles. Cache en cours de nettoyage.</div>
      <div style="font:600 11px/1.3 ui-monospace,monospace;color:hsl(218 15% 75%);margin-bottom:16px">${APP_VERSION}</div>
      <button type="button" data-ava-style-repair style="cursor:pointer;border:0;border-radius:8px;padding:11px 14px;background:linear-gradient(135deg,hsl(231 100% 50%),hsl(280 85% 55%));color:white;font:800 13px/1 Inter,system-ui,sans-serif">Réparer maintenant</button>
    </div>
  `;
  (window as any).__avaStyleGuardForceRepair = () => {
    sessionStorage.removeItem(STYLE_RELOAD_KEY);
    trackPortalGuardEvent("style-repair-button-clicked", { buildId: BUILD_ID, version: APP_VERSION }, "warning");
    void hardReload("style-guard-user-repair");
  };
  el.querySelector("[data-ava-style-repair]")?.addEventListener("click", () => (window as any).__avaStyleGuardForceRepair());
  document.body.appendChild(el);
};

const hideOverlay = () => document.getElementById(OVERLAY_ID)?.remove();

const injectStylesheet = (href: string) =>
  new Promise<boolean>((resolve) => {
    const absolute = new URL(href, location.origin).toString();
    if ([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((link) => link.href === absolute)) {
      resolve(true);
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${absolute}${absolute.includes("?") ? "&" : "?"}_ava_css=${Date.now().toString(36)}`;
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });

const tryInjectLatestCss = async () => {
  const targets = [location.pathname || "/", "/"];
  const discovered = new Set<string>();

  if (import.meta.env.DEV) discovered.add("/src/index.css");

  try {
    const version = await fetch(`/version.json?_ava_css=${Date.now().toString(36)}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
    if (version.ok) {
      const latest = await version.json();
      (latest?.css || []).forEach((href: string) => discovered.add(href));
    }
  } catch (error) {
    remember("version-css-discovery-failed", { message: String((error as Error)?.message || error) });
  }

  for (const target of targets) {
    try {
      const response = await fetch(`${target}?_ava_css_probe=${Date.now().toString(36)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      });
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => discovered.add(link.getAttribute("href") || ""));
    } catch (error) {
      remember("css-discovery-failed", { target, message: String((error as Error)?.message || error) });
    }
  }

  remember("css-discovered", { count: discovered.size, hrefs: [...discovered] });
  await Promise.all([...discovered].map(injectStylesheet));
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  return hasRuntimeStyles();
};

const recoverStyles = async (reason: string) => {
  if (hasRuntimeStyles()) {
    hideOverlay();
    return;
  }

  showOverlay();
  showPortalGuardToast("CSS manquant détecté — réparation automatique en cours…", "warning");
  remember("missing-styles", { reason, href: location.href });

  if (await tryInjectLatestCss()) {
    remember("styles-recovered-by-injection");
    hideOverlay();
    return;
  }

  const count = Number(sessionStorage.getItem(STYLE_RELOAD_KEY) || "0") + 1;
  sessionStorage.setItem(STYLE_RELOAD_KEY, String(count));
  remember("style-hard-reload", { count });

  if (count <= 1) await hardReload(`style-guard-${reason}`);
  else {
    remember("style-reload-loop-stopped", { reason, count });
    hideOverlay();
  }
};

const installStylesheetErrorLogger = () => {
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLLinkElement | null;
      if (target?.tagName === "LINK" && target.rel === "stylesheet") {
        remember("stylesheet-load-error", { href: target.href });
        window.setTimeout(() => recoverStyles("stylesheet-error"), 200);
      }
    },
    true,
  );
};

if (isBrowser) {
  (window as any).__avaStyleGuard = { hasRuntimeStyles, recoverStyles, events: () => JSON.parse(localStorage.getItem(STYLE_EVENTS_KEY) || "[]") };
  installStylesheetErrorLogger();

  let lastRunAt = 0;
  const run = () => {
    const now = Date.now();
    if (now - lastRunAt < 30_000) return; // throttle to avoid reload loops
    lastRunAt = now;
    window.setTimeout(() => recoverStyles("health-check"), 900);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}