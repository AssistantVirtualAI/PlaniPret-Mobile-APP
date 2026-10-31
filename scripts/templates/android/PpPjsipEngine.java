package __PACKAGE__;

// Planiprêt-only native SIP engine. DO NOT reuse in Lemtel.
// Built against the official PJSIP 2.15.1 PJSUA2 Java/JNI bindings.

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import org.pjsip.pjsua2.Account;
import org.pjsip.pjsua2.AccountConfig;
import org.pjsip.pjsua2.AccountInfo;
import org.pjsip.pjsua2.AuthCredInfo;
import org.pjsip.pjsua2.AudioMedia;
import org.pjsip.pjsua2.Call;
import org.pjsip.pjsua2.CallInfo;
import org.pjsip.pjsua2.CallMediaInfo;
import org.pjsip.pjsua2.CallMediaInfoVector;
import org.pjsip.pjsua2.CallOpParam;
import org.pjsip.pjsua2.EpConfig;
import org.pjsip.pjsua2.Endpoint;
import org.pjsip.pjsua2.IpChangeParam;
import org.pjsip.pjsua2.OnCallMediaStateParam;
import org.pjsip.pjsua2.OnCallStateParam;
import org.pjsip.pjsua2.OnIncomingCallParam;
import org.pjsip.pjsua2.OnRegStateParam;
import org.pjsip.pjsua2.OnTransportStateParam;
import org.pjsip.pjsua2.TlsInfo;
import org.pjsip.pjsua2.TransportConfig;
import org.pjsip.pjsua2.pjmedia_type;
import org.pjsip.pjsua2.pjsip_inv_state;
import org.pjsip.pjsua2.pjsip_status_code;
import org.pjsip.pjsua2.pjsip_transport_type_e;
import org.pjsip.pjsua2.pjsua_call_media_status;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import android.util.Base64;
import org.json.JSONObject;

/**
 * One process-wide PJSUA2 UAC/UAS. Its only production transport is TLS/5061
 * and its only Planiprêt AOR is <extension>M. It intentionally exposes neither
 * SIP/WebSocket nor an API that can change NetSapiens provisioning.
 */
final class PpPjsipEngine {
  interface Listener {
    void onRegistration(String state, int code, String reason);
    void onIncoming(int callId, String remoteNumber, String remoteName);
    void onCallState(int callId, String state, String direction, String remoteNumber);
  }

  private static final String TAG = "PpPjsipEngine";
  private static final Object LOCK = new Object();
  private static final int TLS_PORT = 5061;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final String SECURE_PREFS = "pp_pjsip_native_session";
  private static final String SECURE_BLOB = "config_v1";
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "planipret_pjsip_m_tls_v1";
  // PJSIP's Speex AEC supports the noise-suppression flag. The build script
  // intentionally keeps Speex AEC enabled; a device that cannot apply it keeps
  // its native AEC rather than failing an active call.
  private static final int PJSIP_AEC_TAIL_MS = 128;
  private static final int PJSIP_ECHO_USE_NOISE_SUPPRESSOR = 128;
  private static final long NETWORK_CHANGE_DEBOUNCE_MS = 2_000L;
  private static final Map<Integer, PlanipretCall> CALLS = new HashMap<>();

  private static Endpoint endpoint;
  private static PlanipretAccount account;
  private static Context appContext;
  private static Listener listener;
  private static boolean linked;
  private static boolean started;
  private static boolean registered;
  private static String username = "";
  private static String accountDomain = "";
  private static String accountProxy = "";
  private static String accountDisplayName = "";
  private static int activeCallId = -1;
  private static boolean muted;
  private static boolean speaker;
  // Safe transport-only diagnostic. Never retain a host, certificate, SIP URI,
  // SDP, username or credential in JavaScript-visible state.
  private static String tlsState = "not_started";
  private static long tlsVerifyStatus = -1L;
  private static int tlsLastError;
  // Earpiece is the mandatory initial route. Speaker can only be selected by
  // PpPjsipPlugin.setAudioRoute()/setSpeaker after a user gesture.
  private static String audioRoute = "earpiece";
  private static long lastNetworkChangeAt;

