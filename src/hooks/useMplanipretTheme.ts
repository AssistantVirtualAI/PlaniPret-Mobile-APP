import { useCallback, useEffect, useState } from "react";

export type MpTheme = "light" | "dark";
const KEY = "mplanipret-theme";

function detect(): MpTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  // Default dark for the native iOS app (Aurora dark theme).
  // The user can still toggle to light via the moon/sun button.
  return "dark";
}

const listeners = new Set<(t: MpTheme) => void>();

function applyToDom(t: MpTheme) {
  if (typeof document === "undefined") return;
  // Apply to all planipret-mobile-scope elements
  document.querySelectorAll<HTMLElement>(".planipret-mobile-scope").forEach((el) => {
    el.setAttribute("data-pp-theme", t);
  });
  // Also apply to root html element so global variables resolve correctly
  document.documentElement.setAttribute("data-pp-theme", t);
}

export function useMplanipretTheme() {
  const [theme, setThemeState] = useState<MpTheme>(detect);

  useEffect(() => {
    applyToDom(theme);
    const fn = (t: MpTheme) => { setThemeState(t); applyToDom(t); };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [theme]);

  const setTheme = useCallback((t: MpTheme) => {
    try { localStorage.setItem(KEY, t); } catch {}
    applyToDom(t);
    listeners.forEach((fn) => fn(t));
  }, []);

  const toggle = useCallback(() => setTheme(theme === "light" ? "dark" : "light"), [theme, setTheme]);

  return { theme, setTheme, toggle };
}
