import { useCallback, useEffect, useState } from "react";
import { MP_DICT, type MpLang, type MpDict } from "@/lib/i18n/mplanipret";
import { useLanguage } from "@/context/LanguageContext";

const KEY = "mplanipret-lang";
const GLOBAL_KEY = "ava-language";

function detect(): MpLang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "fr" || v === "en") return v;
    const global = localStorage.getItem(GLOBAL_KEY);
    if (global === "fr" || global === "en") return global;
  } catch {}
  if (typeof navigator !== "undefined") {
    return (navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
  }
  return "fr";
}

// Simple event-bus so all hook consumers stay in sync.
const listeners = new Set<(l: MpLang) => void>();
function emit(l: MpLang) { listeners.forEach((fn) => fn(l)); }

export function useMplanipretLang() {
  const { language: globalLang, setLanguage: setGlobalLanguage } = useLanguage();
  const [lang, setLangState] = useState<MpLang>(detect);

  useEffect(() => {
    const fn = (l: MpLang) => setLangState(l);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);

  useEffect(() => {
    if (globalLang !== "fr" && globalLang !== "en") return;
    setLangState(globalLang);
    try {
      localStorage.setItem(KEY, globalLang);
      document.documentElement.lang = globalLang;
    } catch {}
    emit(globalLang);
  }, [globalLang]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key === KEY || e.key === GLOBAL_KEY) && (e.newValue === "fr" || e.newValue === "en")) {
        setLangState(e.newValue);
        emit(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLang = useCallback((l: MpLang) => {
    try {
      localStorage.setItem(KEY, l);
      localStorage.setItem(GLOBAL_KEY, l);
      document.documentElement.lang = l;
    } catch {}
    setGlobalLanguage(l);
    setLangState(l);
    emit(l);
  }, [setGlobalLanguage]);

  const toggle = useCallback(() => setLang(lang === "fr" ? "en" : "fr"), [lang, setLang]);

  const t = useCallback(
    (path: string): string => {
      const dict = MP_DICT[lang] as unknown as Record<string, any>;
      const v = path.split(".").reduce<any>((acc, k) => (acc ? acc[k] : undefined), dict);
      return typeof v === "string" ? v : path;
    },
    [lang]
  );

  return { lang, setLang, toggle, t, dict: MP_DICT[lang] as MpDict };
}