  private PpPjsipEngine() { }

  static boolean isLinked() {
    synchronized (LOCK) {
      if (linked) return true;
      try {
        // Force the JNI wrapper's static initialization, not only Endpoint.class
        // loading. This validates the Java callbacks registered by SWIG before
        // the app accepts credentials or attempts a NetSapiens REGISTER.
        Class.forName("org.pjsip.pjsua2.pjsua2JNI");
        // The generated PJSUA2 wrapper loads libpjsua2 and its dependent .so files.
        Class.forName("org.pjsip.pjsua2.Endpoint");
        linked = true;
      } catch (Throwable error) {
        Log.e(TAG, "PJSUA2 JNI is unavailable", error);
        linked = false;
      }
      return linked;
    }
  }

  static void setListener(Listener value) { synchronized (LOCK) { listener = value; } }

  /** The bundled public CA gives OpenSSL/PJSIP an explicit Android trust anchor.
   * Server verification remains mandatory; no certificate exception is accepted. */
  private static String planipretTlsCa(Context context) throws Exception {
    try (InputStream input = context.getResources().openRawResource(R.raw.isrg_root_x1);
         ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[1024];
      int read;
      while ((read = input.read(chunk)) >= 0) {
        output.write(chunk, 0, read);
        if (output.size() > 16 * 1024) throw new IllegalStateException("tls_ca_too_large");
      }
      String pem = new String(output.toByteArray(), StandardCharsets.US_ASCII);
      if (!pem.contains("BEGIN CERTIFICATE") || !pem.contains("END CERTIFICATE")) {
        throw new IllegalStateException("tls_ca_invalid");
      }
      return pem;
    }
  }

  private static final class SessionConfig {
    final String username, password, domain, proxy, displayName;
    SessionConfig(String username, String password, String domain, String proxy, String displayName) {
      this.username = username;
      this.password = password;
      this.domain = domain;
      this.proxy = proxy;
      this.displayName = displayName;
    }
  }

  private static SecretKey getOrCreateKey(String alias) throws Exception {
    KeyStore store = KeyStore.getInstance(KEYSTORE);
    store.load(null);
    if (!store.containsAlias(alias)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
      generator.init(new KeyGenParameterSpec.Builder(alias,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .build());
      generator.generateKey();
    }
    return ((KeyStore.SecretKeyEntry) store.getEntry(alias, null)).getSecretKey();
  }

  private static void deleteKeyQuietly(String alias) {
    try {
      KeyStore store = KeyStore.getInstance(KEYSTORE);
      store.load(null);
      if (store.containsAlias(alias)) store.deleteEntry(alias);
    } catch (Exception ignored) { }
  }

  private static void saveSession(Context context, SessionConfig session) throws Exception {
    saveSession(context, session, SECURE_PREFS, SECURE_BLOB, KEY_ALIAS);
  }

  private static void saveSession(Context context, SessionConfig session, String prefsName,
                                  String blobName, String keyAlias) throws Exception {
    JSONObject json = new JSONObject();
    json.put("u", session.username); json.put("p", session.password);
    json.put("d", session.domain); json.put("x", session.proxy); json.put("n", session.displayName);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    // Android Keystore owns IV creation for AES-GCM encryption. Supplying one
    // here violates its randomized-encryption policy on affected devices.
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(keyAlias));
    byte[] iv = cipher.getIV();
    if (iv == null || iv.length != 12) throw new IllegalStateException("keystore_iv_missing");
    byte[] data = cipher.doFinal(json.toString().getBytes("UTF-8"));
    JSONObject envelope = new JSONObject();
    envelope.put("v", 2);
    envelope.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
    envelope.put("ct", Base64.encodeToString(data, Base64.NO_WRAP));
    context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
      .putString(blobName, envelope.toString()).apply();
  }

