import assert from "node:assert/strict";
import { resolvePlanipretPortalTarget } from "../supabase/functions/_shared/planipret-portal-target.mjs";

assert.equal(resolvePlanipretPortalTarget(true), "/planipret/admin");
assert.equal(resolvePlanipretPortalTarget(false), "/planipret/broker");
assert.equal(resolvePlanipretPortalTarget(true, "/planipret/admin/users"), "/planipret/admin/users");
assert.equal(resolvePlanipretPortalTarget(false, "/planipret/admin/users"), "/planipret/broker");
assert.equal(resolvePlanipretPortalTarget(true, "/planipret/broker/feedback"), "/planipret/broker/feedback");
assert.equal(resolvePlanipretPortalTarget(false, "/untrusted/path"), "/planipret/broker");
const r = resolvePlanipretPortalTarget;
assert.equal(r(false, "/planipret/broker/../admin"), "/planipret/broker");
assert.equal(r(false, "/planipret/broker//marketing"), "/planipret/broker");
assert.equal(r(false, "/planipret/broker%2Fmarketing"), "/planipret/broker");
assert.equal(r(false, "/planipret/broker/marketing?x=1"), "/planipret/broker");
assert.equal(r(false, "/planipret/admin"), "/planipret/broker");
assert.equal(r(false, "/planipret/broker/marketing"), "/planipret/broker/marketing");
assert.equal(r(true, "/planipret/broker/../admin"), "/planipret/admin");
assert.equal(r(true, "/planipret/admin/overview"), "/planipret/admin/overview");
for (const bad of ["/planipret/broker-elevated", "/planipret/brokerage", "/planipret/administer", "/planipret/broker/.", "/planipret/broker/./x", "/planipret/broker/#x", "/planipret/broker\\x", "/planipret/broker/", "planipret/broker", ""]) {
  assert.equal(r(false, bad), "/planipret/broker", bad);
  assert.equal(r(true, bad), "/planipret/admin", bad);
}
console.log("PASS portal handoff role policy");
