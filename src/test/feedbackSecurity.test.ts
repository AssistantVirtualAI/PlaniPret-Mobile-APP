import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeFeedbackPage } from "../lib/planipret/avaFeedback";

const migration = readFileSync(resolve(__dirname, "../../supabase/migrations/20260923190000_feedback_security_hardening.sql"), "utf8");
const notifier = readFileSync(resolve(__dirname, "../../supabase/functions/pp-feedback-notify/index.ts"), "utf8");

describe("Feedback security hardening", () => {
  it("normalise les pages pour ne jamais exposer les identifiants client", () => {
    expect(safeFeedbackPage("/mplanipret/clients-360/secret-client-key?tab=docs")).toBe("Application Planiprêt");
    expect(safeFeedbackPage("/mplanipret/tasks/123")).toBe("Tâches");
    expect(safeFeedbackPage("/mplanipret/contacts?id=abc")).toBe("Contacts");
  });

  it("versionne le bucket privé, les limites et les politiques membres", () => {
    expect(migration).toContain("INSERT INTO storage.buckets");
    expect(migration).toContain("'pp-feedback-screenshots'");
    expect(migration).toContain("5242880");
    expect(migration).toContain("public.is_planipret_member(NEW.reporter_id)");
    expect(migration).toContain("feedback_screenshot_not_owned");
    expect(migration).toContain("pp_feedback_reports_reporter_idempotency_idx");
    expect(migration).toContain("feedback_rate_limited");
  });

  it("contrôle la livraison par réclamation atomique et sans destinataire client", () => {
    expect(migration).toContain("claim_pp_feedback_notification");
    expect(notifier).toContain("Deno.env.get(\"PP_FEEDBACK_EMAIL\")");
    expect(notifier).not.toMatch(/body\.to|body\?\.to|body\.email|body\?\.email/);
    expect(notifier).toContain("Idempotency-Key");
    expect(notifier).toContain("belongsToReporter");
    expect(notifier).toContain("SIGNED_URL_SECONDS = 60 * 60");
  });
});
