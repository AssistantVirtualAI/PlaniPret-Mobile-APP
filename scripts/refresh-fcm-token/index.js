/**
 * Cloud Function — refresh-fcm-token
 *
 * Génère un nouveau token OAuth2 FCM via les Application Default Credentials
 * et met à jour le secret FCM_ACCESS_TOKEN dans Supabase.
 *
 * Déploiement :
 *   gcloud functions deploy refresh-fcm-token \
 *     --runtime=nodejs20 \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --set-env-vars SUPABASE_URL=https://VOTRE_REF.supabase.co,SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE \
 *     --service-account=planipret-fcm-sender@lemtel-softphone.iam.gserviceaccount.com \
 *     --project=lemtel-softphone \
 *     --region=us-central1
 *
 * Cloud Scheduler (toutes les 55 min) :
 *   gcloud scheduler jobs create http fcm-token-refresh \
 *     --schedule="*/55 * * * *" \
 *     --uri=https://us-central1-lemtel-softphone.cloudfunctions.net/refresh-fcm-token \
 *     --http-method=GET \
 *     --location=us-central1 \
 *     --project=lemtel-softphone
 */

const { GoogleAuth } = require("google-auth-library");

exports.refreshFcmToken = async (req, res) => {
  try {
    // Obtenir un token via les credentials du service account attaché à la Cloud Function
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken) {
      console.error("[refresh-fcm-token] Failed to obtain access token");
      return res.status(500).json({ error: "Failed to obtain access token" });
    }

    // Mettre à jour le secret FCM_ACCESS_TOKEN dans Supabase via l'API Management
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[refresh-fcm-token] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return res.status(500).json({ error: "Missing Supabase config" });
    }

    // Extraire le project ref depuis l'URL Supabase (ex: abcdefgh.supabase.co → abcdefgh)
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

    const updateRes = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { name: "FCM_ACCESS_TOKEN", value: accessToken },
        ]),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text().catch(() => "");
      console.error("[refresh-fcm-token] Failed to update Supabase secret", err);
      return res.status(500).json({ error: "Failed to update Supabase secret", detail: err });
    }

    console.log("[refresh-fcm-token] FCM_ACCESS_TOKEN updated successfully");
    return res.status(200).json({ ok: true, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("[refresh-fcm-token] Error", e);
    return res.status(500).json({ error: e.message });
  }
};
