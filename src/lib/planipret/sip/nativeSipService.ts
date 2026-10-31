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
} from "./aorArbitration";
import { pinnedCoreHost } from "./sipEdgePolicy";
import { trackRegisterAttempt, logRegisterMetricsSummary, type RegisterTracker } from "./registerMetrics";
import { requestPlanipretCallKitAnswer } from "./nativePpSipService";



/**
 * NativeSipService — moteur SIP natif PJSIP (iOS + Android) pour Planiprêt Mobile.
 *
 * Les identifiants sont résolus par courtier via l'Edge Function
 * `ns-resolve-sip-credentials` (client_type: "mobile") — aucune valeur en dur.
 *
 * Transport : TLS 5061 pour tout moteur mobile natif. Aucune pile SIP native
 * Planiprêt n'implémente SIP over WebSocket; WSS 9002 reste réservé au portail
 * dans la WebView et utilise l'AOR distinct `<ext>W`.
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

const NATIVE_BRIDGE_TIMEOUT_MS = 20_000;

function withNativeTimeout<T>(operation: Promise<T>, label: string, timeoutMs = NATIVE_BRIDGE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

interface PjsipPlugin {
  isEngineLinked(): Promise<{ linked: boolean }>;
  initialize(opts: Record<string, unknown>): Promise<{ ok: boolean; username: string }>;

  register(): Promise<{ ok: boolean }>;
  unregister(): Promise<{ ok: boolean }>;
  makeCall(opts: { destination: string }): Promise<{ callId: string }>;
  answerCall?(opts: { callId?: string }): Promise<{ ok: boolean }>;
  hangupCall(opts: { callId?: string }): Promise<{ ok: boolean }>;
  setMute(opts: { muted: boolean }): Promise<{ ok: boolean }>;
  setHold(opts: { onHold: boolean }): Promise<{ ok: boolean }>;
  setSpeaker(opts: { enabled: boolean }): Promise<{ ok: boolean }>;
  setAudioRoute?(opts: { route: "earpiece" | "speaker" | "bluetooth" }): Promise<{ ok: boolean; route?: string }>;
  getAudioRoute?(): Promise<{ ok: boolean; route?: string }>;
  notifyNetworkChange?(): Promise<{ ok: boolean; handled?: boolean }>;
  sendDTMF(opts: { digits: string }): Promise<{ ok: boolean }>;
  getState(): Promise<{
    available: boolean;
    registered: boolean;
    username: string;
    callId: string;
    muted?: boolean;
    speaker?: boolean;
    tlsState?: string;
    tlsVerifyStatus?: number;
    tlsLastError?: number;
  }>;
  addListener(event: string, cb: (data: any) => void): Promise<{ remove: () => Promise<void> }>;
}

/** Même plugin que la sonde TLS : une seule pile pjsua par process. */
const Pjsip = registerPlugin<PjsipPlugin>("PpPjsip");

const getPjsip = (): PjsipPlugin | null => {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    if (!Capacitor.isPluginAvailable("PpPjsip")) {
      console.warn("[SIP] PJSIP plugin absent — l'application mobile M/TLS reste indisponible; aucun fallback WSS");
      return null;
    }
  } catch {
    return null;
  }
  return Pjsip;
};

/**
 * Dernière cause d'indisponibilité du moteur natif. Exposée telle quelle à
 * l'écran de diagnostic : « REGISTERED » côté serveur ne dit rien de l'état
 * réel du moteur, il faut pouvoir distinguer « binaire sans moteur » de
 * « moteur présent mais REGISTER refusé ».
 */
let lastNativeFailure: string | null = null;

const nativeTlsFailureCode = (snapshot: Awaited<ReturnType<PjsipPlugin["getState"]>> | null): string => {
  const state = String(snapshot?.tlsState ?? "unknown");
  const safeState = /^(?:established|not_established|initializing|not_started|transport_\d+)$/.test(state)
    ? state
    : "unknown";
  const verify = Number(snapshot?.tlsVerifyStatus);
  const error = Number(snapshot?.tlsLastError);
  const safeVerify = Number.isSafeInteger(verify) ? Math.max(-1, Math.min(verify, 9999999)) : -1;
  const safeError = Number.isSafeInteger(error) ? Math.max(0, Math.min(error, 9999999)) : 0;
  return `native_register_timeout_tls_${safeState}_v${safeVerify}_e${safeError}`;
};

