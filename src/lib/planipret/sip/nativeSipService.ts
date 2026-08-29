import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import {
  aorExtension,
  armAorWatchdog,
  claimAorForNative,
  isPjsipEnabled,
  nativeOwnsAor,
  normalizeMobileAor,
  preclaimNativeAor,
  releaseAorFromNative,
} from "./aorArbitration";
import { pinnedCoreHost } from "./sipEdgePolicy";
import { trackRegisterAttempt, logRegisterMetricsSummary, type RegisterTracker } from "./registerMetrics";



/**
 * NativeSipService — moteur SIP natif PJSIP (iOS) pour Planiprêt Mobile.
 *
 * Les identifiants sont résolus par courtier via l'Edge Function
 * `ns-resolve-sip-credentials` (client_type: "mobile") — aucune valeur en dur.
 *
 * Transport : TCP 5060 (défaut mobile, TLS 5061 optionnel). Aucune pile SIP native n'implémente SIP
 * over WebSocket (RFC 7118) ; WSS 9002 reste réservé à JsSIP dans la WebView.
 *
 * Invariant d'AOR : une seule pile REGISTER sur `<ext>M`. Dès que le moteur
 * natif s'initialise, il émet `pp:sip-native-owns-aor` et JsSIP cesse
 * définitivement de REGISTER (cf. `ppNativeSipOwnsAor` dans ppSipProvider),
 * sinon NetSapiens ferme la socket la plus ancienne (WSS 1001).
 *
 * La sonnerie est gérée nativement : PJSIP → CallKit (PpVoipCall). Le JS ne
 * fait plus qu'afficher l'état.
 */

export type SipRegistrationState = "registered" | "unregistered" | "failed" | "unavailable";

interface PjsipPlugin {
  isEngineLinked(): Promise<{ linked: boolean }>;
  initialize(opts: Record<string, unknown>): Promise<{ ok: boolean; username: string }>;

  register(): Promise<{ ok: boolean }>;
  unregister(): Promise<{ ok: boolean }>;
  makeCall(opts: { destination: string }): Promise<{ callId: string }>;
  answerCall(opts: { callId?: string }): Promise<{ callId: string }>;
  hangupCall(opts: { callId?: string }): Promise<{ ok: boolean }>;
  setMute(opts: { muted: boolean }): Promise<{ ok: boolean }>;
  setSpeaker(opts: { enabled: boolean }): Promise<{ ok: boolean }>;
  sendDTMF(opts: { digits: string }): Promise<{ ok: boolean }>;
  getState(): Promise<{
    available: boolean;
    registered: boolean;
    username: string;
    callId: string;
    muted?: boolean;
    speaker?: boolean;
  }>;
  addListener(event: string, cb: (data: any) => void): Promise<{ remove: () => Promise<void> }>;
}

/** Même plugin que la sonde TLS : une seule pile pjsua par process. */
const Pjsip = registerPlugin<PjsipPlugin>("PpPjsip");

const getPjsip = (): PjsipPlugin | null => {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    if (!Capacitor.isPluginAvailable("PpPjsip")) {
      console.warn("[SIP] PJSIP plugin absent — le chemin JsSIP/REST reste actif");
      return null;
    }
  } catch {
    return null;
  }
  return Pjsip;
};

const emit = (name: string, detail: any) => {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* noop */ }
};

export class NativeSipService {
  private static instance: NativeSipService;
  private registered = false;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private currentCallId: string | null = null;
  private username: string | null = null;
  /** Appels entrants en cours, pour détecter les manqués (jamais "connected"). */
  private inboundCalls = new Map<string, { remoteNumber: string | null; remoteName: string | null; answered: boolean; startedAt: string }>();

  private extension: string | null = null;
  private initializing: Promise<boolean> | null = null;
  private listenersBound = false;
  private lastState: SipRegistrationState = "unavailable";
  private registrationWaiters: Array<(registered: boolean) => void> = [];
  private registrationRetryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Chronomètre/métriques de la tentative REGISTER en cours. */
  private registerTracker: RegisterTracker | null = null;

