import { useMemo } from "react";

import { translations } from "@/locales";
import { useLanguage } from "@/context/LanguageContext";

type Lang = "fr" | "en";

function getNestedValue(obj: any, path: string): unknown {
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function getString(lang: Lang, path: string): string {
  const value = getNestedValue(translations[lang], path);
  return typeof value === "string" ? value : path;
}

export function useBilingualTranslation() {
  const { language } = useLanguage();

  const secondaryLanguage: Lang = language === "fr" ? "en" : "fr";

  return useMemo(
    () => ({
      language,
      secondaryLanguage,
      bt: (path: string) => ({
        primary: getString(language, path),
        secondary: getString(secondaryLanguage, path),
      }),
    }),
    [language, secondaryLanguage]
  );
}
