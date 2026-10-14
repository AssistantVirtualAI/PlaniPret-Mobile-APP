import { describe, expect, it } from "vitest";
import { ms365ActionResult } from "../../supabase/functions/ava-tool-executor/ms365ActionResult";

describe("résultat Microsoft 365 annoncé par AVA", () => {
  it("ne confirme pas un calendrier sans succès explicite ni event_id", () => {
    expect(ms365ActionResult({ success: false, error: "not_connected" }, {
      action: "calendar", successMessage: "RDV créé", requiredId: null,
    })).toMatchObject({ success: false, error: "not_connected" });

    expect(ms365ActionResult({ success: true }, {
      action: "calendar", successMessage: "RDV créé", requiredId: null,
    })).toMatchObject({ success: false, error: "calendar_id_missing" });
  });

  it("annonce le rendez-vous seulement avec le résultat Microsoft vérifiable", () => {
    expect(ms365ActionResult({ success: true, event_id: "evt-1" }, {
      action: "calendar", successMessage: "RDV créé", requiredId: "evt-1",
    })).toEqual({ success: true, message: "RDV créé", id: "evt-1" });
  });

  it("ne présente jamais un courriel refusé comme envoyé", () => {
    expect(ms365ActionResult({ success: false, details: { message: "Graph 403" } }, {
      action: "email", successMessage: "Courriel envoyé",
    })).toMatchObject({ success: false, error: "Graph 403" });
  });
});
