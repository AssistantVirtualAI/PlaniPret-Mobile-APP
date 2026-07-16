import { useEffect, useState } from "react";

const KEY = "planipret-dark-mode";

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {}
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem(KEY, dark ? "1" : "0"); } catch {}
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v), setDark };
}
