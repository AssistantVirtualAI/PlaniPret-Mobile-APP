#!/usr/bin/env node
/**
 * verify-aor-mobile.mjs — vérifie que l'AOR mobile (<ext>M, ex. 113M) est bien
 * enregistré par le moteur natif :
 *   • registration-contact contient transport=tls (ou tcp) — jamais wss
 *   • registration-contact / user-agent identifient le client MOBILE
 *     (pp-ua=mobile-<ext>), jamais pp-ua=web-*
 *
 * Usage :
 *   NS_TOKEN=nsr_xxx node scripts/verify-aor-mobile.mjs --ext 113
 *   NS_TOKEN=nsr_xxx node scripts/verify-aor-mobile.mjs --ext 113 --domain planipret.ca --allow tls,tcp
 *
 * Variables d'environnement :
 *   NS_TOKEN   (requis)  Bearer token NetSapiens
 *   NS_BASE    (option)  défaut https://voice.ava-telecom.ca/ns-api/v2
 *   NS_DOMAIN  (option)  défaut planipret.ca
 *
 * Sortie : exit 0 si conforme, exit 1 sinon (utilisable en CI).
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = (process.env.NS_BASE || "https://voice.ava-telecom.ca/ns-api/v2").replace(/\/+$/, "");
const DOMAIN = arg("domain", process.env.NS_DOMAIN || "planipret.ca");
const EXT = String(arg("ext", process.env.NS_EXT || "113")).replace(/[^0-9]/g, "");
const DEVICE = arg("device", `${EXT}M`);
const TOKEN = process.env.NS_TOKEN || process.env.NETSAPIENS_TOKEN || "";
const ALLOWED = String(arg("allow", "tls,tcp"))
  .toLowerCase()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✅ ${msg}`);
}

if (!TOKEN) fail("NS_TOKEN manquant (export NS_TOKEN=nsr_...).");
if (!EXT) fail("--ext invalide.");

const url = `${BASE}/domains/${encodeURIComponent(DOMAIN)}/users/${EXT}/devices/${encodeURIComponent(DEVICE)}`;
console.log(`→ GET ${url}`);

let payload;
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) fail(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  payload = JSON.parse(text);
} catch (e) {
  fail(`requête échouée — ${e?.message ?? e}`);
}

const device = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
const state = String(device["device-sip-registration-state"] ?? "");
const contact = String(device["device-sip-registration-contact"] ?? "");
const userAgent = String(
  device["device-sip-registration-user-agent"] ?? device["user-agent"] ?? device["device-user-agent"] ?? "",
);

console.log(`   state   = ${state || "(vide)"}`);
console.log(`   contact = ${contact || "(vide)"}`);
console.log(`   ua      = ${userAgent || "(vide)"}`);

const problems = [];

if (state.toLowerCase() !== "registered") {
  problems.push(`registration-state = "${state || "vide"}" (attendu "registered")`);
}

const transportMatch = contact.match(/transport=([a-z]+)/i);
const transport = (transportMatch?.[1] ?? "").toLowerCase();
if (!transport) {
  problems.push("aucun paramètre transport= dans registration-contact");
} else if (!ALLOWED.includes(transport)) {
  problems.push(`transport=${transport} interdit (attendu ${ALLOWED.join(" ou ")}) — l'AOR mobile est volé par la WebView`);
}

const uaTagMatch = contact.match(/pp-ua=([a-z0-9-]+)/i);
const uaTag = (uaTagMatch?.[1] ?? "").toLowerCase();
const mobileTag = `mobile-${EXT}`;
const combined = `${contact} ${userAgent}`.toLowerCase();

if (uaTag) {
  if (uaTag !== mobileTag) {
    problems.push(`pp-ua=${uaTag} (attendu pp-ua=${mobileTag}) — client non mobile enregistré sur ${DEVICE}`);
  }
} else if (!/pjsip|planipret[- ]?(ios|android|mobile)|capacitor/i.test(combined)) {
  problems.push(`aucun marqueur client mobile (pp-ua=${mobileTag} / PJSIP) dans contact ou user-agent`);
}

if (/pp-ua=web-/i.test(combined) || /jssip/i.test(combined)) {
  problems.push("client WEB (JsSIP / pp-ua=web-*) détecté sur l'AOR mobile");
}

if (problems.length) {
  console.error("");
  problems.forEach((p) => console.error(`❌ ${p}`));
  console.error("");
  console.error("→ Correctif : relancer le provisioning natif (ns-provision-broker-devices, transport tls/tcp)");
  console.error("  et vérifier qu'aucune session web n'utilise clientType \"mobile\".");
  process.exit(1);
}

ok(`${DEVICE}@${DOMAIN} enregistré en transport=${transport} avec un client mobile (${uaTag || userAgent || "PJSIP"})`);
