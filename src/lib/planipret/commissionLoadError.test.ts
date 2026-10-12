import { describe, expect, it } from "vitest";
import { commissionLoadMessage } from "./commissionLoadError";

describe("commissionLoadMessage", () => {
  it("ne laisse jamais remonter le message Edge générique", () => {
    expect(commissionLoadMessage("Edge Function returned a non-2xx status code", true))
      .toBe("Le rapport de commissions est temporairement indisponible. Réessayez dans un instant.");
  });

  it("distingue les délais et les sessions expirées", () => {
    expect(commissionLoadMessage("The operation was aborted", true))
      .toBe("Le rapport prend plus de temps que prévu. Réessayez dans un instant.");
    expect(commissionLoadMessage("401 unauthorized", false))
      .toBe("Your session expired. Sign in again and retry.");
  });
});