  static getInstance(): NativeSipService {
    if (!NativeSipService.instance) NativeSipService.instance = new NativeSipService();
    return NativeSipService.instance;
  }

  isAvailable() { return getPjsip() !== null; }
  isRegistered() { return this.registered; }
  getUsername() { return this.username; }
  getExtension() { return this.extension; }
  getCallId() { return this.currentCallId; }
  getState(): SipRegistrationState { return this.lastState; }

  /** Single-flight init : appelable à chaque changement de session. */
  initialize(): Promise<boolean> {
    if (this.initializing) return this.initializing;
    this.initializing = this.doInitialize().finally(() => { this.initializing = null; });
    return this.initializing;
  }

  private async doInitialize(): Promise<boolean> {
    try {
      return await this.doInitializeInner();
    } catch (err: any) {
      // Filet ultime : AUCUNE exception ne doit laisser l'AOR au natif.
      console.error("[SIP] init natif — exception non gérée:", err?.message ?? err);
      releaseAorFromNative("native_init_exception");
      void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
      this.setState("unavailable");
      return false;
    }
  }

  private async doInitializeInner(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) {
      // Aucun moteur natif : JsSIP redevient légitimement propriétaire.
      releaseAorFromNative("plugin_absent");
      this.setState("unavailable");
      return false;
    }
    if (!isPjsipEnabled()) {
      releaseAorFromNative("pp_pjsip_enabled=false");
      this.setState("unavailable");
      return false;
    }
    // Le moteur doit être RÉELLEMENT lié avant toute revendication.
    const linked = await this.probeEngineLinked(pjsip);
    if (!linked) {
      releaseAorFromNative("engine_not_linked");
      void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
      this.setState("unavailable");
      return false;
    }
    // Le natif est prioritaire dès maintenant : bloque tout REGISTER JsSIP
    // pendant la résolution des identifiants (fenêtre de course → WSS 1001).
    claimAorForNative(null, "native_init_start");
    armAorWatchdog(() => this.registered);

