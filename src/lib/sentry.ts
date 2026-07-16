// Sentry initialization - only activates when VITE_SENTRY_DSN is configured
export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn) {
    console.info("Sentry DSN not configured, skipping initialization");
    return;
  }

  // Dynamically import Sentry only when DSN is configured
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      environment: import.meta.env.MODE,
    });
  }).catch((err) => {
    console.warn("Failed to initialize Sentry:", err);
  });
};

export const captureException = (error: Error, context?: Record<string, unknown>) => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    import("@sentry/react").then((Sentry) => {
      Sentry.captureException(error, { extra: context });
    });
  } else {
    console.error("Error captured:", error, context);
  }
};

export const captureMessage = (message: string, level: "info" | "warning" | "error" = "info") => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    import("@sentry/react").then((Sentry) => {
      Sentry.captureMessage(message, level);
    });
  } else {
    console.log(`[${level}] ${message}`);
  }
};
