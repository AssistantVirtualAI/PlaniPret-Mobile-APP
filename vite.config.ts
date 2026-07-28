import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { componentTagger } from "lovable-tagger";

const BUILD_ID = Date.now().toString(36);
const BUILD_TIME = new Date().toISOString();

const avaCacheBustPlugin = (monitoringUrl = "", monitoringKey = ""): Plugin => {
  let outDir = "dist";
  const bootScript = `
    <meta name="ava-build-id" content="${BUILD_ID}" />
    <meta name="ava-build-time" content="${BUILD_TIME}" />
    <script>
      (() => {
        const BUILD_ID = "${BUILD_ID}";
        const BUILD_TIME = "${BUILD_TIME}";
        const isProd = !location.hostname.includes("lovableproject.com") && location.hostname !== "localhost" && location.port !== "8080";
        if (!isProd) return;
        const VERSION_KEY = "ava_app_build_id";
        const FORCE_KEY = "ava_force_reload_count:" + BUILD_ID;
        const EVENTS_KEY = "ava_cache_bust_events";
        const STYLE_RELOAD_KEY = "ava_style_reload_count:" + BUILD_ID;
        const MONITORING_URL = ${JSON.stringify(monitoringUrl)};
        const MONITORING_KEY = ${JSON.stringify(monitoringKey)};
        const showToast = (message) => {
          try {
            const id = "ava-cache-bust-toast";
            document.getElementById(id)?.remove();
            const el = document.createElement("div");
            el.id = id;
            el.setAttribute("role", "status");
            el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:10px;border:1px solid hsl(231 100% 60% / .38);background:hsl(240 6% 13% / .96);box-shadow:0 18px 54px hsl(0 0% 0% / .42);color:hsl(0 0% 98%);font:700 13px/1.4 Inter,system-ui,sans-serif";
            el.textContent = message;
            document.body?.appendChild(el);
            setTimeout(() => el.remove(), 7000);
          } catch (_) {}
        };
        const remember = (event, details = {}) => {
          const entry = { at: new Date().toISOString(), buildId: BUILD_ID, event, details };
          console.info("%c[AVA cache-bust]", "color:#0023e6;font-weight:700", entry);
          try {
            const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]").slice(-24);
            events.push(entry);
            localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
            window.__avaCacheBustEvents = events;
          } catch (_) {}
          if (MONITORING_URL && MONITORING_KEY) {
            fetch(MONITORING_URL + "/functions/v1/portal-guard-log", {
              method: "POST",
              keepalive: true,
              headers: { "Content-Type": "application/json", apikey: MONITORING_KEY, Authorization: "Bearer " + MONITORING_KEY },
              body: JSON.stringify({ events: [entry] }),
            }).catch(() => {});
          }
        };
        const clearBrowserCaches = async () => {
          const regs = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
          await Promise.all(regs.map((reg) => reg.unregister()));
          await navigator.serviceWorker?.register?.("/sw.js?_ava_kill=" + Date.now().toString(36), { scope: "/" }).catch(() => undefined);
          const keys = await window.caches?.keys?.().catch(() => []) || [];
          await Promise.all(keys.map((key) => caches.delete(key)));
          remember("cache-cleared", { serviceWorkers: regs.length, caches: keys.length });
        };
        const hasRuntimeStyles = () => {
          if (!document.body) return true;
          const probe = document.createElement("div");
          probe.className = "hidden p-4 bg-primary text-primary-foreground rounded-lg";
          probe.style.position = "absolute";
          probe.style.pointerEvents = "none";
          probe.style.visibility = "hidden";
          document.body.appendChild(probe);
          const hasTokens = !!getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
          const styles = getComputedStyle(probe);
          const ok = hasTokens && styles.display === "none" && styles.paddingTop !== "0px";
          probe.remove();
          return ok;
        };
        const injectStylesheet = (href) => new Promise((resolve) => {
          const absolute = new URL(href, location.origin).toString();
          if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === absolute)) return resolve(true);
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = absolute + (absolute.includes("?") ? "&" : "?") + "_ava_css=" + Date.now().toString(36);
          link.onload = () => resolve(true);
          link.onerror = () => resolve(false);
          document.head.appendChild(link);
        });
        const repairStyles = async (reason) => {
          if (hasRuntimeStyles()) return remember("style-check-ok", { reason });
          showToast("CSS manquant détecté — réparation automatique du portail…");
          remember("missing-styles", { reason, href: location.href });
          try {
            const res = await fetch("/version.json?_ava_css=" + Date.now().toString(36), { cache: "no-store", headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
            const latest = res.ok ? await res.json() : null;
            await Promise.all((latest?.css || []).map(injectStylesheet));
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (hasRuntimeStyles()) return remember("styles-recovered", { source: "version-json" });
          } catch (error) {
            remember("style-repair-failed", { message: String(error?.message || error) });
          }
          const count = Number(sessionStorage.getItem(STYLE_RELOAD_KEY) || "0") + 1;
          sessionStorage.setItem(STYLE_RELOAD_KEY, String(count));
          if (count <= 1) return hardReload("missing-styles-" + reason);
          remember("style-reload-loop-stopped", { reason, count });
        };
        const hardReload = async (reason) => {
          const count = Number(sessionStorage.getItem(FORCE_KEY) || "0") + 1;
          sessionStorage.setItem(FORCE_KEY, String(count));
          remember("hard-reload", { reason, count });
          showToast("Version invalide détectée — rechargement complet du portail…");
          if (count > 6) return remember("reload-loop-stopped", { reason });
          await clearBrowserCaches();
          const url = new URL(location.href);
          url.searchParams.set("_ava_b", BUILD_ID);
          url.searchParams.set("_r", Date.now().toString(36));
          url.searchParams.delete("__vite_recovered");
          location.replace(url.toString());
        };
        const checkVersion = async () => {
          const stored = localStorage.getItem(VERSION_KEY);
          if (stored && stored !== BUILD_ID && new URL(location.href).searchParams.get("_ava_b") !== BUILD_ID) {
            localStorage.setItem(VERSION_KEY, BUILD_ID);
            showToast("Nouvelle version détectée — rechargement automatique…");
            remember("version-mismatch", { stored, current: BUILD_ID });
            return hardReload("html-build-changed");
          }
          localStorage.setItem(VERSION_KEY, BUILD_ID);
          try {
            const res = await fetch("/version.json?_r=" + Date.now().toString(36), { cache: "no-store", headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
            if (res.ok) {
              const latest = await res.json();
              remember("version-check", { current: BUILD_ID, latest: latest.buildId });
              if (latest.buildId && latest.buildId !== BUILD_ID) {
                showToast("Version invalide détectée — rechargement automatique…");
                remember("version-mismatch", { current: BUILD_ID, latest: latest.buildId });
                return hardReload("version-json-newer");
              }
            }
          } catch (error) {
            remember("version-check-failed", { message: String(error?.message || error) });
          }
        };
        window.__avaCacheBust = { BUILD_ID, BUILD_TIME, checkVersion, hardReload, clearBrowserCaches, events: () => JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]") };
        clearBrowserCaches();
        checkVersion();
        window.addEventListener("error", (event) => {
          const target = event.target;
          if (target?.tagName === "LINK" && target.rel === "stylesheet") {
            remember("stylesheet-load-error", { href: target.href });
            setTimeout(() => repairStyles("stylesheet-error"), 200);
          }
        }, true);
        const runStyleRepair = () => setTimeout(() => repairStyles("boot"), 1000);
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runStyleRepair, { once: true }); else runStyleRepair();
        window.addEventListener("pageshow", runStyleRepair);
        window.addEventListener("focus", runStyleRepair);
        setInterval(checkVersion, 60000);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });
      })();
    </script>`;

  return {
    name: "ava-cache-bust",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html: string) {
      return html.replace("</head>", `${bootScript}\n</head>`);
    },
    closeBundle() {
      const indexPath = path.resolve(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const html = fs.readFileSync(indexPath, "utf8");
      const cssLinks = Array.from(html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/g)).map((match) => match[1]);
      fs.copyFileSync(indexPath, path.resolve(outDir, `index.${BUILD_ID}.html`));
      fs.writeFileSync(path.resolve(outDir, "version.json"), JSON.stringify({ buildId: BUILD_ID, buildTime: BUILD_TIME, index: `index.${BUILD_ID}.html`, css: cssLinks }));
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      protocol: "wss",
      clientPort: 443,
    },
    headers: {
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  build: {
    minify: "esbuild",
    target: "chrome120",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    reportCompressedSize: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Keep third-party code in one vendor chunk to avoid circular vendor chunk
          // evaluation where Radix reads React before React's CommonJS wrapper has run.
          return "vendor";
        },
      },
    },
  },

  plugins: [
    react(),
    avaCacheBustPlugin(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
});
