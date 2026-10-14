import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const calls = readFileSync(resolve(__dirname, "../pages/planipret/mobile/MCalls.tsx"), "utf8");
const maestro = readFileSync(resolve(__dirname, "../components/planipret/mobile/call/MaestroTab.tsx"), "utf8");
const dictionary = readFileSync(resolve(__dirname, "../lib/i18n/mplanipret.ts"), "utf8");

describe("fiche d'appel mobile : CRM, IA et défilement", () => {
  it("envoie la transcription affichée au bouton CRM sans ignorer le cache serveur", () => {
    const handler = maestro.slice(maestro.indexOf("const runAiAnalysis"), maestro.indexOf("const doPush"));
    expect(maestro).toContain('body: { call_id: call.id, transcript, force: true }');
    expect(handler).toContain("callAiErrorMessage(error, fallback)");
    expect(handler).toContain("callAiResultMessage(data, fallback)");
    expect(handler).not.toContain("description: (data as any)?.error ?? error?.message");
  });

  it("laisse le serveur chercher un segment jumeau et garde l'envoi CRM explicite", () => {
    expect(calls).not.toContain('if (!transcript?.trim()) {');
    expect(calls).toContain('if (!hasInsight) {');
    expect(maestro).not.toContain("hasTranscript");
    expect(maestro).toContain("disabled={analyzing}");
    expect(maestro).toContain("!call.maestro_synced && (");
    expect(maestro).toContain("explicit_user_action: true");
  });

  it("rend la feuille au-dessus de la barre et laisse une seule zone tactile défiler", () => {
    expect(calls).toContain('import { createPortal } from "react-dom"');
    expect(calls).toContain('return createPortal((');
    expect(calls).toContain('className="fixed inset-0 z-[20000] flex items-end"');
    expect(calls).toContain('), document.body);');
    expect(calls).toContain('className="relative w-full flex flex-col min-h-0 overflow-hidden"');
    expect(calls).toContain('WebkitOverflowScrolling: "touch"');
    expect(calls).toContain('overscrollBehaviorY: "contain"');
    expect(calls).toContain('touchAction: "pan-y"');
    expect(calls).toContain('paddingBottom: "max(2rem, env(safe-area-inset-bottom))"');
  });

  it("garde les onglets, les actions Texte et le bouton Coach réellement tactiles", () => {
    expect(calls).toContain('className="absolute inset-0"');
    expect(calls).toContain('aria-label={t("common.close")}');
    expect(calls).not.toContain('className="fixed inset-0 z-[20000] flex items-end" onClick={onClose}');
    expect(calls).toContain('data-testid="call-transcript-analyze"');
    expect(calls).toContain('data-testid="call-coach-analyze"');
    expect(calls).toContain('data-testid="call-coach-fetch-transcript"');
    expect(calls).toContain('onPointerDown={(event) => event.stopPropagation()}');
    expect(calls).toContain('onTouchEnd={(event) => { event.preventDefault(); event.stopPropagation();');
    expect(calls).toContain('touchAction: "manipulation"');
    expect(calls).toContain('minHeight: 44');
    expect(calls).toContain('minHeight: 48');
  });

  it("nomme explicitement la synchronisation CRM manuelle", () => {
    expect(dictionary).toContain('push: "Synchroniser avec Maestro"');
    expect(dictionary).toContain('push: "Sync with Maestro"');
  });
});
