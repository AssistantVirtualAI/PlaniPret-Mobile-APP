// mobile-click-to-call-status:
// Server-side gate that tells the mobile client whether the "Use Click-to-Call
// instead" button should be enabled. Returns { enabled, reason }.
//
// Click-to-call goes through fusionpbx-proxy → originate-click-to-call, which
// in turn calls the FusionPBX `commands` REST API. That endpoint requires the
// FusionPBX API user to have BOTH `command_add` and `command_edit` permissions.
//
// Until the PBX administrator grants those permissions we keep the button
// disabled and surface the precise reason in the UI. The Vault flag
// CLICK_TO_CALL_ENABLED=1 flips the gate on without a code change.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ enabled: false, reason: "Not authenticated" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ enabled: false, reason: "Not authenticated" }, 401);

    const flag = (Deno.env.get("CLICK_TO_CALL_ENABLED") || "").trim().toLowerCase();
    const enabled = flag === "1" || flag === "true" || flag === "yes";

    if (enabled) {
      return json({
        enabled: true,
        reason: null,
        source: "vault:CLICK_TO_CALL_ENABLED",
      });
    }

    return json({
      enabled: false,
      reason:
        "Server-side originate is disabled: the FusionPBX API user lacks the " +
        "“command_add / command_edit” permission required by the /commands " +
        "REST endpoint. Ask the PBX admin to grant both permissions, then set " +
        "CLICK_TO_CALL_ENABLED=1 in the backend Vault.",
      source: "default",
      required: ["command_add", "command_edit"],
    });
  } catch (e) {
    return json({ enabled: false, reason: String((e as Error).message || e) }, 500);
  }
});
