// End-to-end language test: verifies that the language selected by the user in
// the Planiprêt mobile app is honoured all the way from AVA brief generation
// (pp-ava-brief) through AVA chat replies (pp-ava-chat), for both FR and EN.
//
// Credentials: set AVA_E2E_EMAIL / AVA_E2E_PASSWORD (or TEST_USER / TEST_PASS)
// in the root .env. Without them the network tests are skipped (ignored), while
// the pure language-detection assertions still run.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const EMAIL = Deno.env.get("AVA_E2E_EMAIL") ?? Deno.env.get("TEST_USER") ?? "";
const PASSWORD = Deno.env.get("AVA_E2E_PASSWORD") ?? Deno.env.get("TEST_PASS") ?? "";
const HAS_CREDS = Boolean(SUPABASE_URL && ANON_KEY && EMAIL && PASSWORD);

// ---------------------------------------------------------------------------
// Language detection helpers (pure — always tested)
// ---------------------------------------------------------------------------

const FR_MARKERS = [
  "aujourd", "appels", "manqué", "manques", "courriel", "rendez-vous", "textos",
  "vous", "votre", "boîte vocale", "cette semaine", "prochaine", "journée",
  "clients", "avez", "êtes", "à faire", "priorité", "rappeler",
];

const EN_MARKERS = [
  "today", "calls", "missed", "email", "meeting", "texts", "your", "you",
  "voicemail", "this week", "next", "clients", "have", "follow up", "priority",
  "call back", "the ", " and ",
];

function countMarkers(text: string, markers: string[]): number {
  const t = text.toLowerCase();
  return markers.reduce((n, m) => (t.includes(m) ? n + 1 : n), 0);
}

/** Returns "fr", "en" or "unknown" for a chunk of assistant-generated text. */
export function detectLanguage(text: string): "fr" | "en" | "unknown" {
  const fr = countMarkers(text, FR_MARKERS);
  const en = countMarkers(text, EN_MARKERS);
  if (fr === en) return "unknown";
  return fr > en ? "fr" : "en";
}

/** Flattens every human-readable string of a brief/chat payload. */
function collectText(payload: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  return out.join(" \n ");
}

Deno.test("detectLanguage recognises French assistant copy", () => {
  const fr = "Bonjour, vous avez 3 appels manqués aujourd'hui et un rendez-vous à confirmer.";
  assertEquals(detectLanguage(fr), "fr");
});

Deno.test("detectLanguage recognises English assistant copy", () => {
  const en = "You have 3 missed calls today and one meeting to confirm. Follow up with your clients.";
  assertEquals(detectLanguage(en), "en");
});

// ---------------------------------------------------------------------------
// Shared HTTP helpers
// ---------------------------------------------------------------------------

async function signIn(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  assert(res.ok, `sign-in failed (${res.status}): ${JSON.stringify(data)}`);
  assert(data.access_token, "no access_token returned");
  return data.access_token as string;
}

async function callFunction(name: string, token: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text(); // always consume the body
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { status: res.status, ok: res.ok, data, text };
}

// ---------------------------------------------------------------------------
// End-to-end: brief -> chat, FR and EN
// ---------------------------------------------------------------------------

for (const lang of ["fr", "en"] as const) {
  Deno.test({
    name: `AVA brief + chat respond in ${lang.toUpperCase()} when language="${lang}"`,
    ignore: !HAS_CREDS,
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
      const token = await signIn();

      // 1) Brief generation must echo the requested language and produce copy
      //    written in that language.
      const brief = await callFunction("pp-ava-brief", token, {
        period: "day",
        language: lang,
        force: true,
      });
      assert(brief.ok, `pp-ava-brief failed (${brief.status}): ${brief.text.slice(0, 400)}`);
      assertEquals(brief.data?.language, lang, "brief did not echo the requested language");
      assert(typeof brief.data?.headline === "string" && brief.data.headline.length > 0,
        "brief has no headline");

      const briefText = collectText({
        headline: brief.data.headline,
        overview: brief.data.overview,
        priorities: brief.data.priorities,
        risks: brief.data.risks,
        highlights: brief.data.highlights,
        metrics: (brief.data.metrics ?? []).map((m: any) => m?.label),
        suggestions: (brief.data.suggestions ?? []).map((s: any) => s?.label),
      });
      const briefLang = detectLanguage(briefText);
      assert(
        briefLang === lang || briefLang === "unknown",
        `brief text looks like "${briefLang}" but "${lang}" was requested:\n${briefText.slice(0, 600)}`,
      );

      // 2) The chat assistant must reply in the same selected language.
      const question = lang === "fr"
        ? "Résume ma journée en quelques phrases."
        : "Summarize my day in a few sentences.";
      const chat = await callFunction("pp-ava-chat", token, {
        mode: "chat",
        user_message: question,
        language: lang,
        history: [],
      });
      assert(chat.ok, `pp-ava-chat failed (${chat.status}): ${chat.text.slice(0, 400)}`);
      const reply = String(chat.data?.reply ?? "");
      assert(reply.length > 0, "chat returned an empty reply");

      const chatText = collectText({
        reply,
        suggestions: (chat.data?.suggestions ?? []).map((s: any) => s?.label),
      });
      const chatLang = detectLanguage(chatText);
      assert(
        chatLang === lang || chatLang === "unknown",
        `chat reply looks like "${chatLang}" but "${lang}" was requested:\n${chatText.slice(0, 600)}`,
      );

      // 3) Cross-check: the two surfaces agree on the same language.
      if (briefLang !== "unknown" && chatLang !== "unknown") {
        assertEquals(chatLang, briefLang, "brief and chat replied in different languages");
      }
    },
  });
}

Deno.test({
  name: "AVA chat switching language mid-session changes the reply language",
  ignore: !HAS_CREDS,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const token = await signIn();
    const sessionBody = (language: "fr" | "en", user_message: string) => ({
      mode: "chat", user_message, language, history: [],
    });

    const fr = await callFunction("pp-ava-chat", token, sessionBody("fr", "Combien d'appels manqués aujourd'hui ?"));
    assert(fr.ok, `FR chat failed (${fr.status}): ${fr.text.slice(0, 300)}`);
    const en = await callFunction("pp-ava-chat", token, sessionBody("en", "How many missed calls today?"));
    assert(en.ok, `EN chat failed (${en.status}): ${en.text.slice(0, 300)}`);

    const frLang = detectLanguage(String(fr.data?.reply ?? ""));
    const enLang = detectLanguage(String(en.data?.reply ?? ""));
    assert(frLang !== "en", `expected a French reply, got: ${String(fr.data?.reply ?? "").slice(0, 300)}`);
    assert(enLang !== "fr", `expected an English reply, got: ${String(en.data?.reply ?? "").slice(0, 300)}`);
  },
});
