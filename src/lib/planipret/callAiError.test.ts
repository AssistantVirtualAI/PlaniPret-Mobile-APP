import { describe, expect, it } from "vitest";
import { callAiErrorMessage, callAiResultMessage } from "./callAiError";

describe("call AI error presentation", () => {
  const fallback = "Analyse IA indisponible, réessayez.";

  it("remplace le message Edge générique par un état d’analyse en cours", async () => {
    const error = { context: new Response(JSON.stringify({ locked: true, message: "Analyse en cours, réessayez dans un instant." }), { status: 200 }) };
    await expect(callAiErrorMessage(error, fallback)).resolves.toBe("Analyse en cours. Réessayez dans un instant.");
  });

  it("n’expose pas les détails internes d’une réponse Edge", async () => {
    const error = { context: new Response(JSON.stringify({ error: "AI providers failed", claude: "private debug", lovable: "private fallback" }), { status: 502 }) };
    await expect(callAiErrorMessage(error, fallback)).resolves.toBe(fallback);
  });

  it("explique une transcription absente sans afficher un code serveur", () => {
    expect(callAiResultMessage({ success: false, error: "TRANSCRIPT_MISSING" }, fallback)).toBe("Aucune transcription à analyser.");
  });

  it("garde un message local sûr si la réponse est illisible", async () => {
    const error = { context: new Response("pas du JSON", { status: 500 }) };
    await expect(callAiErrorMessage(error, fallback)).resolves.toBe(fallback);
  });
});
