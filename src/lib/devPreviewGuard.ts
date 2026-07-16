const DEV_RECOVERY_PARAM = "__vite_recovered";
const DISCONNECT_KEY = "ava:vite-disconnected-at";
const RELOAD_KEY = "ava:vite-reload-at";
const OVERLAY_ID = "ava-vite-recovery-overlay";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

const now = () => Date.now();

const readTimestamp = (key: string) => Number(window.sessionStorage.getItem(key) || 0);

const writeTimestamp = (key: string) => {
  window.sessionStorage.setItem(key, String(now()));
};

const clearRecoveryParam = () => {
  const url = new URL(window.location.href);

  if (!url.searchParams.has(DEV_RECOVERY_PARAM)) return;

  url.searchParams.delete(DEV_RECOVERY_PARAM);
  window.sessionStorage.removeItem(DISCONNECT_KEY);
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const hardReloadPreview = () => {
  const lastReloadAt = readTimestamp(RELOAD_KEY);

  if (now() - lastReloadAt < 10000) return;

  writeTimestamp(RELOAD_KEY);

  const url = new URL(window.location.href);
  url.searchParams.set(DEV_RECOVERY_PARAM, String(now()));
  window.location.replace(url.toString());
};

const createOverlay = () => {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "alert");
  overlay.style.cssText = [
    "position:fixed",
    "inset:auto 20px 20px auto",
    "z-index:2147483647",
    "width:min(420px,calc(100vw - 32px))",
    "padding:16px",
    "border:1px solid hsl(42 92% 54% / 0.35)",
    "border-radius:18px",
    "background:hsl(220 100% 99% / 0.92)",
    "box-shadow:0 24px 70px hsl(222 90% 24% / 0.22)",
    "backdrop-filter:blur(22px) saturate(1.35)",
    "color:hsl(222 84% 18%)",
    "font:500 14px/1.45 Inter,system-ui,sans-serif",
  ].join(";");

  overlay.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div style="width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:999px;background:linear-gradient(135deg,hsl(224 100% 45%),hsl(42 92% 54%));color:hsl(0 0% 100%);box-shadow:0 10px 24px hsl(224 100% 45% / 0.28)">↻</div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:800;margin-bottom:3px">Preview reconnecting</div>
        <div style="opacity:.78">Vite server connection lost. The preview will reload cleanly when the dev server is back.</div>
        <button type="button" data-reload-preview style="margin-top:12px;cursor:pointer;border:0;border-radius:999px;padding:9px 14px;background:linear-gradient(135deg,hsl(224 100% 45%),hsl(42 92% 54%));color:hsl(0 0% 100%);font:800 13px/1 Inter,system-ui,sans-serif;box-shadow:0 12px 28px hsl(224 100% 45% / 0.24)">Reload preview</button>
      </div>
    </div>
  `;

  overlay.querySelector("[data-reload-preview]")?.addEventListener("click", hardReloadPreview);
  document.body.appendChild(overlay);

  return overlay;
};

const hideOverlay = () => {
  document.getElementById(OVERLAY_ID)?.remove();
};

const hasRuntimeStyles = () => {
  const probe = document.createElement("div");
  probe.className = "hidden bg-primary text-primary-foreground p-4 rounded-lg";
  document.body.appendChild(probe);

  const styles = getComputedStyle(probe);
  const hasTokens = Boolean(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  const hasTailwindUtilities = styles.display === "none" && styles.paddingTop !== "0px";

  probe.remove();

  return hasTokens && hasTailwindUtilities;
};

const recoverFromMissingStyles = () => {
  if (hasRuntimeStyles()) return;

  writeTimestamp(DISCONNECT_KEY);
  createOverlay();
  hardReloadPreview();
};

const pingDevServer = async () => {
  try {
    const response = await fetch(`/@vite/client?preview-recovery=${now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};

const startRecoveryLoop = () => {
  createOverlay();
};

const isRecoverableDevError = (message: string) =>
  /server connection lost|failed to fetch dynamically imported module|importing a module script failed|error loading.*css|stylesheet/i.test(
    message,
  );

const installErrorFallbacks = () => {
  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    originalLog(...args);

    if (args.some((arg) => isRecoverableDevError(String(arg)))) {
      writeTimestamp(DISCONNECT_KEY);
      startRecoveryLoop();
    }
  };

  window.addEventListener("error", (event) => {
    const message = `${event.message || ""} ${(event.error as Error | undefined)?.message || ""}`;

    if (isRecoverableDevError(message)) {
      writeTimestamp(DISCONNECT_KEY);
      startRecoveryLoop();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || "");

    if (isRecoverableDevError(reason)) {
      writeTimestamp(DISCONNECT_KEY);
      startRecoveryLoop();
    }
  });
};

const installViteHmrRecovery = () => {
  import.meta.hot?.on("vite:ws:disconnect", () => {
    writeTimestamp(DISCONNECT_KEY);
    startRecoveryLoop();
  });

  import.meta.hot?.on("vite:ws:connect", () => {
    const disconnectedAt = readTimestamp(DISCONNECT_KEY);

    if (disconnectedAt && now() - disconnectedAt < 120000) {
      hardReloadPreview();
      return;
    }

    hideOverlay();
  });
};

const installStyleHealthCheck = () => {
  const run = () => window.setTimeout(recoverFromMissingStyles, 350);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("pageshow", run);
  window.addEventListener("focus", run);
};

if (import.meta.env.DEV && isBrowser) {
  clearRecoveryParam();
  installErrorFallbacks();
  installViteHmrRecovery();
  installStyleHealthCheck();
}