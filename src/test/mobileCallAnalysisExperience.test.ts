import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../pages/planipret/mobile/MCalls.tsx"), "utf8");

describe("expérience mobile de transcription et d'analyse IA", () => {
  it("déclenche une analyse automatique pour une transcription déjà présente", () => {
    expect(source).toContain("if (!hasTranscript && !hasRecording) return;");
    expect(source).toContain("await analyzeAI(transcript, true);");
    expect(source).toContain("body: { call_id: call.id, transcript, force: true }");
    expect(source).toContain('message: automatic\n        ? tr("Analyse automatique en cours…"');
  });

  it("rend visible le chargement, le succès ou l'échec sans boucle d'analyse", () => {
    expect(source).toContain("const [analysisFeedback, setAnalysisFeedback]");
    expect(source).toContain('analysisStatus={analysisFeedback?.kind ?? "idle"}');
    expect(source).toContain('setAnalysisFeedback({ kind: "error", message });');
    expect(source).toContain('setActiveTab("coaching");');
    expect(source).toContain("if (autoRanRef.current === call.id) return;");
  });

  it("définit la traduction locale avant de l'utiliser dans les actions IA", () => {
    expect(source).toContain('const { t, lang } = useMplanipretLang();');
    expect(source).toContain('const tr = (fr: string, en: string) => lang === "fr" ? fr : en;');
    expect(source.indexOf('const tr = (fr: string, en: string)')).toBeLessThan(
      source.indexOf('const fallback = tr("Analyse IA indisponible, réessayez."'),
    );
  });

  it("utilise des bulles de transcription à contraste élevé sur iPhone", () => {
    expect(source).toContain('color: "#F8FAFC"');
    expect(source).toContain('background: right ? "linear-gradient(135deg, #1D4ED8, #0E7490)" : "#17233F"');
    expect(source).toContain('className="px-3.5 py-2.5 text-[15px] leading-relaxed font-medium"');
  });
});
