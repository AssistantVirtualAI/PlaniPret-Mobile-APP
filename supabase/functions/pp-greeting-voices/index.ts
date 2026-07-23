// AVA Planiprêt — fetch curated ElevenLabs voices for voicemail greetings.
// Cached in memory for 1h to avoid repeated upstream calls.
import { authBroker, corsHeaders, jsonResponse } from "../_shared/ns-broker.ts";

type Voice = {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_url: string;
  category: "professional" | "natural" | "custom";
};

// Curated whitelist (FR-CA + FR + EN priorities). Anything else from the
// account is exposed under "custom".
const CURATED: Record<string, Partial<Voice>> = {
  EXAVITQu4vr4xnSDxMaL: { name: "Sarah", language: "EN", gender: "F", category: "professional" },
  XrExE9yKIg1WjnnlVkGX: { name: "Matilda", language: "EN", gender: "F", category: "professional" },
  pFZP5JQG7iQjIQuC4Bku: { name: "Lily", language: "EN", gender: "F", category: "natural" },
  cgSgspJ2msm6clMCkdW9: { name: "Jessica", language: "EN", gender: "F", category: "natural" },
  JBFqnCBsd6RMkjVDRZzb: { name: "George", language: "EN", gender: "M", category: "professional" },
  nPczCjzI2devNBz1zQrb: { name: "Brian", language: "EN", gender: "M", category: "professional" },
  onwK4e9ZLuTAKqWW03F9: { name: "Daniel", language: "EN", gender: "M", category: "professional" },
  TX3LPaxmHKxFdv7VOQHJ: { name: "Liam", language: "EN", gender: "M", category: "natural" },
};

let CACHE: { at: number; voices: Voice[] } | null = null;
const TTL = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authBroker(req);
  if ("error" in auth) return auth.error;

  if (CACHE && Date.now() - CACHE.at < TTL) {
    return jsonResponse({ success: true, voices: CACHE.voices, cached: true });
  }

  const key = Deno.env.get("ELEVENLABS_API_KEY");
  if (!key) return jsonResponse({ success: false, error: "elevenlabs_not_configured" }, 200);

  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return jsonResponse({ success: false, error: t || `upstream_${r.status}` }, 200);
    }
    const data = await r.json();
    const all: any[] = data.voices ?? [];
    const out: Voice[] = all.map((v) => {
      const id = v.voice_id;
      const curated = CURATED[id];
      const isCloned = v.category === "cloned" || v.category === "professional";
      return {
        voice_id: id,
        name: curated?.name ?? v.name ?? "Voice",
        language: curated?.language ??
          (v.labels?.language?.toUpperCase?.() ?? v.fine_tuning?.language ?? "EN"),
        gender: curated?.gender ?? (v.labels?.gender?.[0]?.toUpperCase?.() ?? "?"),
        preview_url: v.preview_url ?? "",
        category: (curated?.category ?? (isCloned ? "custom" : "natural")) as Voice["category"],
      };
    });
    // Sort: pro → natural → custom; FR before EN within group.
    const rank = { professional: 0, natural: 1, custom: 2 } as const;
    out.sort((a, b) => {
      const r = rank[a.category] - rank[b.category];
      if (r !== 0) return r;
      const la = a.language.startsWith("FR") ? 0 : 1;
      const lb = b.language.startsWith("FR") ? 0 : 1;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });
    CACHE = { at: Date.now(), voices: out };
    return jsonResponse({ success: true, voices: out, cached: false });
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 200);
  }
});