export type NativeSipDiagnostics = {
  nativePlatform: boolean;
  pluginPresent: boolean;
  registered: boolean;
  state: string;
  extension: string | null;
  username: string | null;
  failure: string | null;
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
  /** Diagnostic honnête affiché dans l'écran « État SIP ». */
  getDiagnostics(): NativeSipDiagnostics {
    let nativePlatform = false;
    try { nativePlatform = Capacitor.isNativePlatform(); } catch { /* noop */ }
    const pluginPresent = getPjsip() !== null;
    return {
      nativePlatform,
      pluginPresent,
      registered: this.registered,
      state: this.lastState,
      extension: this.extension,
      username: this.username,
      failure: this.registered ? null : (lastNativeFailure ?? (pluginPresent ? null : "plugin_absent")),
    };
  }
  isRegistered() { return this.registered; }
  getUsername() { return this.username; }
  getExtension() { return this.extension; }
  getCallId() { return this.currentCallId; }
  getState(): SipRegistrationState { return this.lastState; }

  /**
   * Android only: PJSUA2 renews its TLS Contact/REGISTER and re-INVITEs active
   * media after a true Wi-Fi ↔ LTE interface change. The native account is
   * configured never to hang up the active call during this operation.
   */
  async handleNetworkChange(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "android") return false;
    const pjsip = getPjsip();
    if (!pjsip?.notifyNetworkChange) return false;
    try {
      const result = await withNativeTimeout(pjsip.notifyNetworkChange(), "sip_ip_change", 15_000);
      return result.handled === true;
    } catch (error) {
      console.warn("[SIP] reprise réseau Android échouée", error);
      return false;
    }
  }

  /** Single-flight init : appelable à chaque changement de session. */
  initialize(): Promise<boolean> {
    if (this.initializing) return this.initializing;
    this.initializing = this.doInitialize().finally(() => { this.initializing = null; });
    return this.initializing;
  }

  /** Recovery entry point used by SIP Debug. Every native bridge call is
   * bounded so a stalled Capacitor promise can never leave the button spinning. */
  async repairRegistration(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) return false;

    const snapshot = await withNativeTimeout(pjsip.getState(), "sip_state").catch(() => null);
    if (snapshot?.registered) {
      this.username = snapshot.username || this.username;
      this.extension = this.extension ?? aorExtension(this.username ?? "");
      this.setState("registered");
      return true;
    }

    // An account can survive a WebView reload while the JS singleton loses its
    // state. Try one quick REGISTER first. If it does not recover, rebuild the
    // native account with freshly resolved credentials: keeping a stale native
    // account was the reason the repair button could finish without ever
    // registering after a Microsoft logout/login or credential rotation.
    if (snapshot?.available && snapshot.username) {
      this.username = snapshot.username;
      this.extension = aorExtension(snapshot.username);
      claimAorForNative(snapshot.username, "manual_repair_existing_account");
      await this.bindListeners(pjsip);
      await withNativeTimeout(pjsip.register(), "sip_reregister").catch((error) => {
        console.error("[SIP] réenregistrement natif échoué:", error);
      });
      const registered = await this.waitForRegistration(18_000);
      if (registered) return true;

      try { await withNativeTimeout(pjsip.unregister(), "sip_unregister_stale", 5_000); } catch { /* best effort */ }
      this.registered = false;
      this.retryCount = 0;
      this.setState("unregistered");
      return withNativeTimeout(this.doInitializeInner(), "sip_reinitialize", 50_000).catch((error) => {
        console.error("[SIP] reconstruction du compte natif échouée:", error);
        this.setState("failed");
        return false;
      });
    }

    return withNativeTimeout(this.initialize(), "sip_initialize", 55_000);
  }

  private async doInitialize(): Promise<boolean> {
    try {
      return await this.doInitializeInner();
    } catch (err: any) {
      // Filet ultime : l'AOR mobile reste M/TLS. Il ne doit jamais basculer en
      // W/WSS après une erreur locale, même si le moteur doit être relancé.
      console.error("[SIP] init natif — exception non gérée:", err?.message ?? err);
      lastNativeFailure = "native_init_exception";
      this.setState("failed");
      return false;
    }
  }

  private async doInitializeInner(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) {
      // Aucun moteur natif : M reste protégé. L'application native ne doit
      // jamais reprendre W/WSS, qui appartient au portail.
      lastNativeFailure = "plugin_absent";
      this.setState("failed");
      return false;
    }
    if (!isPjsipEnabled()) {
      lastNativeFailure = "pp_pjsip_enabled=false";
      this.setState("failed");
      return false;
    }
    // Le moteur doit être RÉELLEMENT lié avant toute revendication.
    const linked = await withNativeTimeout(this.probeEngineLinked(pjsip), "sip_engine_probe");
    if (!linked) {
      lastNativeFailure = "engine_not_linked";
      this.setState("failed");
      return false;
    }
    // Le natif est prioritaire dès maintenant : bloque tout REGISTER JsSIP
    // pendant la résolution des identifiants (fenêtre de course → WSS 1001).
    claimAorForNative(null, "native_init_start");
    armAorWatchdog(() => this.registered);

    const { data, error } = await withNativeTimeout(supabase.functions.invoke("ns-resolve-sip-credentials", {
      // Align the NS Device object with the native PJSIP TLS contact — ONE
      // transport per AOR. `<ext>W` remains the separate WSS browser AOR.
      // Credential resolution is read-only: it must never change the device,
      // caller ID or answering rules while an app is opening.
      body: { client_type: "mobile", transport: "tls", on_login: false },
    }), "sip_credentials");

    const creds = (data ?? {}) as Record<string, string>;
    const password = creds.sip_password;
    if (error || !password) {
      console.error("[SIP] Aucun identifiant:", JSON.stringify({
        edgeError: error?.message ?? null,
        payloadError: creds.error ?? null,
        keys: Object.keys(creds),
      }));
      lastNativeFailure = "credentials_missing";
      this.setState("failed");
      return false;
    }
    // Diagnostic: the resolver must return a native transport, never WSS.
    // A mismatch is an audited configuration incident; never repair it from a
    // handset because that drops live registrations and can reroute inbound
    // calls mid-session.
    const resolvedTransport = String(creds.sip_transport ?? "").toLowerCase();
    if (resolvedTransport && resolvedTransport !== "tcp" && resolvedTransport !== "tls") {
      const reason = `transport_mismatch:${resolvedTransport}`;
      console.error(`[SIP] ${reason} — configuration conservée, aucune réécriture automatique`);
      lastNativeFailure = reason;
      this.setState("failed");
      return false;
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
    const transport = "TLS" as const;
    const port = 5061;

    console.log("[SIP] Init moteur natif:", username, transport, proxy, port);

    try {
      await this.bindListeners(pjsip);

    this.registerTracker = trackRegisterAttempt("TLS");

      await withNativeTimeout(pjsip.initialize({
        domain: String(creds.sip_domain ?? ""),
        username,
        password,
        proxy,
        transport,
        port,
        displayName: String(creds.display_name ?? "Planiprêt"),
      }), "sip_native_initialize");

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
        const nativeSnapshot = await withNativeTimeout(pjsip.getState(), "sip_tls_state", 5_000).catch(() => null);
        const tlsFailure = nativeTlsFailureCode(nativeSnapshot);
        console.error("[SIP] REGISTER M/TLS absent après 45 s; AOR M conservé", tlsFailure);
        this.registerTracker?.failure("watchdog_45s");
        this.registerTracker = null;
        logRegisterMetricsSummary("register_watchdog");
        if (this.registrationRetryTimer) {
          clearTimeout(this.registrationRetryTimer);
          this.registrationRetryTimer = null;
        }
        // No unregister/fallback here: mobile AORs are exclusively M/TLS.
        // The registered listener schedules the bounded native retry.
        lastNativeFailure = tlsFailure;
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

      // Un mobile reste propriétaire de son AOR M/TLS. W/WSS appartient au
      // portail; ne jamais l'utiliser comme repli après un échec natif.
      lastNativeFailure = `native_initialize_${code.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 96)}`;
      this.setState("failed");
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

  private setState(state: SipRegistrationState) {
    this.lastState = state;
    this.registered = state === "registered";
    if (this.registered) lastNativeFailure = null;
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
        const index = this.registrationWaiters.indexOf(finish);
        if (index >= 0) this.registrationWaiters.splice(index, 1);
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
    // It is observability only: modifying a NetSapiens device after REGISTER
    // can send Expires: 0 and make the next inbound call fall to voicemail.
    await pjsip.addListener("registered", (payload: any) => {
      console.info("[SIP] PJSIP registered — configuration PBX left unchanged", payload?.contact ? "contact_present" : "contact_absent");
    });

    // Aucun INVITE natif dans les 5 s suivant Answer : réappliquer TLS 5061
    // is now an audit signal only. A transport repair requires an approved
    // restore operation, never a background client mutation.
    await pjsip.addListener("registrationRepairRequested", (payload: any) => {
      console.warn("[SIP] INVITE TLS absent — audit required; configuration unchanged", payload?.contact ? "contact_present" : "contact_absent");
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
    // iOS: CallKit reste l'unique propriétaire de la transition. Android: le
    // plugin PJSIP répond directement au même dialogue natif, jamais via JsSIP
    // ou une API REST/click-to-call.
    if (Capacitor.getPlatform() === "ios") return requestPlanipretCallKitAnswer();
    if (Capacitor.getPlatform() !== "android") return false;
    const pjsip = getPjsip();
    if (!pjsip?.answerCall) return false;
    try {
      await pjsip.answerCall({ callId: this.currentCallId ?? undefined });
      return true;
    } catch (error) {
      console.warn("[SIP] Android native answer failed:", error);
      return false;
    }
  }


  async hangup(): Promise<boolean> {
    // CallKit doit être fermé même si PJSIP échoue, sinon l'UI système reste
    // affichée alors que l'appel est terminé.
    const endCallKit = (callId?: string | null) => {
      const voip = (window as any)?.Capacitor?.Plugins?.PpVoipCall;
      if (!voip) return;
      const payload = callId ? { callId } : {};
      if (voip.endCall) { void Promise.resolve(voip.endCall(payload)).catch(() => {}); }
      else if (voip.reportCallEnded) { void Promise.resolve(voip.reportCallEnded(payload)).catch(() => {}); }
    };
    const pjsip = getPjsip();
    if (!pjsip) {
      endCallKit();
      lastNativeFailure = "hangup_plugin_absent";
      this.setState("failed");
      return false;
    }
    const targetCallId = this.currentCallId;
    try {
      await pjsip.hangupCall({ callId: targetCallId ?? undefined });
      this.currentCallId = null;
      endCallKit(targetCallId);
      return true;
    } catch (err: any) {
      endCallKit(targetCallId);
      if (this.isMissingBinary(err)) {
        lastNativeFailure = "hangup_binary_missing";
        this.setState("failed");
      }
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
  async setHold(onHold: boolean) { await getPjsip()?.setHold({ onHold }).catch(() => {}); }
  async setSpeaker(enabled: boolean) { await getPjsip()?.setSpeaker({ enabled }).catch(() => {}); }
  async sendDTMF(digits: string) { await getPjsip()?.sendDTMF({ digits }).catch(() => {}); }

  async refreshState() {
    const pjsip = getPjsip();
    if (!pjsip) return null;
    try {
      const snapshot = await pjsip.getState();
      this.registered = !!snapshot?.registered;
      this.lastState = this.registered ? "registered" : "unregistered";
      this.username = snapshot?.username || this.username;
      this.extension = this.extension ?? aorExtension(this.username ?? "");
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
