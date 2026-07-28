import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Load only the two critical font weights synchronously; the rest is lazy.
import "@fontsource/urbanist/600.css";
import "@fontsource/epilogue/400.css";
import App from "./App.tsx";
import { Capacitor } from "@capacitor/core";

// Render React immediately for the fastest first paint.
ReactDOM.createRoot(document.getElementById("root")!).render(
  Capacitor.isNativePlatform() ? (
    <App />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);

// Defer everything non-critical until the browser is idle so the initial
// route (Auth, Landing) can paint as fast as possible.
type IdleCb = (cb: () => void) => number;
const idle: IdleCb =
  (typeof window !== "undefined" && (window as any).requestIdleCallback) ||
  ((cb: () => void) => window.setTimeout(cb, 200));

idle(() => {
  // Extra font weights.
  import("@fontsource/urbanist/500.css");
  import("@fontsource/urbanist/700.css");
  import("@fontsource/epilogue/500.css");
  import("@fontsource/epilogue/600.css");

  // Diagnostics & guards (not needed for first paint).
  import("./lib/reloadDiagnostics");
  import("./lib/devPreviewGuard");
  import("./lib/styleHealthGuard");
  import("./lib/buildVersionPoller");
  import("./lib/sentry").then((m) => m.initSentry?.());
  import("./lib/perfMetrics").then((m) => m.initPerfMetrics?.());

  // Consume ?ava_token=... in the background — Supabase auth state listener
  // will pick up the resulting session and route accordingly.
  import("./lib/auth/consumeAppLoginToken").then((m) => m.consumeAppLoginToken?.());

  // Prefetch admin routes after boot.
  import("./lib/routePrefetch").then((m) =>
    m.scheduleIdlePrefetch?.([
      "/planipret/admin/overview",
      "/planipret/admin/calls",
      "/planipret/admin/messages",
      "/planipret/admin/recordings",
      "/planipret/admin/ava",
      "/planipret/admin/reports",
    ])
  );
});
