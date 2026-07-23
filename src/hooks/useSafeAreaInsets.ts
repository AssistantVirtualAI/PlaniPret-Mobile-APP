import { useEffect, useState } from "react";

/**
 * Reads the device's safe-area insets from CSS env() values.
 * Works in Capacitor (iOS/Android) and in any browser that supports
 * viewport-fit=cover + env(safe-area-inset-*).
 *
 * Returns 0 for insets on devices without a notch / when the WebView
 * does not expose them, so it is safe to use on Android.
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = `
      position: fixed;
      top: env(safe-area-inset-top);
      left: env(safe-area-inset-left);
      right: env(safe-area-inset-right);
      bottom: env(safe-area-inset-bottom);
      pointer-events: none;
      visibility: hidden;
    `;
    document.body.appendChild(el);

    const read = () => {
      const rect = el.getBoundingClientRect();
      setInsets({
        top: Math.round(rect.top),
        bottom: Math.round(window.innerHeight - rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(window.innerWidth - rect.right),
      });
    };

    read();
    // Re-read whenever the WebView regains focus/visibility. On iOS, Capacitor
    // may drop the previously-cached safe-area env() values while the app was
    // backgrounded, so we refresh on every resume path.
    const readSoon = () => { read(); setTimeout(read, 120); setTimeout(read, 400); setTimeout(read, 900); };
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", readSoon);
    window.addEventListener("pageshow", readSoon);
    window.addEventListener("focus", readSoon);
    document.addEventListener("visibilitychange", readSoon);
    document.addEventListener("resume", readSoon as EventListener);

    // Capacitor App plugin — fires reliably on iOS/Android when the app
    // returns from background, even when visibilitychange doesn't.
    let capCleanup: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import("@capacitor/app");
        const sub1 = await mod.App.addListener("appStateChange", (state: any) => {
          if (state?.isActive) readSoon();
        });
        const sub2 = await mod.App.addListener("resume", () => readSoon());
        capCleanup = () => { sub1.remove?.(); sub2.remove?.(); };
      } catch { /* not on native — ignore */ }
    })();

    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", readSoon);
      window.removeEventListener("pageshow", readSoon);
      window.removeEventListener("focus", readSoon);
      document.removeEventListener("visibilitychange", readSoon);
      document.removeEventListener("resume", readSoon as EventListener);
      capCleanup?.();
      el.remove();
    };
  }, []);

  return insets;
}

