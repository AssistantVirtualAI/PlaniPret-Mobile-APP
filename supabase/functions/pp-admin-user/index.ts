import { authBroker, corsHeaders, jsonResponse, logAudit, supaAdmin } from "../_shared/ns-broker.ts";

const NS_API_KEY = Deno.env.get("NS_API_KEY") ?? "";
const NS_API_BASE_URL = Deno.env.get("NS_API_BASE_URL") ?? "https://voice.ava-telecom.ca/ns-api/v2";
const NS_DEFAULT_DOMAIN = Deno.env.get("NS_DEFAULT_DOMAIN") ?? "planipret.ca";
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

/** Auto-provision a per-broker ElevenLabs conversational agent. Best-effort. */
async function provisionBrokerAgent(
  admin: ReturnType<typeof supaAdmin>,
  brokerUserId: string,
): Promise<{ agent_id: string | null; error?: string }> {
  if (!ELEVENLABS_API_KEY) return { agent_id: null, error: "no_elevenlabs_key" };
  try {
    const { data: prof } = await admin
      .from("planipret_profiles")
      .select("id, full_name, extension, email, ava_voice_id, elevenlabs_agent_id")
      .eq("user_id", brokerUserId)
      .maybeSingle();
    if (!prof) return { agent_id: null, error: "no_profile" };
    if (prof.elevenlabs_agent_id) return { agent_id: prof.elevenlabs_agent_id };

    const firstName = String(prof.full_name || prof.extension || "courtier").split(/\s+/)[0];
    const body = {
      name: `AVA — ${prof.full_name || prof.extension}`,
      conversation_config: {
        agent: {
          prompt: {
            prompt: `Tu es AVA, l'assistante vocale IA personnelle de ${prof.full_name || prof.extension} (extension ${prof.extension}), courtier hypothécaire Planiprêt. Tu parles en français canadien, chaleureuse et efficace. Tu peux consulter ses appels, messages vocaux, SMS, emails Microsoft 365, contacts et deals Maestro, et déclencher des actions via les outils disponibles.`,
            llm: "gemini-2.0-flash-001",
            temperature: 0.7,
            max_tokens: 500,
          },
          first_message: `Bonjour ${firstName}, je suis AVA. Comment puis-je t'aider?`,
          language: "fr",
        },
        tts: {
          model_id: "eleven_turbo_v2_5",
          voice_id: prof.ava_voice_id || "EXAVITQu4vr4xnSDxMaL",
          agent_output_audio_format: "pcm_16000",
          optimize_streaming_latency: 4,
          stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true,
        },
        conversation: {
          max_duration_seconds: 1800,
          client_events: ["audio", "interruption", "user_transcript", "agent_response", "agent_response_correction"],
        },
      },
      platform_settings: { widget: { is_disabled: true }, overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true, language: true }, tts: { voice_id: true } } } },
    };
    const r = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { agent_id: null, error: (data as any)?.detail?.message || `HTTP ${r.status}` };
    const agentId = (data as any)?.agent_id ?? null;
    if (agentId) {
      await admin.from("planipret_profiles").update({ elevenlabs_agent_id: agentId }).eq("user_id", brokerUserId);
    }
    return { agent_id: agentId };
  } catch (e: any) {
    return { agent_id: null, error: e?.message ?? "provision_failed" };
  }
}