    const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
      // `transport: "tls"` aligns the NS Device object on TLS 5061 — ONE
      // transport per AOR. Without it the PBX still advertises WSS for `<ext>M`
      // and never forks inbound calls to the native TLS contact.
      body: { client_type: "mobile", transport: "tcp" },
    });

    const creds = (data ?? {}) as Record<string, string>;
    const password = creds.sip_password;
    if (error || !password) {
      console.error("[SIP] Aucun identifiant:", JSON.stringify({
        edgeError: error?.message ?? null,
        payloadError: creds.error ?? null,
        keys: Object.keys(creds),
      }));
      releaseAorFromNative("credentials_missing");
      this.setState("failed");
      return false;
    }
    // Diagnostic : le resolver DOIT renvoyer `tls`. S'il renvoie `wss`, le
    // device `<ext>M` reste en WSS 9002 côté PBX et les INVITE n'arrivent
    // jamais sur PJSIP. On force alors un realignement TLS explicite.
    const resolvedTransport = String(creds.sip_transport ?? "").toLowerCase();
    if (resolvedTransport && resolvedTransport !== "tcp" && resolvedTransport !== "tls") {
      console.warn(
        `[SIP] ns-resolve-sip-credentials a renvoyé sip_transport="${resolvedTransport}" alors que TLS était demandé — realignement TLS forcé`,
      );
      void this.forceDeviceTlsTransport({ sipPort: 5060, contact: creds.sip_native_uri ?? creds.sip_tcp_uri ?? "" }, true);
    }


    // Invariant : l'AOR mobile est TOUJOURS `<ext>M` (jamais `<ext>_mobile`).
    const username = normalizeMobileAor(String(creds.sip_username ?? creds.sip_extension ?? ""));
    this.username = username;
    this.extension = String(creds.sip_extension ?? aorExtension(username));

    // Same single-core invariant as the WSS path: NS sometimes reports the
    // portal host in `core-server`; a registration held by the portal is never
    // used for inbound delivery (calls go straight to voicemail).
    const rawProxy = String(creds.sip_proxy ?? creds.sip_core_server ?? "");
    const proxy = pinnedCoreHost(rawProxy);
    if (rawProxy && !rawProxy.includes(proxy)) {
      console.warn("[SIP] core-server", rawProxy, "rejeté (portail/non-core) → épinglé", proxy);
    }
    const transport = "TCP" as const;
    const port = 5060;

    console.log("[SIP] Init moteur natif:", username, transport, proxy, port);

    try {
      await this.bindListeners(pjsip);

      this.registerTracker = trackRegisterAttempt("TLS");

      await pjsip.initialize({
        domain: String(creds.sip_domain ?? ""),
        username,
        password,
        proxy,
        transport,
        port,
        displayName: String(creds.display_name ?? "Planiprêt"),
      });

      // Le moteur natif possède l'AOR : JsSIP doit cesser de REGISTER et
      // retirer son Contact WebView s'il en avait déjà un.
      claimAorForNative(username, "native_engine_ready");
      armAorWatchdog(() => this.registered);
      // Bloque explicitement le REGISTER WSS du keep-alive natif : `false`
      // sur jsOwnsAor signifiait auparavant « AOR libre » et créait un doublon.
      void import("./nativePpSipService")
        .then((m) => m.declarePlanipretNativeEngineOwnsAor(true))
        .catch(() => undefined);

      // `initialize` adds the account with register_on_acc_add=1 and already
      // sends REGISTER. Do not report the native path ready until its Contact
      // actually received 200 OK; otherwise JsSIP is skipped while PJSIP still
      // cannot receive or answer an INVITE.
      // Les cores NetSapiens répondent le 407 en ~14 s sur cellulaire : une
      // fenêtre de 15 s coupait le handshake en plein vol (PJSIP_EBUSY sur
      // l'unregister immédiat) et restituait l'AOR à JsSIP pour rien.
      const registered = await this.waitForRegistration(45_000);
      if (!registered) {
        console.error("[SIP] REGISTER absent après 45 s — restitution atomique à JsSIP");
        this.registerTracker?.failure("watchdog_45s");
        this.registerTracker = null;
        logRegisterMetricsSummary("register_watchdog");
        if (this.registrationRetryTimer) {
          clearTimeout(this.registrationRetryTimer);
          this.registrationRetryTimer = null;
        }
        try { await pjsip.unregister(); } catch { /* noop */ }
        releaseAorFromNative("native_register_timeout");
        await import("./nativePpSipService")
          .then((m) => m.declarePlanipretNativeEngineOwnsAor(false))
          .catch(() => undefined);
        this.setState("failed");
        return false;
      }
      return true;

    } catch (err: any) {
      const code = String(err?.code ?? err?.message ?? err?.errorMessage ?? "error");
      this.registerTracker?.failure(code);
      this.registerTracker = null;
      // Détail complet : les erreurs Capacitor ne sérialisent pas via console.error.
      console.error("[SIP] Init échouée:", code, JSON.stringify({
        code: err?.code ?? null,
        message: err?.message ?? null,
        errorMessage: err?.errorMessage ?? null,
        data: err?.data ?? null,
        name: err?.name ?? null,
        stack: String(err?.stack ?? "").split("\n").slice(0, 3).join(" | "),
      }));

      // QUELLE QUE SOIT la raison (binary_missing, timeout, exception), le
      // chemin legacy JsSIP doit reprendre la main immédiatement.
      releaseAorFromNative(code);
      void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
      this.setState("unavailable");
      return false;
    }
  }

  /** `isEngineLinked()` natif = résultat de `#if canImport(pjsua)`. */
  private async probeEngineLinked(pjsip: PjsipPlugin): Promise<boolean> {
    try {
      const res = await pjsip.isEngineLinked();
      if (!res?.linked) console.warn("[SIP] isEngineLinked=false — libpjsip.xcframework absent du binaire");
      return !!res?.linked;
    } catch (e: any) {
      console.warn("[SIP] isEngineLinked indisponible:", e?.message ?? e);
      return false;
    }
  }

  /**
   * Force `device-sip-transport-type = TLS` sur le device `<ext>M` juste après
   * le 200 OK du REGISTER natif. Sans ça, NetSapiens conserve le Contact WSS
   * 9002 et route les INVITEs entrants vers JsSIP, jamais vers PJSIP/TLS.
   * Idempotent et throttlé à 60 s.
   */
  private lastTlsProvisionAt = 0;
  private lastTlsProvisionSignature = "";
  private lastTlsProvisionOk = false;
  private tlsProvisionInFlight = false;

  private async forceDeviceTlsTransport(payload?: any, urgent = false): Promise<void> {
    const port = Number(payload?.sipPort ?? 5060);
    const contact = String(payload?.contact ?? "").trim();
    const registrationServer = String(payload?.registrationServer ?? payload?.server ?? "").trim();
    // Garde : un contact vide produit `sip:@` côté NetSapiens, ce qui casse le
    // binding du device. On n'écrit jamais un Contact incomplet.
    const contactUsable = /^sips?:[^@\s]+@[^@\s]+/i.test(contact) || /^sips?:[^@\s]+$/i.test(contact);
    if (!contactUsable && !registrationServer) {
      console.warn("[SIP] reprovision TLS ignoré — contact/serveur vide", { contact, registrationServer });
      return;
    }

    // Idempotence : chaque reprovisioning provoque un cycle Expires:0 côté
    // NetSapiens, fenêtre pendant laquelle les appels partent en messagerie.
    // On ne réécrit que si le contact/port TLS a réellement changé.
    const signature = `tcp:${port}:${contact}`;
    if (this.lastTlsProvisionSignature === signature && this.lastTlsProvisionOk) {
      if (!urgent) return;
      // Même en urgence, on ne réécrit pas plus d'une fois par minute.
      if (Date.now() - this.lastTlsProvisionAt < 60_000) return;
    }
    if (!urgent && Date.now() - this.lastTlsProvisionAt < 60_000) return;
    if (this.tlsProvisionInFlight) return;
    this.tlsProvisionInFlight = true;
    this.lastTlsProvisionAt = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("ns-provision-broker-devices", {
        body: {
          transport: port === 5061 ? "tls" : "tcp",
          sip_port: port,
          ...(contactUsable ? { contact } : {}),

          force: true,
          client_type: "mobile",
        },
      });
      if (error) throw error;
      this.lastTlsProvisionSignature = signature;
      this.lastTlsProvisionOk = true;
      console.log("[SIP] device réaligné en TLS après REGISTER natif", data);
    } catch (e: any) {
      this.lastTlsProvisionOk = false;
      console.warn("[SIP] échec du réalignement TLS du device:", e?.message ?? e);
      this.lastTlsProvisionAt = 0;
    } finally {
      this.tlsProvisionInFlight = false;
    }
  }



  private setState(state: SipRegistrationState) {
    this.lastState = state;
    this.registered = state === "registered";
    emit("sip-registration-state", {
      registered: this.registered,
      state,
      username: this.username,
      extension: this.extension,
      engine: "pjsip",
    });
  }

  private waitForRegistration(timeoutMs: number): Promise<boolean> {
    if (this.registered) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.registrationWaiters.push(finish);
    });
  }

  private async bindListeners(pjsip: PjsipPlugin) {
    if (this.listenersBound) return;
    this.listenersBound = true;

    await pjsip.addListener("registrationState", (payload: any) => {
      const state = (payload?.state ?? "failed") as SipRegistrationState;
      console.log("[SIP] REGISTER:", state, payload?.code ?? "", payload?.reason ?? "");

      // Métriques terrain : latence REGISTER TLS, 407 tardifs, PJSIP_EBUSY.
      const sipCode = Number(payload?.code ?? 0);
      if (sipCode === 407 || sipCode === 401) this.registerTracker?.challenge(sipCode);
      if (state === "registered") { this.registerTracker?.success(); this.registerTracker = null; }
      else if (state === "failed") {
        this.registerTracker?.failure(payload?.reason ?? `sip_${sipCode || "failed"}`);
        this.registerTracker = null;
      }


      if (state === "failed" && this.retryCount < this.maxRetries) {
        this.retryCount++;
        if (this.registrationRetryTimer) clearTimeout(this.registrationRetryTimer);
        this.registrationRetryTimer = setTimeout(() => {
          this.registrationRetryTimer = null;
          if (this.lastState === "failed" && nativeOwnsAor()) {
            pjsip.register().catch(() => { /* noop */ });
          }
        }, 30_000);
      } else if (state === "failed") {
        // Ne jamais démarrer JsSIP sur le même <ext>M après un échec transitoire
        // du REGISTER TLS. Cela créait deux propriétaires, deux écrans CallKit
        // et des INVITE livrés à la mauvaise pile. Le natif garde l'AOR et sera
        // relancé au prochain cycle foreground/réseau.
        console.warn("[SIP] REGISTER natif en échec — propriété TLS conservée");
      }
      if (state === "registered") {
        if (this.registrationRetryTimer) {
          clearTimeout(this.registrationRetryTimer);
          this.registrationRetryTimer = null;
        }
        this.retryCount = 0;
        claimAorForNative(this.username, "native_registered");
        const waiters = this.registrationWaiters.splice(0);
        waiters.forEach((finish) => finish(true));
      }
      this.setState(state);
    });

    // Événement dédié émis uniquement après le 200 OK du REGISTER natif.
    await pjsip.addListener("registered", (payload: any) => {
      console.info("[SIP] PJSIP registered → reprovision TLS immédiat", payload?.contact ?? "");
      void this.forceDeviceTlsTransport(payload);
    });

    // Aucun INVITE natif dans les 5 s suivant Answer : réappliquer TLS 5061
    // immédiatement au lieu d'attendre le prochain cycle de provisioning.
    await pjsip.addListener("registrationRepairRequested", (payload: any) => {
      console.warn("[SIP] INVITE TLS absent → reprovision immédiat", payload?.contact ?? "");
      void this.forceDeviceTlsTransport(payload, true);
    });


    await pjsip.addListener("incomingCall", (call: any) => {
      this.currentCallId = call?.callId ?? null;
      const cid = call?.callId != null ? String(call.callId) : "unknown";
      this.inboundCalls.set(cid, { remoteNumber: call?.remoteNumber ?? null, remoteName: call?.remoteName ?? null, answered: false, startedAt: new Date().toISOString() });
      void import("./nativePpSipService").then((m) => m.setPlanipretNativeCallActive(true)).catch(() => undefined);
      // CallKit sonne déjà côté natif : cet event ne sert qu'à l'UI.
      emit("sip-incoming-call", {
        callId: call?.callId,
        remoteNumber: call?.remoteNumber,
        remoteName: call?.remoteName || call?.remoteNumber,
        engine: "pjsip",
      });
    });

    await pjsip.addListener("callState", (state: any) => {
      const ended = state?.state === "disconnected" || state?.state === "ended";
      const cid = state?.callId != null ? String(state.callId) : "unknown";
      const tracked = this.inboundCalls.get(cid);
      if (tracked && (state?.state === "connected" || state?.state === "confirmed" || state?.state === "answered")) {
        tracked.answered = true;
      }
      if (ended) {
        this.currentCallId = null;
        if (tracked) {
          this.inboundCalls.delete(cid);
          if (!tracked.answered) void this.logMissedCall(tracked);
        }
      } else if (state?.callId) this.currentCallId = String(state.callId);
      void import("./nativePpSipService").then((m) => m.setPlanipretNativeCallActive(!ended)).catch(() => undefined);
      emit("sip-call-state", { ...state, engine: "pjsip" });
    });
  }

  /** Journalise un appel entrant jamais répondu dans `planipret_phone_calls`. */
  private async logMissedCall(call: { remoteNumber: string | null; remoteName: string | null; startedAt: string }) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const authId = auth?.user?.id;
      if (!authId) return;
      const { data: profile } = await supabase
        .from("planipret_profiles")
        .select("id, organization_id, ns_extension")
        .eq("user_id", authId)
        .maybeSingle();
      if (!profile?.organization_id) return;
      await supabase.from("planipret_phone_calls").insert({
        user_id: (profile as any).id ?? authId,
        organization_id: (profile as any).organization_id,
        extension: (profile as any).ns_extension ?? this.username ?? null,
        direction: "missed",
        status: "no-answer",
        from_number: call.remoteNumber,
        from_name: call.remoteName,
        to_number: (profile as any).ns_extension ?? this.username ?? null,
        started_at: call.startedAt,
        ended_at: new Date().toISOString(),
        duration_seconds: 0,
        metadata: { source: "pjsip_native" },
      } as any);
    } catch (err) {
      console.warn("[SIP] log missed call échoué:", err);
    }
  }


  /** `true` si l'erreur signifie « PJSIP absent du binaire / indisponible ». */
  private isMissingBinary(err: any): boolean {
    const blob = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.errorMessage ?? ""}`;
    return /binary_missing|unavailable|UNIMPLEMENTED|not implemented/i.test(blob);
  }

  async answer(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) { releaseAorFromNative("answer_plugin_absent"); return false; }
    try {
      const res = await pjsip.answerCall({ callId: this.currentCallId ?? undefined });
      this.currentCallId = res?.callId ?? this.currentCallId;
      return true;
    } catch (err: any) {
      console.error("[SIP] answer échoué:", err);
      if (this.isMissingBinary(err)) {
        releaseAorFromNative("answer_binary_missing");
        void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
      }
      return false;
    }
  }


  async hangup(): Promise<boolean> {
    // CallKit doit être fermé même si PJSIP échoue, sinon l'UI système reste
    // affichée alors que l'appel est terminé.
    const endCallKit = () => {
      const voip = (window as any)?.Capacitor?.Plugins?.PpVoipCall;
      if (!voip) return;
      if (voip.endCall) { void Promise.resolve(voip.endCall({})).catch(() => {}); }
      else if (voip.reportCallEnded) { void Promise.resolve(voip.reportCallEnded({})).catch(() => {}); }
    };
    const pjsip = getPjsip();
    if (!pjsip) { endCallKit(); releaseAorFromNative("hangup_plugin_absent"); return false; }
    try {
      await pjsip.hangupCall({ callId: this.currentCallId ?? undefined });
      this.currentCallId = null;
      endCallKit();
      return true;
    } catch (err: any) {
      endCallKit();
      if (this.isMissingBinary(err)) releaseAorFromNative("hangup_binary_missing");
      return false;
    }
  }



  async makeCall(destination: string): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip || !this.registered) return false;
    try {
      const res = await pjsip.makeCall({ destination });
      this.currentCallId = res?.callId ?? null;
      return true;
    } catch (err) {
      console.error("[SIP] makeCall échoué:", err);
      return false;
    }
  }

  async setMute(muted: boolean) { await getPjsip()?.setMute({ muted }).catch(() => {}); }
  async setSpeaker(enabled: boolean) { await getPjsip()?.setSpeaker({ enabled }).catch(() => {}); }
  async sendDTMF(digits: string) { await getPjsip()?.sendDTMF({ digits }).catch(() => {}); }

  async refreshState() {
    const pjsip = getPjsip();
    if (!pjsip) return null;
    try {
      const snapshot = await pjsip.getState();
      this.registered = !!snapshot?.registered;
      this.lastState = this.registered ? "registered" : "unregistered";
      this.currentCallId = snapshot?.callId || null;
      return snapshot;
    } catch {
      return null;
    }
  }
}

export const nativeSip = NativeSipService.getInstance();

// Arbitrage d'AOR au chargement : si le plugin PJSIP est embarqué, le natif
// possède `<ext>M` avant que JsSIP puisse tenter le moindre REGISTER.
preclaimNativeAor();