  private static SessionConfig loadSession(Context context) {
    return loadSession(context, SECURE_PREFS, SECURE_BLOB, KEY_ALIAS);
  }

  private static SessionConfig loadSession(Context context, String prefsName,
                                           String blobName, String keyAlias) {
    SharedPreferences prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE);
    String raw = prefs.getString(blobName, null);
    if (raw == null || raw.isEmpty()) return null;
    try {
      JSONObject envelope = new JSONObject(raw);
      // Blobs from the caller-IV implementation are deliberately not reused.
      // Clear them; the foreground app obtains fresh short-lived credentials.
      if (envelope.optInt("v", 0) != 2) throw new IllegalStateException("legacy_secure_session");
      byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
      byte[] data = Base64.decode(envelope.getString("ct"), Base64.NO_WRAP);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(keyAlias), new GCMParameterSpec(128, iv));
      JSONObject json = new JSONObject(new String(cipher.doFinal(data), "UTF-8"));
      return new SessionConfig(json.optString("u"), json.optString("p"), json.optString("d"),
        json.optString("x"), json.optString("n"));
    } catch (Exception error) {
      prefs.edit().remove(blobName).apply();
      Log.w(TAG, "discarded unreadable native secure session");
      return null;
    }
  }

  /**
   * Retention is only for an FCM wake after the WebView process has gone away.
   * A foreground REGISTER uses freshly resolved credentials and must never fail
   * merely because an old Android Keystore key/blob is invalid on this device.
   */
  private static boolean persistSessionForWakeBestEffort(Context context, SessionConfig session) {
    try {
      saveSession(context, session);
      return true;
    } catch (Exception firstError) {
      // Keystore keys can be invalidated by OS restore, lock-screen changes or
      // pre-fix caller-IV blobs. Remove only this app's wake cache, regenerate
      // its alias once, and keep the foreground M/TLS account alive either way.
      clearStoredSession(context);
      deleteKeyQuietly(KEY_ALIAS);
      try {
        saveSession(context, session);
        return true;
      } catch (Exception retryError) {
        clearStoredSession(context);
        Log.w(TAG, "native secure session unavailable; foreground M/TLS registration continues");
        return false;
      }
    }
  }

  /** Android instrumentation only: isolated storage and key, no PBX activity. */
  static boolean verifySecureSessionRoundTripForInstrumentation(Context context, String mobileAor) throws Exception {
    final String testPrefs = SECURE_PREFS + "_instrumentation";
    final String testBlob = SECURE_BLOB + "_instrumentation";
    final String testAlias = KEY_ALIAS + "_instrumentation";
    SessionConfig expected = new SessionConfig(mobileAor, "instrumentation-only-not-a-real-password",
      "example.invalid", "example.invalid", "Instrumentation");
    try {
      saveSession(context, expected, testPrefs, testBlob, testAlias);
      SessionConfig restored = loadSession(context, testPrefs, testBlob, testAlias);
      return restored != null && expected.username.equals(restored.username)
        && expected.password.equals(restored.password) && expected.domain.equals(restored.domain);
    } finally {
      context.getSharedPreferences(testPrefs, Context.MODE_PRIVATE).edit().remove(testBlob).apply();
      deleteKeyQuietly(testAlias);
    }
  }

  /** Android instrumentation only: inherited caller-IV blobs are discarded locally, never sent to PBX. */
  static boolean verifyLegacySessionIsDiscardedForInstrumentation(Context context) {
    final String testPrefs = SECURE_PREFS + "_legacy_instrumentation";
    final String testBlob = SECURE_BLOB + "_legacy_instrumentation";
    final String testAlias = KEY_ALIAS + "_legacy_instrumentation";
    SharedPreferences prefs = context.getSharedPreferences(testPrefs, Context.MODE_PRIVATE);
    try {
      prefs.edit().putString(testBlob, "{\"v\":1,\"iv\":\"invalid\",\"ct\":\"invalid\"}").commit();
      return loadSession(context, testPrefs, testBlob, testAlias) == null && !prefs.contains(testBlob);
    } finally {
      prefs.edit().remove(testBlob).apply();
      deleteKeyQuietly(testAlias);
    }
  }

  static void clearStoredSession(Context context) {
    if (context != null) context.getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE).edit().remove(SECURE_BLOB).apply();
    deleteKeyQuietly(KEY_ALIAS);
  }

  static void initialize(Context context, String suppliedUsername, String password, String domain,
                         String proxy, String transport, int port, String displayName) throws Exception {
    if (!"TLS".equalsIgnoreCase(transport) || port != TLS_PORT) {
      throw new IllegalArgumentException("PJSIP Android supports Planiprêt TLS/5061 only");
    }
    final String normalized = normalizeMobileAor(suppliedUsername);
    if (normalized.isEmpty() || password == null || password.isEmpty() || domain == null || domain.isEmpty()) {
      throw new IllegalArgumentException("missing_credentials");
    }
    if (!isLinked()) throw new IllegalStateException("binary_missing");

    synchronized (LOCK) {
      appContext = context.getApplicationContext();
      destroyAccountLocked();
      if (!started) {
        endpoint = new PlanipretEndpoint();
        endpoint.libCreate();
        EpConfig config = new EpConfig();
        config.getUaConfig().setUserAgent("Planipret Mobile Android PJSIP/2.15.1");
        // Native worker threads are required: Capacitor's WebView thread must never
        // be the sole owner of SIP retransmissions or RTP callbacks.
        config.getUaConfig().setThreadCnt(1);
        // Voice settings deliberately favour a stable, low-latency call path. Noise
        // reduction is activated on the sound device when media becomes available.
        config.getMedConfig().setAudioFramePtime(20);
        config.getMedConfig().setNoVad(true);
        config.getMedConfig().setQuality(5);
        endpoint.libInit(config);
        TransportConfig tls = new TransportConfig();
        tls.setPort(0); // client transport: never bind or expose a local public SIP port
        // Android PJSIP is linked with OpenSSL, which does not consume the
        // Android system trust store. Use the public CA bundled above and keep
        // hostname/SNI verification strict for the selected core proxy.
        tls.getTlsConfig().setCaBuf(planipretTlsCa(appContext));
        tls.getTlsConfig().setVerifyServer(true);
        endpoint.transportCreate(pjsip_transport_type_e.PJSIP_TRANSPORT_TLS, tls);
        endpoint.libStart();
        started = true;
      }

      AccountConfig cfg = new AccountConfig();
      cfg.setIdUri("sip:" + normalized + "@" + domain);
      cfg.getRegConfig().setRegistrarUri("sips:" + proxyHost(proxy, domain) + ":" + TLS_PORT + ";transport=tls");
      cfg.getRegConfig().setRegisterOnAdd(true);
      cfg.getRegConfig().setTimeoutSec(600);
      cfg.getSipConfig().getAuthCreds().add(new AuthCredInfo("Digest", "*", normalized, 0, password));
      cfg.getSipConfig().getProxies().add("sips:" + proxyHost(proxy, domain) + ":" + TLS_PORT + ";transport=tls");
      cfg.getNatConfig().setIceEnabled(false);
      // Wi-Fi/LTE handover: update Contact instead of leaving a stale TLS binding.
      // The account's default contact rewrite is non-destructive (no unregister),
      // and explicit IP-change settings keep an active call alive and re-INVITE its
      // media after the fresh REGISTER has completed.
      cfg.getNatConfig().setContactRewriteUse(2);
      cfg.getIpChangeConfig().setHangupCalls(false);
      cfg.getIpChangeConfig().setReinviteFlags(0);
      cfg.getIpChangeConfig().setReinvUseUpdate(1);
      tlsState = "initializing";
      tlsVerifyStatus = -1L;
      tlsLastError = 0;
      account = new PlanipretAccount();
      account.create(cfg);
      username = normalized;
      accountDomain = domain;
      accountProxy = proxyHost(proxy, domain);
      accountDisplayName = displayName == null ? "Planiprêt" : displayName;
      registered = false;
      activeCallId = -1;
      muted = false;
      speaker = false;
      audioRoute = "earpiece";
      persistSessionForWakeBestEffort(appContext,
        new SessionConfig(normalized, password, domain, accountProxy, accountDisplayName));
      PpPjsipService.start(appContext, "native_engine_initialized");
    }
  }

  static void setRegistration(boolean enabled) throws Exception {
    synchronized (LOCK) {
      if (account == null) throw new IllegalStateException("account_missing");
      account.setRegistration(enabled);
      if (!enabled) registered = false;
    }
  }

  static int makeCall(String destination) throws Exception {
    synchronized (LOCK) {
      if (account == null || !registered) throw new IllegalStateException("not_registered");
      if (activeCallId >= 0) throw new IllegalStateException("active_call_exists");
      ensureMicrophoneServiceForCallLocked();
      String uri = destination.startsWith("sip:") ? destination : "sip:" + destination + "@" + accountDomain;
      PlanipretCall call = new PlanipretCall(account, -1, "out");
      CallOpParam param = new CallOpParam(true);
      call.makeCall(uri, param);
      call.syncCallId();
      activeCallId = call.callId;
      CALLS.put(call.callId, call);
      return call.callId;
    }
  }

  static void answer(Integer requestedCallId) throws Exception {
    synchronized (LOCK) {
      PlanipretCall call = findCallLocked(requestedCallId);
      if (call == null) throw new IllegalStateException("incoming_dialog_missing");
      ensureMicrophoneServiceForCallLocked();
      CallOpParam param = new CallOpParam(true);
      param.setStatusCode(pjsip_status_code.PJSIP_SC_OK);
      call.answer(param);
    }
  }

  static void hangup(Integer requestedCallId) throws Exception {
    synchronized (LOCK) {
      PlanipretCall call = findCallLocked(requestedCallId);
      if (call == null) return;
      CallOpParam param = new CallOpParam(true);
      param.setStatusCode(pjsip_status_code.PJSIP_SC_DECLINE);
      call.hangup(param);
    }
  }

  static void setHold(boolean onHold) throws Exception {
    synchronized (LOCK) {
      PlanipretCall call = findCallLocked(null);
      if (call == null) throw new IllegalStateException("call_missing");
      if (onHold) call.setHold(new CallOpParam(true));
      else call.reinvite(new CallOpParam(true));
    }
  }

  static void setMuted(boolean enabled) throws Exception {
    synchronized (LOCK) {
      PlanipretCall call = findCallLocked(null);
      if (call == null) throw new IllegalStateException("call_missing");
      AudioMedia media = call.audioMedia();
      if (media == null) throw new IllegalStateException("audio_not_ready");
      media.adjustTxLevel(enabled ? 0.0f : 1.0f);
      muted = enabled;
    }
  }

  static void setSpeaker(boolean enabled) { setAudioRoute(enabled ? "speaker" : "earpiece"); }

  /**
   * Only called through the explicit in-call route picker. In particular no
   * inbound/outbound call callback invokes this method, so a call never starts
   * on the loudspeaker merely because Android recreated its media device.
   */
  static void setAudioRoute(String requestedRoute) {
    synchronized (LOCK) {
      if (appContext == null) return;
      AudioManager audio = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
      if (audio == null) return;
      String route = "speaker".equals(requestedRoute) || "bluetooth".equals(requestedRoute)
        ? requestedRoute : "earpiece";
      audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        AudioDeviceInfo target = null;
        AudioDeviceInfo wired = null;
        for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
          int type = device.getType();
          boolean expected = "speaker".equals(route) && type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
          expected = expected || ("earpiece".equals(route) && type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
          expected = expected || ("bluetooth".equals(route)
            && (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET));
          if (expected) { target = device; break; }
          if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET || type == AudioDeviceInfo.TYPE_USB_HEADSET) wired = device;
        }
        if (target == null && !"speaker".equals(route)) target = wired;
        if (target != null && audio.setCommunicationDevice(target)) {
          speaker = "speaker".equals(route);
          audioRoute = "bluetooth".equals(route) ? "bluetooth" : (speaker ? "speaker" : "earpiece");
          return;
        }
      }
      if ("speaker".equals(route)) {
        try { audio.stopBluetoothSco(); } catch (Exception ignored) { }
        audio.setBluetoothScoOn(false);
        audio.setSpeakerphoneOn(true);
      } else if ("bluetooth".equals(route)) {
        audio.setSpeakerphoneOn(false);
        try { audio.startBluetoothSco(); audio.setBluetoothScoOn(true); } catch (Exception ignored) { }
      } else {
        try { audio.stopBluetoothSco(); } catch (Exception ignored) { }
        audio.setBluetoothScoOn(false);
        audio.setSpeakerphoneOn(false);
      }
      speaker = "speaker".equals(route);
      audioRoute = route;
    }
  }

  static String getAudioRoute() {
    synchronized (LOCK) {
      if (appContext == null) return audioRoute;
      AudioManager audio = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
      if (audio == null) return audioRoute;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        try {
          AudioDeviceInfo current = audio.getCommunicationDevice();
          if (current != null) {
            int type = current.getType();
            if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return "speaker";
            if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET) return "bluetooth";
          }
        } catch (Exception ignored) { }
      }
      if (audio.isBluetoothScoOn()) return "bluetooth";
      return audio.isSpeakerphoneOn() ? "speaker" : "earpiece";
    }
  }

  /**
   * Android notified the app that the active network changed. PJSUA2 refreshes
   * the TLS transport and Contact/REGISTER, then re-INVITEs active media using
   * AccountIpChangeConfig. `hangupCalls=false` is configured during initialize.
   * This is intentionally a no-op while unregistered: it must never create a
   * second REGISTER or turn a transient browser event into a call disruption.
   */
  static boolean handleNetworkChange() {
    synchronized (LOCK) {
      long now = System.currentTimeMillis();
      if (endpoint == null || account == null || !registered) return false;
      if (now - lastNetworkChangeAt < NETWORK_CHANGE_DEBOUNCE_MS) return false;
      lastNetworkChangeAt = now;
      try {
        endpoint.handleIpChange(new IpChangeParam());
        return true;
      } catch (Exception error) {
        Log.w(TAG, "PJSIP IP change handling failed", error);
        return false;
      }
    }
  }

  static void sendDtmf(String digits) throws Exception {
    synchronized (LOCK) {
      PlanipretCall call = findCallLocked(null);
      if (call == null) throw new IllegalStateException("call_missing");
      call.dialDtmf(digits == null ? "" : digits);
    }
  }

  static Map<String, Object> state() {
    synchronized (LOCK) {
      Map<String, Object> value = new HashMap<>();
      value.put("available", isLinked());
      value.put("registered", registered);
      value.put("username", username);
      value.put("callId", activeCallId >= 0 ? String.valueOf(activeCallId) : "");
      value.put("muted", muted);
      value.put("speaker", speaker);
      value.put("audioRoute", getAudioRoute());
      value.put("tlsState", tlsState);
      value.put("tlsVerifyStatus", tlsVerifyStatus);
      value.put("tlsLastError", tlsLastError);
      return value;
    }
  }

  static void wakeForIncoming(Context context) {
    // A live native registration keeps its dialog; do not create another UA.
    if (registered) {
      PpPjsipService.start(context, "fcm_existing_native_registration");
      return;
    }
    try {
      SessionConfig saved = loadSession(context.getApplicationContext());
      if (saved == null || saved.username.isEmpty() || saved.password.isEmpty() || saved.domain.isEmpty()) return;
      initialize(context, saved.username, saved.password, saved.domain, saved.proxy, "TLS", TLS_PORT, saved.displayName);
      setRegistration(true);
    } catch (Exception error) {
      // Do not expose or persist a password/SDP/host diagnostic. The mobile UI
      // will surface a generic registration state after the next foreground run.
      Log.w(TAG, "native M/TLS wake could not restore registration");
    }
  }

  private static PlanipretCall findCallLocked(Integer requested) {
    int id = requested == null ? activeCallId : requested;
    return CALLS.get(id);
  }

  /**
   * Android 14+ rejects a microphone foreground service before RECORD_AUDIO is
   * granted. Do not let that platform policy kill the app or acknowledge SIP
   * audio without a usable microphone.
   */
  private static void ensureMicrophoneServiceForCallLocked() {
    if (appContext == null || !PpPjsipService.prepareForCall(appContext)) {
      throw new IllegalStateException("microphone_permission_required");
    }
  }

  private static void destroyAccountLocked() {
    if (account == null) return;
    try { account.setRegistration(false); } catch (Exception ignored) { }
    try { account.delete(); } catch (Exception ignored) { }
    account = null;
    registered = false;
    accountDomain = "";
    activeCallId = -1;
    CALLS.clear();
  }

  private static String normalizeMobileAor(String input) {
    String user = input == null ? "" : input.trim().replaceAll("(?i)(M|W|x)$", "");
    return user.isEmpty() ? "" : user + "M";
  }

  private static String proxyHost(String proxy, String domain) {
    String raw = (proxy == null || proxy.trim().isEmpty()) ? domain : proxy;
    return raw.replaceFirst("(?i)^sips?:", "").replaceFirst("/.*$", "").replaceFirst(":\\d+$", "");
  }

  private static void emitRegistration(String state, int code, String reason) {
    Listener value;
    synchronized (LOCK) { value = listener; }
    if (value != null) value.onRegistration(state, code, reason == null ? "" : reason);
  }

  private static void emitIncoming(int callId, String number, String name) {
    Listener value;
    synchronized (LOCK) { value = listener; }
    if (value != null) value.onIncoming(callId, number, name);
  }

  private static void emitCallState(int callId, String state, String direction, String number) {
    Listener value;
    synchronized (LOCK) { value = listener; }
    if (value != null) value.onCallState(callId, state, direction, number);
  }

  private static String userFromUri(String uri) {
    if (uri == null) return "";
    int start = uri.indexOf("sip:");
    String value = start >= 0 ? uri.substring(start + 4) : uri;
    int end = value.indexOf('@');
    return (end >= 0 ? value.substring(0, end) : value).replaceAll("[<>\\\" ]", "");
  }

  private static final class PlanipretAccount extends Account {
    @Override public void onRegState(OnRegStateParam param) {
      int code = param.getCode();
      String reason = param.getReason();
      boolean active = false;
      try { AccountInfo info = getInfo(); active = info.getRegIsActive() && code >= 200 && code < 300; } catch (Exception ignored) { }
      synchronized (LOCK) { registered = active; }
      emitRegistration(active ? "registered" : (code == 0 ? "unregistered" : "failed"), code, reason);
    }

    @Override public void onIncomingCall(OnIncomingCallParam param) {
      synchronized (LOCK) {
        PlanipretCall call = new PlanipretCall(this, param.getCallId(), "in");
        if (activeCallId >= 0 && activeCallId != call.callId) {
          try {
            CallOpParam busy = new CallOpParam(true);
            busy.setStatusCode(pjsip_status_code.PJSIP_SC_BUSY_HERE);
            call.hangup(busy);
          } catch (Exception ignored) { }
          return;
        }
        activeCallId = call.callId;
        CALLS.put(call.callId, call);
        try {
          CallOpParam ringing = new CallOpParam(true);
          ringing.setStatusCode(pjsip_status_code.PJSIP_SC_RINGING);
          call.answer(ringing);
        } catch (Exception error) {
          Log.e(TAG, "failed to send 180 Ringing", error);
        }
        String number = call.remoteNumber();
        emitIncoming(call.callId, number, number);
        PpPjsipService.showIncoming(appContext, call.callId, number);
      }
    }
  }

  private static final class PlanipretCall extends Call {
    int callId;
    final String direction;

    PlanipretCall(Account owner, int id, String callDirection) {
      super(owner, id);
      callId = id;
      direction = callDirection;
    }

    String remoteNumber() {
      try { return userFromUri(getInfo().getRemoteUri()); } catch (Exception ignored) { return ""; }
    }

    void syncCallId() {
      try { callId = getId(); } catch (Exception ignored) { }
    }

    AudioMedia audioMedia() {
      try {
        CallInfo info = getInfo();
        CallMediaInfoVector medias = info.getMedia();
        for (int index = 0; index < medias.size(); index++) {
          CallMediaInfo media = medias.get(index);
          if (media.getType() == pjmedia_type.PJMEDIA_TYPE_AUDIO
              && media.getStatus() == pjsua_call_media_status.PJSUA_CALL_MEDIA_ACTIVE) {
            return getAudioMedia(index);
          }
        }
      } catch (Exception ignored) { }
      return null;
    }

    @Override public void onCallMediaState(OnCallMediaStateParam param) {
      try {
        AudioMedia media = audioMedia();
        if (media == null || endpoint == null) return;
        endpoint.audDevManager().getCaptureDevMedia().startTransmit(media);
        media.startTransmit(endpoint.audDevManager().getPlaybackDevMedia());
        // Apply native AEC + denoise once the actual Android sound device is
        // live. Unsupported hardware keeps its own processing; it never fails
        // the call or enables loudspeaker.
        try {
          endpoint.audDevManager().setEcOptions(PJSIP_AEC_TAIL_MS, PJSIP_ECHO_USE_NOISE_SUPPRESSOR);
        } catch (Exception ignored) { }
        // The default is always private earpiece. A user who already selected
        // speaker/Bluetooth is represented by `audioRoute` and is not reset.
        if ("earpiece".equals(audioRoute)) setAudioRoute("earpiece");
        emitCallState(callId, "media", direction, remoteNumber());
      } catch (Exception error) {
        Log.e(TAG, "audio media connection failed", error);
      }
    }

    @Override public void onCallState(OnCallStateParam param) {
      String state = "unknown";
      try {
        CallInfo info = getInfo();
        callId = getId();
        if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_CALLING) state = "calling";
        else if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_INCOMING) state = "ringing";
        else if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_EARLY) state = "ringing";
        else if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_CONNECTING) state = "connecting";
        else if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_CONFIRMED) state = "connected";
        else if (info.getState() == pjsip_inv_state.PJSIP_INV_STATE_DISCONNECTED) state = "disconnected";
      } catch (Exception ignored) { state = "disconnected"; }
      emitCallState(callId, state, direction, remoteNumber());
      if ("disconnected".equals(state)) {
        synchronized (LOCK) {
          CALLS.remove(callId);
          if (activeCallId == callId) activeCallId = -1;
        }
        PpPjsipService.clearIncoming(appContext);
        // PJSUA2 forbids deleting a Call from its own onCallState callback.
        // Defer it to the Android main queue after the native callback returns.
        MAIN.post(() -> { try { delete(); } catch (Exception ignored) { } });
      }
    }
  }

  /** Captures only numeric TLS state for the on-device debug screen. */
  private static final class PlanipretEndpoint extends Endpoint {
    @Override public void onTransportState(OnTransportStateParam param) {
      if (param == null || !"TLS".equalsIgnoreCase(param.getType())) return;
      String state = "transport_" + param.getState();
      long verifyStatus = -1L;
      int lastError = param.getLastError();
      try {
        TlsInfo info = param.getTlsInfo();
        if (info != null && !info.isEmpty()) {
          state = info.getEstablished() ? "established" : "not_established";
          verifyStatus = info.getVerifyStatus();
        }
      } catch (Throwable ignored) { }
      synchronized (LOCK) {
        tlsState = state;
        tlsVerifyStatus = verifyStatus;
        tlsLastError = lastError;
      }
    }
  }
}
