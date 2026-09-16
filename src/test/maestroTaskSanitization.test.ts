import { describe, expect, it } from "vitest";
import { maestroPlainText, normalizeTask } from "../../supabase/functions/_shared/planipret-tasks";

describe("Maestro task rich-text normalization", () => {
  it("converts Maestro HTML and encoded entities into readable task text", () => {
    expect(maestroPlainText('<p class="p1">Parlez de la gestion des taxes&nbsp;: r&eacute;sidence permanente</p>'))
      .toBe("Parlez de la gestion des taxes : résidence permanente");
  });

  it("never returns raw HTML in task fields or the raw task payload", () => {
    const task = normalizeTask({
      referral_option_id: 42,
      notes: "<p>Suivi&nbsp;client</p>",
      description: '<table><tr><td><strong>Étape</strong></td><td>Préapprobation</td></tr></table>',
      stage: "<p>À analyser</p>",
      users_id: 387460525,
    });

    expect(task.notes).toBe("Suivi client");
    expect(task.description).toBe("Étape Préapprobation");
    expect(task.raw.stage).toBe("À analyser");
    expect(JSON.stringify(task.raw)).not.toContain("<p");
    expect(JSON.stringify(task.raw)).not.toContain("<table");
  });
});
