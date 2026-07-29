import { useEffect, useRef, useState } from "react";

export function useAvaDraft(userId: string | undefined, contactKey: string = "global") {
  const key = userId ? `pp-ava-draft:${userId}:${contactKey}` : null;
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined" || !key) return "";
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!key) return;
    try {
      const stored = localStorage.getItem(key) ?? "";
      setValue(stored);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (v: string) => {
    setValue(v);
    if (!key) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (v.trim()) localStorage.setItem(key, v);
        else localStorage.removeItem(key);
      } catch {}
    }, 400);
  };

  const clear = () => {
    setValue("");
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
  };

  return [value, update, clear] as const;
}
