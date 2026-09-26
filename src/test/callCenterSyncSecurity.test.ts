import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(resolve(root, "supabase/functions/call-center-sync/index.ts"), "utf8");
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const iosSnippet = readFileSync(resolve(root, "apps/planipret-mobile/native-config/ios-Info.plist.snippet.xml"), "utf8");

describe("call-center-sync security", () => {
  it("requires an authenticated operator and derives the tenant server-side", () => {
    expect(source).toContain("async function requireActor(req: Request)");
    expect(source).toContain('.eq("portal_user_id", userId)');
    expect(source).toContain("organization_id: actor.organizationId");
    expect(source).not.toContain("const organization_id = body.organization_id");
  });

  it("limits agent controls to the authenticated extension and queue assignment", () => {
    expect(source).toContain("agent: `${actor.extension}@${env(\"FUSIONPBX_SIP_DOMAIN\")}`");
    expect(source).toContain("function queueForActor");
    expect(source).toContain("actor.queues.includes(queue)");
  });

  it("validates PBX command values and gates supervisory actions", () => {
    expect(source).toContain("callIdPattern.test(callUuid)");
    expect(source).toContain("actorCanSupervise(actor)");
    expect(source).toContain("actorIsAdmin(actor)");
  });

  it("requires every supervised call to be owned by the operator organization", () => {
    expect(source).toContain("async function callBelongsToOrganization");
    expect(source).toContain('.from("pbx_call_records")');
    expect(source).toContain('.eq("organization_id", organizationId)');
    expect(source).toContain("await callBelongsToOrganization(admin, actor.organizationId, callUuid)");
  });

  it("keeps the Edge JWT gate and does not request photo-library write access", () => {
    expect(config).toMatch(/\[functions\.call-center-sync\]\s*\nverify_jwt\s*=\s*true/);
    expect(iosSnippet).not.toContain("NSPhotoLibraryAddUsageDescription");
  });

  it("does not retain the duplicate feedback hardening migration", () => {
    expect(existsSync(resolve(root, "supabase/migrations/20260923190725_d52bded7-d7a2-49d6-818d-14198ab2a7de.sql"))).toBe(false);
  });
});
