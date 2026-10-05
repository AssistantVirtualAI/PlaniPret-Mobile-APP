/** Inline bilingual string for text without a dictionary key. Reads the current app language. */
export function tr(fr: string, en: string): string {
  try {
    const v = localStorage.getItem("mplanipret-lang") ?? localStorage.getItem("ava-language");
    if (v === "en") return en;
    if (v === "fr") return fr;
  } catch {}
  return fr;
}