/** Direct NS-API call using service bearer key (admin ops). */
async function nsFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${NS_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NS_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

import { assignDidToExtension } from "../_shared/pp-did-routing.ts";

function nsUserPayload(fullName: string, email: string, extension: string, password?: string) {
  const [firstName, ...rest] = String(fullName || extension).trim().split(/\s+/);
  const lastName = rest.join(" ") || "Courtier";
  return {
    user: extension,
    "name-first-name": firstName || extension,
    "name-last-name": lastName,
    "directory-name": fullName || extension,
    "email-address": email,
    "user-scope": "Basic User",
    "time-zone": "America/Montreal",
    "language-token": "fr_CA",
    "voicemail-enabled": "yes",
    "recording-configuration": "yes-with-transcription-and-sentiment",
    "dial-policy": "US and Canada",
    "voicemail-transcription-enabled": "Deepgram",
    "email-send-alert-new-voicemail-enabled": "yes",
    "email-send-alert-new-missed-call-enabled": "yes",
    "ring-no-answer-timeout-seconds": 30,
    ...(password ? { "user-password": password, password } : {}),
  };
}

async function ensureNsUser(fullName: string, email: string, extension: string, password?: string) {
  const check = await nsFetch(`/domains/${encodeURIComponent(NS_DEFAULT_DOMAIN)}/users/${encodeURIComponent(extension)}`);
  if (check.ok) return { ok: true, existed: true, status: check.status };
  const created = await nsFetch(`/domains/${encodeURIComponent(NS_DEFAULT_DOMAIN)}/users`, {
    method: "POST",
    body: JSON.stringify(nsUserPayload(fullName, email, extension, password)),
  });
  if (!created.ok && created.status !== 409) return { ok: false, status: created.status, data: created.data };
  const verify = await nsFetch(`/domains/${encodeURIComponent(NS_DEFAULT_DOMAIN)}/users/${encodeURIComponent(extension)}`);
  return { ok: verify.ok || created.ok || created.status === 409, created: created.ok, status: verify.status || created.status, data: created.data };
}

/** Full removal from the phone system: devices first, then the subscriber. */
async function deleteNsUserFull(domain: string, extension: string) {
  const out: any = { extension, devices_deleted: 0, user_status: null, ok: false };
  try {
    const devs = await nsFetch(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices`);
    const list = Array.isArray(devs.data) ? devs.data : (devs.data?.devices ?? []);
    for (const d of list) {
      const id = String(d?.device ?? d?.aor ?? d?.["device-sip-registration-user"] ?? "").replace(/^sip:/, "").split("@")[0];
      if (!id) continue;
      const r = await nsFetch(
        `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (r.ok || r.status === 404) out.devices_deleted++;
    }
  } catch { /* best effort */ }
  const del = await nsFetch(
    `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}`,
    { method: "DELETE" },
  );
  out.user_status = del.status;
  out.ok = del.ok || del.status === 404;
  return out;
}

/** All NS subscribers of the domain (paginated). */
async function nsListUsers(domain: string): Promise<any[]> {
  const all: any[] = [];
  const seen = new Set<string>();
  // NS-API v2 paginates with `start` (offset), not `page`.
  for (let start = 0; start < 20000; start += 200) {
    const r = await nsFetch(`/domains/${encodeURIComponent(domain)}/users?limit=200&start=${start}`);
    const items = Array.isArray(r.data) ? r.data : (r.data?.users ?? []);
    if (!r.ok || items.length === 0) break;
    let added = 0;
    for (const u of items) {
      const key = String(u?.user ?? u?.extension ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(u);
      added++;
    }
    if (items.length < 200 || added === 0) break;
  }
  return all;
}


const nsEmailOf = (u: any) => String(u?.email ?? u?.["email-address"] ?? u?.email_address ?? "").trim().toLowerCase();
const nsExtOf = (u: any) => String(u?.user ?? u?.extension ?? u?.user_id ?? u?.id ?? "").trim();



/** Ensure the user is a member of the org so portal guards (organizations list) let them in. */
async function ensureOrgMembership(
  admin: ReturnType<typeof supaAdmin>,
  userId: string,
  orgId: string,
  isAdmin: boolean,
) {
  try {
    const { data: existing } = await admin.from("organization_members")
      .select("id").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
    if (!existing) {
      await admin.from("organization_members").insert({
        user_id: userId,
        organization_id: orgId,
        accepted_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error("organization_members", e); }
  try {
    await admin.from("org_members").upsert(
      { user_id: userId, org_id: orgId, role: isAdmin ? "customer_admin" : "user" },
      { onConflict: "user_id,org_id" },
    );
  } catch (e) { console.error("org_members", e); }
}

function randomPassword(len = 22): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
  return s;
}

/**
 * Ensure the broker has a dedicated {ext}_mobile SIP device on NS so the
 * mobile app rings in parallel with the widget. Never touches the widget
 * device — that provisioning is locked upstream.
 */
async function ensureMobileDevice(
  admin: ReturnType<typeof supaAdmin>,
  brokerId: string,
  extension: string,
  domain: string,
): Promise<{ device_id: string; created: boolean; error?: string }> {
  const targetId = `${extension}_mobile`;
  const password = randomPassword(22);
  const createRes = await nsFetch(
    `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(extension)}/devices`,
    {
      method: "POST",
      body: JSON.stringify({
        device: targetId,
        "authentication-key": password,
        "device-provisioning-protocol": "sip",
        "device-model": "Mobile Softphone",
      }),
    },
  );

  if (!createRes.ok && createRes.status !== 409) {
    try {
      await admin.from("planipret_ns_migration_log").insert({
        broker_id: brokerId, action: "create_mobile_device", status: "error",
        details: { device_id: targetId, ns_status: createRes.status, response: createRes.data },
      });
    } catch { /* ignore */ }
    return { device_id: targetId, created: false, error: `NS ${createRes.status}` };
  }

  const secretName = `pp_sip_${brokerId}_mobile`;
  try {
    await admin.rpc("create_planipret_sip_secret", {
      _name: secretName, _value: password, _broker_id: brokerId,
    });
  } catch (e) {
    console.error("vault_store_failed", (e as Error).message);
  }
  await admin.from("planipret_profiles")
    .update({ ns_mobile_device_id: targetId, ns_sip_password_ref_mobile: secretName })
    .eq("id", brokerId);

  try {
    await admin.from("planipret_ns_migration_log").insert({
      broker_id: brokerId, action: "create_mobile_device", status: "ok",
      details: { device_id: targetId },
    });
  } catch { /* ignore */ }

  return { device_id: targetId, created: true };
}

/**
 * Assigne automatiquement le premier DID disponible à un nouveau poste.
 * Écriture ciblée d'UN numéro (payload complet) + relecture obligatoire :
 * sans `dial-rule-translation-destination-user`, le PBX répond
 * « the number can't be completed as dialled ».
 */
async function autoAssignDid(admin: any, extension: string, fullName?: string) {
  try {
    const { data: free } = await admin
      .from("planipret_did_assignments")
      .select("phone_number_e164")
      .eq("domain", NS_DEFAULT_DOMAIN)
      .eq("status", "available")
      .is("extension", null)
      .order("phone_number_digits")
      .limit(1)
      .maybeSingle();
    const e164 = String(free?.phone_number_e164 ?? "");
    if (!e164) {
      return { assigned: false, reason: "no_available_did", diagnostic: "Aucun numéro disponible dans l'inventaire DID." };
    }
    const r = await assignDidToExtension(NS_DEFAULT_DOMAIN, e164, extension);
    if (r.verified) {
      await admin.from("planipret_did_assignments")
        .update({
          status: "assigned",
          extension,
          display_name: fullName ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("domain", NS_DEFAULT_DOMAIN)
        .eq("phone_number_digits", r.phone_number);
    }
    await admin.from("planipret_did_routing_snapshots").insert({
      domain: NS_DEFAULT_DOMAIN,
      phone_number: r.phone_number,
      destination_user: r.live.destination_user,
      dial_rule_application: r.live.dial_rule_application,
      dial_rule_parameter: r.live.dial_rule_parameter,
      description: r.live.description,
      enabled: r.live.enabled,
      source: "auto_assign_new_user",
    });
    return { assigned: r.verified, e164, extension, diagnostic: r.diagnostic };
  } catch (e) {
    return { assigned: false, reason: "error", diagnostic: String((e as Error)?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authBroker(req);
    if ("error" in auth) return auth.error;
    const { profile } = auth;
    if (profile.role !== "admin") return jsonResponse({ success: false, error: "Admin requis" }, 403);

    const admin = supaAdmin();
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body ?? {};

    if (action === "create") {
      const { email, password, full_name, ns_extension, mobile_app_enabled, voice_agent_enabled, elevenlabs_agent_id } = payload ?? {};
      if (!email || !password || !full_name || !ns_extension) {
        return jsonResponse({ success: false, error: "Champs requis manquants" }, 400);
      }
      if (/@lemtel\.com$/i.test(String(email).trim())) {
        return jsonResponse({ success: false, error: "Les emails @lemtel.com appartiennent à Lemtel et ne peuvent pas être ajoutés à Planiprêt." }, 422);
      }
      const { data: existing } = await admin.from("planipret_profiles").select("id").eq("extension", ns_extension).maybeSingle();
      if (existing) return jsonResponse({ success: false, error: "Extension déjà utilisée" }, 400);

      // 1) Provision the NetSapiens user (extension) so it exists in the
      //    phone system BEFORE we wire up the Supabase profile. That way,
      //    the widget + softphone can register immediately.
      const nsUserRes = await ensureNsUser(full_name, email, ns_extension, password);
      if (!nsUserRes.ok) {
        return jsonResponse({
          success: false,
          error: `Échec création téléphone: ${nsUserRes.status} ${JSON.stringify(nsUserRes.data).slice(0, 200)}`,
        }, 200);
      }

      // 2) Supabase auth user
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (cErr || !created.user) return jsonResponse({ success: false, error: cErr?.message ?? "Échec création auth" }, 200);

      // 3) Local profile
      const { data: newProfile, error: pErr } = await admin.from("planipret_profiles").insert({
        user_id: created.user.id,
        organization_id: profile.organization_id,
        email,
        full_name,
        extension: ns_extension,
        ns_extension,
        ns_domain: NS_DEFAULT_DOMAIN,
        ns_linked: true,
        ns_linked_at: new Date().toISOString(),
        role: "broker",
        mobile_app_enabled: mobile_app_enabled ?? true,
        voice_agent_enabled: voice_agent_enabled ?? false,
        elevenlabs_agent_id: elevenlabs_agent_id || null,
      }).select("id").maybeSingle();
      if (pErr || !newProfile) {
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ success: false, error: pErr?.message ?? "Profil non créé" }, 200);
      }
      await admin.from("user_roles").upsert({
        user_id: created.user.id,
        organization_id: profile.organization_id,
        role: "planipret_broker",
      }, { onConflict: "user_id,organization_id" });
      await ensureOrgMembership(admin, created.user.id, profile.organization_id, false);

      // 4) Dedicated {ext}_mobile device so the mobile app rings in parallel
      //    with the widget (widget device is NEVER touched here).
      const mobile = await ensureMobileDevice(admin, newProfile.id, ns_extension, NS_DEFAULT_DOMAIN);

      // 5) Assignation automatique d'un DID au nouveau poste : sans destination
      //    `user_XXXX` dans le PBX, l'opérateur répond « the number can't be
      //    completed as dialled ». Écriture ciblée + relecture obligatoire.
      const did = await autoAssignDid(admin, ns_extension, full_name);

      await logAudit(admin, req, {
        admin_id: profile.id, action: "USER_CREATE",
        resource_type: "user", resource_id: created.user.id,
        metadata: { email, extension: ns_extension, ns_status: nsUserRes.status, mobile_device: mobile.device_id, mobile_error: mobile.error ?? null, did: did },
      });

      // Welcome sequence (best-effort)
      try {
        const appUrl = "https://avastatistic.ca/mplanipret";
        const html = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1A1A2E">
            <h1 style="color:#1F4E79;margin:0 0 12px">Bienvenue sur Planiprêt AI Portal 🎉</h1>
            <p>Bonjour <strong>${full_name}</strong>,</p>
            <p>Votre accès est prêt. Voici vos informations :</p>
            <ul style="background:#F4F8FC;padding:16px 24px;border-radius:8px">
              <li><strong>Extension :</strong> ${ns_extension}</li>
              <li><strong>Domaine :</strong> ${NS_DEFAULT_DOMAIN}</li>
              <li><strong>Email :</strong> ${email}</li>
            </ul>
            <p style="text-align:center;margin:24px 0">
              <a href="${appUrl}" style="background:#1F4E79;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Ouvrir Planiprêt AI</a>
            </p>
            <p style="font-size:12px;color:#94A3B8;margin-top:32px">Support : support@avastatistic.ca</p>
          </div>`;
        await admin.functions.invoke("send-transactional-email", {
          body: { to: email, subject: "Bienvenue sur Planiprêt AI Portal 🎉", html, from: "support@avastatistic.ca" },
        }).catch(() => null);
      } catch (e) { console.error("welcome sequence", e); }

      return jsonResponse({
        success: true,
        user_id: created.user.id,
        ns_extension,
        ns_domain: NS_DEFAULT_DOMAIN,
        mobile_device_id: mobile.device_id,
        mobile_device_created: mobile.created,
        mobile_device_error: mobile.error ?? null,
        did_assigned: did.assigned ?? false,
        did_e164: (did as any).e164 ?? null,
        did_diagnostic: did.diagnostic ?? null,
      });
    }

    // Provision a Planiprêt profile stub for an ns_only broker so admin
    // toggles (mobile_app_enabled / voice_agent_enabled) become editable.
    // Creates the auth user with a random password + sends a reset email.
    if (action === "provision_from_ns") {
      const { email, full_name, extension, updates } = payload ?? {};
      if (!email || !extension) {
        return jsonResponse({ success: false, error: "email et extension requis" }, 400);
      }
      if (/@lemtel\.com$/i.test(String(email).trim())) {
        return jsonResponse({ success: false, error: "Emails @lemtel.com non supportés" }, 422);
      }

      // If a profile already exists (by email or extension), reuse it.
      const { data: byEmail } = await admin.from("planipret_profiles")
        .select("id, user_id").eq("email", email).maybeSingle();
      const { data: byExt } = byEmail ? { data: null } : await admin.from("planipret_profiles")
        .select("id, user_id").eq("extension", extension).maybeSingle();
      let userId = byEmail?.user_id ?? byExt?.user_id ?? null;
      let profileId = byEmail?.id ?? byExt?.id ?? null;

      if (!userId) {
        // Try to reuse an existing auth user with the same email.
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existingAuth = list?.users?.find((u: any) => String(u.email ?? "").toLowerCase() === String(email).toLowerCase());
        if (existingAuth) {
          userId = existingAuth.id;
        } else {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email, password: randomPassword(22), email_confirm: true,
          });
          if (cErr || !created?.user) {
            return jsonResponse({ success: false, error: cErr?.message ?? "Échec création auth" }, 200);
          }
          userId = created.user.id;
          admin.auth.resetPasswordForEmail(email).catch(() => null);
        }
      }

      const patch: any = {
        user_id: userId,
        organization_id: profile.organization_id,
        email,
        full_name: full_name || extension,
        extension,
        ns_extension: extension,
        ns_domain: NS_DEFAULT_DOMAIN,
        ns_linked: true,
        role: "broker",
        mobile_app_enabled: updates?.mobile_app_enabled ?? false,
        voice_agent_enabled: updates?.voice_agent_enabled ?? false,
      };

      if (profileId) {
        await admin.from("planipret_profiles").update(patch).eq("id", profileId);
      } else {
        const { data: ins, error: pErr } = await admin.from("planipret_profiles")
          .insert(patch).select("id").maybeSingle();
        if (pErr) return jsonResponse({ success: false, error: pErr.message }, 200);
        profileId = ins?.id ?? null;
      }

      await admin.from("user_roles").upsert({
        user_id: userId,
        organization_id: profile.organization_id,
        role: "planipret_broker",
      }, { onConflict: "user_id,organization_id" });
      await ensureOrgMembership(admin, userId, profile.organization_id, false);

      await logAudit(admin, req, {
        admin_id: profile.id, action: "USER_PROVISION_FROM_NS",
        resource_type: "user", resource_id: userId,
        metadata: { email, extension, updates },
      });

      return jsonResponse({ success: true, user_id: userId, profile_id: profileId });
    }

    if (action === "update") {
      const { user_id, updates } = payload ?? {};
      if (!user_id) return jsonResponse({ success: false, error: "user_id requis" }, 400);

      const { data: current } = await admin
        .from("planipret_profiles")
        .select("id, extension, ns_extension, ns_domain, full_name, email")
        .eq("user_id", user_id)
        .maybeSingle();

      const allowed: any = {};
      for (const k of ["full_name", "extension", "mobile_app_enabled", "voice_agent_enabled", "elevenlabs_agent_id"]) {
        if (k in (updates ?? {})) allowed[k] = updates[k];
      }
      if ("extension" in allowed) {
        allowed.ns_extension = allowed.extension;
        allowed.ns_sip_username = allowed.extension;
        allowed.ns_domain = current?.ns_domain || NS_DEFAULT_DOMAIN;
      }
      const { error } = await admin.from("planipret_profiles").update(allowed).eq("user_id", user_id);
      if (error) return jsonResponse({ success: false, error: error.message }, 200);

      // Auto-provision ElevenLabs agent when Agent IA is turned on and none exists yet.
      let provisionedAgentId: string | null = null;
      let provisionError: string | null = null;
      if (allowed.voice_agent_enabled === true && !allowed.elevenlabs_agent_id) {
        const { data: existing } = await admin
          .from("planipret_profiles")
          .select("elevenlabs_agent_id")
          .eq("user_id", user_id)
          .maybeSingle();
        if (!existing?.elevenlabs_agent_id) {
          const res = await provisionBrokerAgent(admin, user_id);
          provisionedAgentId = res.agent_id;
          provisionError = res.error ?? null;
        }
      }

      // Propagate name / extension changes to NS and verify the user exists there.
      if (current) {
        const domain = current.ns_domain || NS_DEFAULT_DOMAIN;
        const oldExt = String(current.extension || current.ns_extension || "");
        const newExt = String(allowed.extension ?? oldExt);
        const nextName = String(allowed.full_name ?? current.full_name ?? newExt);
        const nextEmail = String(current.email ?? "");

        if (newExt) {
          const ensured = await ensureNsUser(nextName, nextEmail, newExt);
          if (ensured.ok) {
            await nsFetch(
              `/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(newExt)}`,
              { method: "PUT", body: JSON.stringify(nsUserPayload(nextName, nextEmail, newExt)) },
            ).catch(() => null);
            if (oldExt && oldExt !== newExt) {
              await nsFetch(`/domains/${encodeURIComponent(domain)}/users/${encodeURIComponent(oldExt)}`, { method: "DELETE" }).catch(() => null);
            }
          }
        }

        // If a new extension was assigned but no NS mobile device exists yet,
        // provision one so mobile keeps ringing.
        if (newExt) {
          const { data: prof } = await admin
            .from("planipret_profiles")
            .select("id, ns_mobile_device_id")
            .eq("user_id", user_id)
            .maybeSingle();
          if (prof && !prof.ns_mobile_device_id) {
            await ensureMobileDevice(admin, prof.id, newExt, domain);
          }
        }
      }

      await logAudit(admin, req, {
        admin_id: profile.id, action: "USER_UPDATE",
        resource_type: "user", resource_id: user_id, metadata: allowed,
      });
      return jsonResponse({ success: true, elevenlabs_agent_id: provisionedAgentId, elevenlabs_error: provisionError });
    }

    if (action === "delete") {
      const { user_id } = payload ?? {};
      if (!user_id) return jsonResponse({ success: false, error: "user_id requis" }, 400);

      const { data: target } = await admin
        .from("planipret_profiles")
        .select("id, extension, ns_extension, ns_domain")
        .eq("user_id", user_id)
        .maybeSingle();

      let nsResult: any = null;
      if (target) {
        const domain = target.ns_domain || NS_DEFAULT_DOMAIN;
        const ext = String(target.ns_extension || target.extension || "");
        if (ext) nsResult = await deleteNsUserFull(domain, ext).catch(() => null);
      }

      await admin.from("planipret_profiles").delete().eq("user_id", user_id);
      await admin.auth.admin.deleteUser(user_id).catch(() => null);
      await logAudit(admin, req, {
        admin_id: profile.id, action: "USER_DELETE",
        resource_type: "user", resource_id: user_id, metadata: { ns: nsResult },
      });
      return jsonResponse({ success: true, ns: nsResult });
    }

    // Bulk removal (portal + phone system) by email and/or extension.
    // payload: { emails?: string[], extensions?: string[], domain?, dry_run? }
    if (action === "bulk_delete") {
      const domain = String(payload?.domain || NS_DEFAULT_DOMAIN);
      const dryRun = payload?.dry_run === true;
      const emails: string[] = (payload?.emails ?? []).map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);
      const extensions: string[] = (payload?.extensions ?? []).map((e: any) => String(e).trim()).filter(Boolean);
      if (emails.length === 0 && extensions.length === 0) {
        return jsonResponse({ success: false, error: "emails ou extensions requis" }, 400);
      }

      const nsUsers = await nsListUsers(domain);
      const byEmail = new Map<string, any>();
      for (const u of nsUsers) { const e = nsEmailOf(u); if (e) byEmail.set(e, u); }

      const targets = new Map<string, { extension: string; email: string }>();
      for (const ext of extensions) targets.set(ext, { extension: ext, email: "" });
      for (const email of emails) {
        const u = byEmail.get(email);
        if (u) { const ext = nsExtOf(u); if (ext) targets.set(ext, { extension: ext, email }); }
      }

      const results: any[] = [];
      for (const t of targets.values()) {
        if (dryRun) { results.push({ ...t, dry_run: true }); continue; }
        const ns = await deleteNsUserFull(domain, t.extension).catch((e) => ({ ok: false, error: String(e) }));
        results.push({ ...t, ns });
      }

      // Portal-side cleanup (profiles + auth users) for the given emails.
      let profilesDeleted = 0;
      let authDeleted = 0;
      if (!dryRun && emails.length > 0) {
        const { data: profs } = await admin
          .from("planipret_profiles").select("user_id, email").in("email", emails);
        for (const p of profs ?? []) {
          if (p.user_id) { await admin.auth.admin.deleteUser(p.user_id).catch(() => null); authDeleted++; }
        }
        const { count } = await admin
          .from("planipret_profiles").delete({ count: "exact" }).in("email", emails);
        profilesDeleted = count ?? (profs?.length ?? 0);
      }

      await logAudit(admin, req, {
        admin_id: profile.id, action: "USER_BULK_DELETE",
        metadata: { domain, dry_run: dryRun, requested: emails.length + extensions.length, ns_deleted: results.length, profilesDeleted, authDeleted },
      });
      return jsonResponse({
        success: true, domain, dry_run: dryRun,
        requested: emails.length + extensions.length,
        ns_found: results.length, ns_results: results,
        profiles_deleted: profilesDeleted, auth_deleted: authDeleted,
      });
    }

    // Find NS subscribers that no longer exist in the portal (orphans left
    // behind by portal-only deletions), and optionally delete them.
    if (action === "purge_ns_orphans") {
      const domain = String(payload?.domain || NS_DEFAULT_DOMAIN);
      const confirm = payload?.confirm === true;
      const nsUsers = await nsListUsers(domain);
      const { data: profs } = await admin
        .from("planipret_profiles").select("email, extension, ns_extension");
      const keepExt = new Set<string>();
      const keepEmail = new Set<string>();
      for (const p of profs ?? []) {
        if (p.extension) keepExt.add(String(p.extension));
        if (p.ns_extension) keepExt.add(String(p.ns_extension));
        if (p.email) keepEmail.add(String(p.email).toLowerCase());
      }
      const orphans = nsUsers.filter((u) => {
        const ext = nsExtOf(u);
        const email = nsEmailOf(u);
        if (!ext || /^\d{7,}$/.test(ext)) return false;
        if (keepExt.has(ext)) return false;
        if (email && keepEmail.has(email)) return false;
        return true;
      }).map((u) => ({ extension: nsExtOf(u), email: nsEmailOf(u) }));

      const results: any[] = [];
      if (confirm) {
        for (const o of orphans) {
          const ns = await deleteNsUserFull(domain, o.extension).catch((e) => ({ ok: false, error: String(e) }));
          results.push({ ...o, ns });
        }
        await logAudit(admin, req, {
          admin_id: profile.id, action: "NS_PURGE_ORPHANS",
          metadata: { domain, count: results.length },
        });
      }
      return jsonResponse({
        success: true, domain, confirm,
        ns_total: nsUsers.length, orphans_count: orphans.length,
        orphans: orphans.slice(0, 500), deleted: results.length,
      });
    }


    if (action === "reset_password") {
      const { email } = payload ?? {};
      const redirectTo = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") ?? ""}/reset-password`;
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return jsonResponse({ success: false, error: error.message }, 200);
      await logAudit(admin, req, { admin_id: profile.id, action: "PASSWORD_RESET", metadata: { email } });
      return jsonResponse({ success: true });
    }

    if (action === "set_password") {
      const { email, user_id, password: newPassword } = payload ?? {};
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return jsonResponse({ success: false, error: "Le mot de passe doit contenir au moins 8 caractères." }, 200);
      }
      let targetUserId = user_id as string | undefined;
      if (!targetUserId && email) {
        const { data: prof } = await admin.from("planipret_profiles").select("user_id").eq("email", email).maybeSingle();
        targetUserId = prof?.user_id ?? undefined;
      }
      if (!targetUserId) return jsonResponse({ success: false, error: "Utilisateur introuvable." }, 200);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
      if (error) return jsonResponse({ success: false, error: error.message }, 200);
      await logAudit(admin, req, { admin_id: profile.id, action: "PASSWORD_SET_DIRECT", metadata: { email, user_id: targetUserId } });
      return jsonResponse({ success: true });
    }

    if (action === "promote_broker" || action === "demote_admin") {
      const { user_id } = payload ?? {};
      if (!user_id) return jsonResponse({ success: false, error: "user_id requis" }, 400);
      const newRole = action === "promote_broker" ? "admin" : "broker";

      const { data: target } = await admin
        .from("planipret_profiles")
        .select("id, email, organization_id")
        .eq("user_id", user_id)
        .maybeSingle();
      if (!target) return jsonResponse({ success: false, error: "Courtier introuvable" }, 404);

      if (/@lemtel\.com$/i.test(String(target.email ?? ""))) {
        return jsonResponse({ success: false, error: "Emails @lemtel.com non autorisés." }, 422);
      }

      const { error: upErr } = await admin
        .from("planipret_profiles")
        .update({ role: newRole })
        .eq("id", target.id);
      if (upErr) return jsonResponse({ success: false, error: upErr.message }, 200);

      const orgId = target.organization_id ?? profile.organization_id;
      if (action === "promote_broker") {
        await admin.from("user_roles").upsert(
          { user_id, organization_id: orgId, role: "planipret_admin" },
          { onConflict: "user_id,organization_id" },
        );
        await ensureOrgMembership(admin, user_id, orgId, true);
      } else {
        await admin
          .from("user_roles")
          .delete()
          .eq("user_id", user_id)
          .eq("role", "planipret_admin");
      }

      await logAudit(admin, req, {
        admin_id: profile.id,
        action: action === "promote_broker" ? "BROKER_PROMOTED_ADMIN" : "ADMIN_DEMOTED_BROKER",
        resource_type: "user", resource_id: user_id,
        metadata: { email: target.email },
      });
      return jsonResponse({ success: true, promoted: action === "promote_broker" });
    }


    if (action === "create_admin") {
      const { email, password, full_name } = payload ?? {};
      if (!email || !full_name) {
        return jsonResponse({ success: false, error: "Champs requis manquants (nom, courriel)" }, 400);
      }
      if (/@lemtel\.com$/i.test(String(email).trim())) {
        return jsonResponse({ success: false, error: "Les emails @lemtel.com ne peuvent pas être admins Planiprêt." }, 422);
      }

      // If a Planiprêt profile already exists for this email (e.g. an existing
      // broker), promote them to admin instead of failing. We keep their
      // extension / NS wiring intact — an admin can also be a courtier.
      const { data: existing } = await admin
        .from("planipret_profiles")
        .select("id, user_id, organization_id")
        .ilike("email", email)
        .maybeSingle();

      let userId: string;
      let promoted = false;
      if (existing?.user_id) {
        userId = existing.user_id;
        promoted = true;
        await admin.from("planipret_profiles")
          .update({ role: "admin", full_name })
          .eq("id", existing.id);
        if (password) {
          await admin.auth.admin.updateUserById(userId, { password }).catch(() => null);
        }
      } else if (existing?.id) {
        const initialPassword = password || randomPassword(24);
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: initialPassword, email_confirm: true,
        });
        if (cErr || !created.user) return jsonResponse({ success: false, error: cErr?.message ?? "Échec création auth" }, 200);
        userId = created.user.id;
        promoted = true;
        const { error: pErr } = await admin.from("planipret_profiles")
          .update({ user_id: userId, role: "admin", full_name })
          .eq("id", existing.id);
        if (pErr) {
          await admin.auth.admin.deleteUser(userId).catch(() => null);
          return jsonResponse({ success: false, error: pErr.message }, 200);
        }
        if (!password) {
          await admin.auth.resetPasswordForEmail(email).catch(() => null);
        }
      } else {
        if (!password) {
          return jsonResponse({ success: false, error: "Mot de passe requis pour un nouvel admin" }, 400);
        }
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
        });
        if (cErr || !created.user) return jsonResponse({ success: false, error: cErr?.message ?? "Échec création auth" }, 200);
        userId = created.user.id;

        const { error: pErr } = await admin.from("planipret_profiles").insert({
          user_id: userId,
          organization_id: profile.organization_id,
          email,
          full_name,
          role: "admin",
          ns_domain: NS_DEFAULT_DOMAIN,
          mobile_app_enabled: false,
          voice_agent_enabled: false,
        });
        if (pErr) {
          await admin.auth.admin.deleteUser(userId);
          return jsonResponse({ success: false, error: pErr.message }, 200);
        }
      }

      await admin.from("user_roles").upsert({
        user_id: userId,
        organization_id: existing?.organization_id ?? profile.organization_id,
        role: "planipret_admin",
      }, { onConflict: "user_id,organization_id" });
      await ensureOrgMembership(admin, userId, existing?.organization_id ?? profile.organization_id, true);


      await logAudit(admin, req, {
        admin_id: profile.id, action: promoted ? "ADMIN_PROMOTE" : "ADMIN_CREATE",
        resource_type: "user", resource_id: userId,
        metadata: { email, full_name, promoted },
      });
      return jsonResponse({ success: true, user_id: userId, promoted });
    }


    return jsonResponse({ success: false, error: "Action inconnue" }, 400);
  } catch (e) {
    console.error("pp-admin-user", e);
    return jsonResponse({ success: false, error: String(e) }, 200);
  }
});
