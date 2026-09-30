import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const failures = [];
const check = (condition, message) => {
  if (condition) console.log(`✅ ${message}`);
  else { console.error(`❌ ${message}`); failures.push(message); }
};

// The native candidate retains a historical apps/ copy, but ships the root
// src/ tree. A generated iOS project is the reliable release-tree marker.
const monorepo = exists("apps/planipret-mobile/src") && !exists("ios/App/App/Info.plist");
const mobilePrefix = monorepo ? "apps/planipret-mobile/" : "";
const mobileAddressPath = `${mobilePrefix}src/components/planipret/mobile/AddressAutocomplete.tsx`;
const mobileNotificationsPath = `${mobilePrefix}src/pages/planipret/mobile/MAvaNotifications.tsx`;
const portalAddressPath = "src/components/planipret/mobile/AddressAutocomplete.tsx";
const portalNotificationsPath = "src/pages/planipret/mobile/MAvaNotifications.tsx";

const mobileAddress = read(mobileAddressPath);
const portalAddress = monorepo ? read(portalAddressPath) : mobileAddress;
const edge = read("supabase/functions/pp-address-autocomplete/index.ts");
const config = read("supabase/config.toml");
const migration = read("supabase/migrations/20260930000202_7559113b-294b-4128-91aa-0fc6eef1f83f.sql");
const mobileNotifications = read(mobileNotificationsPath);
const portalNotifications = monorepo ? read(portalNotificationsPath) : mobileNotifications;

check(!monorepo || mobileAddress === portalAddress, "Autocomplete Google identique dans le portail et l’application mobile");
check(mobileAddress.includes("sessionToken") && mobileAddress.includes("Recherche Google indisponible"), "L’interface transmet une session Google et garde un repli manuel visible");
const usesLovableGateway = edge.includes("https://connector-gateway.lovable.dev/google_maps");
const usesDirectGoogle = edge.includes("https://places.googleapis.com/v1");
check(edge.includes('Deno.env.get("GOOGLE_MAPS_API_KEY")') && !edge.includes("VITE_GOOGLE"), "La clé Google reste uniquement côté serveur");
check(usesLovableGateway || usesDirectGoogle, "L’autocomplétion cible une passerelle Google serveur reconnue");
check(!usesLovableGateway || (
  edge.includes('Deno.env.get("LOVABLE_API_KEY")')
  && edge.includes("Authorization: `Bearer ${lovableKey}`")
  && edge.includes('"X-Connection-Api-Key": key')
), "La passerelle Lovable exige ses deux secrets côté Edge");
check(edge.includes('includedRegionCodes: ["ca"]') && edge.includes('"X-Goog-FieldMask": "addressComponents"') && edge.includes('suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'), "Les requêtes Google restent canadiennes et limitent les champs retournés");
check(edge.includes("getUser()") && config.includes("[functions.pp-address-autocomplete]\nverify_jwt = true"), "L’autocomplétion exige une session authentifiée");
check(migration.includes("FOR DELETE TO authenticated") && migration.includes("user_id = auth.uid()"), "La suppression de notifications reste limitée à leur propriétaire");
for (const [name, source] of [["mobile", mobileNotifications], ...(monorepo ? [["portal", portalNotifications]] : [])]) {
  check(!source.includes("confirm("), `La confirmation de suppression ${name} est native à l’application`);
  check(source.includes("AlertDialog") && source.includes(".delete().eq(\"user_id\", u.user.id)") && source.includes("count: \"exact\""), `La suppression ${name} confirme l’action, reste scopée et relit le résultat`);
}

if (failures.length) process.exit(1);
console.log("✅ Contrat adresse Google et notifications validé.");
