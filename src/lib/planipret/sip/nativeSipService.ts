import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import {
  aorExtension,
  claimAorForNative,
  normalizeMobileAor,
  preclaimNativeAor,
  releaseAorFromNative,
} from "./aorArbitration";


/**
 * NativeSipService — moteur SIP natif PJSIP (iOS) pour Planiprêt Mobile.
 *
 * Les identifiants sont résolus par courtier via l'Edge Function
 * `ns-resolve-sip-credentials` (client_type: "mobile") — aucune valeur en dur.
 *
 * Transport : TLS 5061 UNIQUEMENT. Aucune pile SIP native n'implémente SIP
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
  private extension: string | null = null;
  private initializing: Promise<boolean> | null = null;
  private listenersBound = false;
  private lastState: SipRegistrationState = "unavailable";

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
    const pjsip = getPjsip();
    if (!pjsip) {
      // Aucun moteur natif : JsSIP redevient légitimement propriétaire.
      releaseAorFromNative("plugin_absent");
      this.setState("unavailable");
      return false;
    }
    // Le natif est prioritaire dès maintenant : bloque tout REGISTER JsSIP
    // pendant la résolution des identifiants (fenêtre de course → WSS 1001).
    claimAorForNative(null, "native_init_start");

    const { data, error } = await supabase.functions.invoke("ns-resolve-sip-credentials", {
      body: { client_type: "mobile" },
    });

    const creds = (data ?? {}) as Record<string, string>;
    const password = creds.sip_password;
    if (error || !password) {
      console.error("[SIP] Aucun identifiant:", creds.error ?? error?.message);
      releaseAorFromNative("credentials_missing");
      this.setState("failed");
      return false;
    }

    // Invariant : l'AOR mobile est TOUJOURS `<ext>M` (jamais `<ext>_mobile`).
    const username = normalizeMobileAor(String(creds.sip_username ?? creds.sip_extension ?? ""));
    this.username = username;
    this.extension = String(creds.sip_extension ?? aorExtension(username));

    const proxy = String(creds.sip_proxy ?? creds.sip_core_server ?? "");
    const transport = "TLS" as const;
    const port = 5061;

    console.log("[SIP] Init moteur natif:", username, transport, proxy, port);

    try {
      await this.bindListeners(pjsip);

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
      // Bloque explicitement le REGISTER WSS du keep-alive natif : `false`
      // sur jsOwnsAor signifiait auparavant « AOR libre » et créait un doublon.
      void import("./nativePpSipService")
        .then((m) => m.declarePlanipretNativeEngineOwnsAor(true))
        .catch(() => undefined);

      await pjsip.register();
      return true;
    } catch (err: any) {
      const code = err?.code ?? err?.message ?? "error";
      if (code === "binary_missing" || code === "unavailable" || code === "UNIMPLEMENTED") {
        console.warn("[SIP] moteur natif indisponible:", code);
        // Repli explicite : sans binaire PJSIP, JsSIP reprend l'AOR.
        releaseAorFromNative(String(code));
        void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
        this.setState("unavailable");
        return false;
      }
      console.error("[SIP] Init échouée:", err);
      this.setState("failed");

      return false;
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

  private async bindListeners(pjsip: PjsipPlugin) {
    if (this.listenersBound) return;
    this.listenersBound = true;

    await pjsip.addListener("registrationState", (payload: any) => {
      const state = (payload?.state ?? "failed") as SipRegistrationState;
      console.log("[SIP] REGISTER:", state, payload?.code ?? "", payload?.reason ?? "");

      if (state === "failed" && this.retryCount < this.maxRetries) {
        this.retryCount++;
        setTimeout(() => { pjsip.register().catch(() => { /* noop */ }); }, 30_000);
      } else if (state === "failed") {
        // Échec définitif du natif : rendre l'AOR à JsSIP plutôt que de
        // laisser l'extension sans aucun REGISTER.
        releaseAorFromNative("native_register_failed");
        void import("./nativePpSipService").then((m) => m.declarePlanipretNativeEngineOwnsAor(false)).catch(() => undefined);
      }
      if (state === "registered") {
        this.retryCount = 0;
        claimAorForNative(this.username, "native_registered");
      }
      this.setState(state);
    });


    await pjsip.addListener("incomingCall", (call: any) => {
      this.currentCallId = call?.callId ?? null;
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
      if (ended) this.currentCallId = null;
      else if (state?.callId) this.currentCallId = String(state.callId);
      void import("./nativePpSipService").then((m) => m.setPlanipretNativeCallActive(!ended)).catch(() => undefined);
      emit("sip-call-state", { ...state, engine: "pjsip" });
    });
  }

  async answer(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) return false;
    try {
      const res = await pjsip.answerCall({ callId: this.currentCallId ?? undefined });
      this.currentCallId = res?.callId ?? this.currentCallId;
      return true;
    } catch (err) {
      console.error("[SIP] answer échoué:", err);
      return false;
    }
  }

  async hangup(): Promise<boolean> {
    const pjsip = getPjsip();
    if (!pjsip) return false;
    try {
      await pjsip.hangupCall({ callId: this.currentCallId ?? undefined });
      this.currentCallId = null;
      return true;
    } catch {
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

