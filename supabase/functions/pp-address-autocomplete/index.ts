import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return json({ error: "not_configured", suggestions: [] });

  const body = await req.json().catch(() => ({}));
  const lang = body.language === "en" ? "en" : "fr";
  const sessionToken = typeof body.sessionToken === "string" && body.sessionToken.length <= 128
    ? body.sessionToken
    : undefined;
  try {
    if (body.action === "details" && typeof body.placeId === "string") {
      const placeId = body.placeId.trim().slice(0, 256);
      if (!placeId) return json({ error: "invalid_place" }, 400);
      const session = sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : "";
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${lang}${session}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "addressComponents" },
      });
      const d = await r.json();
      if (!r.ok) return json({ error: "google_error" }, 502);
      const get = (t: string, short = false) => {
        const c = (d.addressComponents ?? []).find((x: any) => x.types?.includes(t));
        return c ? (short ? c.shortText : c.longText) : "";
      };
      return json({
        streetNumber: get("street_number"),
        route: get("route"),
        city: get("locality") || get("sublocality") || get("administrative_area_level_3"),
        region: get("administrative_area_level_1", true),
        zip: get("postal_code"),
      });
    }
    const input = String(body.input ?? "").trim().slice(0, 200);
    if (input.length < 3) return json({ suggestions: [] });
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({ input, includedRegionCodes: ["ca"], languageCode: lang, includedPrimaryTypes: ["street_address", "premise", "subpremise"], ...(sessionToken ? { sessionToken } : {}) }),
    });
    const d = await r.json();
    if (!r.ok) return json({ error: "google_error", suggestions: [] }, 502);
    return json({
      suggestions: (d.suggestions ?? []).filter((s: any) => s.placePrediction).slice(0, 5).map((s: any) => ({
        placeId: s.placePrediction.placeId,
        text: s.placePrediction.text?.text ?? "",
      })),
    });
  } catch {
    return json({ error: "google_error", suggestions: [] }, 502);
  }
});
