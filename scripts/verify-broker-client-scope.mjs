import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const requireText = (relative, text, label) => {
  if (!source(relative).includes(text)) throw new Error(`${label}: missing ${JSON.stringify(text)} in ${relative}`);
};
const requireAbsent = (relative, text, label) => {
  if (source(relative).includes(text)) throw new Error(`${label}: unsafe ${JSON.stringify(text)} in ${relative}`);
};

const gateway = "supabase/functions/maestro-actions/index.ts";
// The delivery repository retains a source snapshot under apps/, but its
// canonical signed application lives at its root. The revision marker exists
// only in that delivery layout.
const mobileRoot = fs.existsSync(path.join(root, ".lovable-planipret-source-revision"))
  ? "."
  : "apps/planipret-mobile";
const mobileCache = path.posix.join(mobileRoot, "src/lib/ppContactsCache.ts");
const portalCache = "src/lib/ppContactsCache.ts";

requireText(gateway, "if (!isServiceRole && !authenticatedUserId)", "Maestro gateway rejects unauthenticated app callers");
requireText(gateway, "const requested = payload.user_id", "Requested broker id is evaluated server-side");
requireText(gateway, "if (requested && (isAdmin || !callerId)) telecomUserId = requested;", "A signed-in non-admin cannot select another broker");
requireText(gateway, "path = `/users/${telecomUserId}/clients${q}`", "Client list uses the server-resolved broker endpoint");
requireText(gateway, "const cacheKey = `${action}:${telecomUserId}", "Server cache is partitioned by the resolved broker id");
requireAbsent(mobileCache, "user_id: ", "Mobile client cache never sends a broker override");
requireText(mobileCache, "await ensureAuthenticatedCacheScope();", "Mobile client cache verifies the signed-in session before reads");
requireText(mobileCache, "authScopeVerified", "Mobile client cache will not render a persisted Maestro list before session verification");
requireText(portalCache, "await ensureAuthenticatedCacheScope();", "Portal client cache verifies the signed-in session before reads");
requireText(portalCache, "authScopeVerified", "Portal client cache will not render a persisted Maestro list before session verification");

console.log("Broker-scoped Maestro client isolation verification passed (10 invariants).");
