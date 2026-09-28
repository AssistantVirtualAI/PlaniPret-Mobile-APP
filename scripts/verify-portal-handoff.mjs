import assert from "node:assert/strict";
import { resolvePlanipretPortalTarget } from "../supabase/functions/_shared/planipret-portal-target.mjs";

assert.equal(resolvePlanipretPortalTarget(true), "/planipret/admin");
assert.equal(resolvePlanipretPortalTarget(false), "/planipret/broker");
assert.equal(resolvePlanipretPortalTarget(true, "/planipret/admin/users"), "/planipret/admin/users");
assert.equal(resolvePlanipretPortalTarget(false, "/planipret/admin/users"), "/planipret/broker");
assert.equal(resolvePlanipretPortalTarget(true, "/planipret/broker/feedback"), "/planipret/broker/feedback");
assert.equal(resolvePlanipretPortalTarget(false, "/untrusted/path"), "/planipret/broker");
console.log("PASS portal handoff role policy");
