#!/usr/bin/env node
// ------------------------------------------------------------------
// Planiprêt Mobile — native config generator (NetSapiens / SIP-over-WSS)
//
// DO NOT MERGE / SHARE WITH LEMTEL MOBILE.
// Lemtel uses FreeSWITCH + Verto (port 8082, JSON-RPC).
// Planiprêt uses NetSapiens over SIP-over-WSS (443, JsSIP + native REGISTER).
// The two stacks must remain 100% isolated: PBX creds, transport, plugin
// names, notification channels and background services are all distinct.
// ------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyIosScene } from "./verify-ios-scene.mjs";

const __filename = fileURLToPath(import.meta.url);
const appDir = path.resolve(path.dirname(__filename), "..");

const IOS_URL_TYPES = `
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>com.planipret.mobile.oauth</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>planipret</string>
\t\t\t\t<string>capacitor</string>
\t\t\t</array>
\t\t</dict>
\t</array>
`;

const IOS_URL_TYPES_DICT = `
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>com.planipret.mobile.oauth</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>planipret</string>
\t\t\t\t<string>capacitor</string>
\t\t\t</array>
\t\t</dict>
`;

const IOS_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`;

const ANDROID_INTENT_FILTERS = `
            <!-- Planiprêt OAuth deep links: Maestro + Microsoft mobile callbacks -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="planipret" android:host="auth" android:pathPrefix="/maestro/callback" />
            </intent-filter>

            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="capacitor" android:host="localhost" android:pathPrefix="/auth/microsoft/callback" />
                <data android:scheme="capacitor" android:host="localhost" android:pathPrefix="/auth/ms365/callback" />
            </intent-filter>
`;

const ANDROID_PERMISSIONS = [
  "android.permission.INTERNET",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
  // Android 14+ refuses to keep RECORD_AUDIO granted for a background call
  // unless the foreground service also declares the microphone type.
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.CHANGE_WIFI_STATE",
  "android.permission.VIBRATE",
  "android.permission.DISABLE_KEYGUARD",
  "android.permission.TURN_SCREEN_ON",
  "android.permission.SHOW_WHEN_LOCKED",
];

const ANDROID_SERVICE = `
        <service
            android:name=".PpSipKeepAliveService"
            android:foregroundServiceType="phoneCall|microphone"
            android:exported="false" />
        <receiver
            android:name=".PpIncomingActionReceiver"
            android:exported="false" />
`;

const ANDROID_PLUGIN_JAVA = (pkg) => `package ${pkg};

// Planiprêt-only Capacitor plugin. DO NOT reuse in Lemtel (Verto stack).
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PpSipKeepAlive")
public class PpSipKeepAlivePlugin extends Plugin {
  private BroadcastReceiver statusReceiver;
  private BroadcastReceiver reregisterReceiver;
  private BroadcastReceiver inviteReceiver;

  @Override public void load() {
    statusReceiver = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { if (!PpSipKeepAliveService.ACTION_STATUS.equals(i.getAction())) return; notifyListeners("sipServiceStatus", statusFromIntent(i), true); } };
    reregisterReceiver = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { if (!PpSipKeepAliveService.ACTION_REREGISTER.equals(i.getAction())) return; notifyListeners("sipReregisterRequested", new JSObject().put("reason", i.getStringExtra("reason")), true); } };
    inviteReceiver = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) {
      if (!PpSipKeepAliveService.ACTION_INCOMING_INVITE.equals(i.getAction())) return;
      JSObject data = new JSObject()
        .put("callId", i.getStringExtra("callId"))
        .put("from", i.getStringExtra("from"))
        .put("fromUser", i.getStringExtra("fromUser"))
        .put("fromDisplay", i.getStringExtra("fromDisplay"))
        .put("action", i.getStringExtra("userAction"));
      notifyListeners("sipIncomingInvite", data, true);
    } };
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getContext().registerReceiver(statusReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_STATUS), Context.RECEIVER_NOT_EXPORTED);
        getContext().registerReceiver(reregisterReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_REREGISTER), Context.RECEIVER_NOT_EXPORTED);
        getContext().registerReceiver(inviteReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_INCOMING_INVITE), Context.RECEIVER_NOT_EXPORTED);
      } else {
        getContext().registerReceiver(statusReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_STATUS));
        getContext().registerReceiver(reregisterReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_REREGISTER));
        getContext().registerReceiver(inviteReceiver, new IntentFilter(PpSipKeepAliveService.ACTION_INCOMING_INVITE));
      }
    } catch (Exception ignored) {}
  }

  @Override protected void handleOnDestroy() {
    try { if (statusReceiver != null) getContext().unregisterReceiver(statusReceiver); } catch (Exception ignored) {}
    try { if (reregisterReceiver != null) getContext().unregisterReceiver(reregisterReceiver); } catch (Exception ignored) {}
    try { if (inviteReceiver != null) getContext().unregisterReceiver(inviteReceiver); } catch (Exception ignored) {}
    super.handleOnDestroy();
  }

  @PluginMethod public void startSipService(PluginCall call) {
    PpSipKeepAliveService.saveConfig(getContext(),
      call.getString("host", call.getString("domain", "")),
      call.getInt("port", 443),
      call.getString("path", "/"),
      call.getString("login", call.getString("username", call.getString("extension", ""))),
      call.getString("domain", ""),
      call.getString("displayName", call.getString("extension", "")),
      call.getString("password", ""));
    // Same reconnection strategy as iOS, pushed from the JS config file / env vars.
    PpSipKeepAliveService.saveStrategy(getContext(),
      call.getInt("backoffMinMs", 4000),
      call.getInt("backoffMaxMs", 60000),
      call.getInt("backoffMaxAttempts", 5),
      call.getInt("verifyDelayMs", 8000),
      call.getInt("heartbeatSec", 60),
      call.getInt("registerExpiresSec", 1800));
    PpSipKeepAliveService.start(getContext());
    call.resolve(readStatus().put("ok", true));
  }
  @PluginMethod public void stopSipService(PluginCall call) { PpSipKeepAliveService.stop(getContext()); call.resolve(new JSObject().put("ok", true)); }
  @PluginMethod public void getSipServiceStatus(PluginCall call) { call.resolve(readStatus().put("ok", true)); }
  @PluginMethod public void triggerReregister(PluginCall call) { PpSipKeepAliveService.requestReregister(getContext(), "manual"); call.resolve(readStatus().put("ok", true)); }
  @PluginMethod public void acknowledgeIncoming(PluginCall call) { PpSipKeepAliveService.clearIncomingNotification(getContext()); call.resolve(new JSObject().put("ok", true)); }
  /** In-call audio routing. A call must start on the earpiece; the speaker is opt-in. */
  @PluginMethod public void setAudioRoute(PluginCall call) {
    String route = call.getString("route", "earpiece");
    try {
      android.media.AudioManager am = (android.media.AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
      if (am == null) { call.reject("no_audio_manager"); return; }
      am.setMode(android.media.AudioManager.MODE_IN_COMMUNICATION);
      if ("speaker".equals(route)) {
        try { am.stopBluetoothSco(); } catch (Exception ignored) {}
        am.setBluetoothScoOn(false);
        am.setSpeakerphoneOn(true);
      } else if ("bluetooth".equals(route)) {
        am.setSpeakerphoneOn(false);
        try { am.startBluetoothSco(); am.setBluetoothScoOn(true); } catch (Exception ignored) {}
      } else {
        try { am.stopBluetoothSco(); } catch (Exception ignored) {}
        am.setBluetoothScoOn(false);
        am.setSpeakerphoneOn(false);
      }
      call.resolve(new JSObject().put("ok", true).put("route", route));
    } catch (Exception e) { call.reject(e.getMessage()); }
  }
  @PluginMethod public void getAudioRoute(PluginCall call) {
    try {
      android.media.AudioManager am = (android.media.AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
      String route = "earpiece";
      if (am != null) {
        if (am.isBluetoothScoOn()) route = "bluetooth";
        else if (am.isSpeakerphoneOn()) route = "speaker";
      }
      call.resolve(new JSObject().put("ok", true).put("route", route));
    } catch (Exception e) { call.reject(e.getMessage()); }
  }
  @PluginMethod public void requestBatteryOptimizationExemption(PluginCall call) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.resolve(new JSObject().put("ok", true).put("ignored", true).put("requested", false)); return; }
      PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
      boolean ignored = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
      if (!ignored) getContext().startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      call.resolve(new JSObject().put("ok", true).put("ignored", ignored).put("requested", !ignored));
    } catch (Exception e) { call.reject(e.getMessage()); }
  }
  private JSObject statusFromIntent(Intent i) { return new JSObject().put("status", i.getStringExtra("status")).put("reason", i.getStringExtra("reason")).put("updatedAt", i.getLongExtra("updatedAt", 0)).put("wakeLockHeld", i.getBooleanExtra("wakeLockHeld", false)).put("wifiLockHeld", i.getBooleanExtra("wifiLockHeld", false)).put("loggedIn", i.getBooleanExtra("loggedIn", false)); }
  private JSObject readStatus() { android.content.SharedPreferences p = getContext().getSharedPreferences(PpSipKeepAliveService.PREFS_NAME, Context.MODE_PRIVATE); return new JSObject().put("status", p.getString(PpSipKeepAliveService.KEY_STATUS, "unknown")).put("reason", p.getString(PpSipKeepAliveService.KEY_REASON, "")).put("updatedAt", p.getLong(PpSipKeepAliveService.KEY_UPDATED_AT, 0)).put("wakeLockHeld", p.getBoolean(PpSipKeepAliveService.KEY_WAKE_HELD, false)).put("wifiLockHeld", p.getBoolean(PpSipKeepAliveService.KEY_WIFI_HELD, false)).put("loggedIn", p.getBoolean(PpSipKeepAliveService.KEY_LOGGED_IN, false)); }
}
`;

// Small broadcast receiver: catches Answer / Decline actions from the
// full-screen incoming-call notification and wakes MainActivity.
const ANDROID_RECEIVER_JAVA = (pkg) => `package ${pkg};

// Planiprêt-only. DO NOT reuse in Lemtel.
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PpIncomingActionReceiver extends BroadcastReceiver {
  public static final String ACTION_ANSWER  = "com.planipret.mobile.PP_INCOMING_ANSWER";
  public static final String ACTION_DECLINE = "com.planipret.mobile.PP_INCOMING_DECLINE";
  @Override public void onReceive(Context c, Intent intent) {
    String action = intent.getAction();
    String callId = intent.getStringExtra("callId");
    String from = intent.getStringExtra("from");
    String fromUser = intent.getStringExtra("fromUser");
    String fromDisplay = intent.getStringExtra("fromDisplay");
    String userAction = ACTION_ANSWER.equals(action) ? "answer" : "decline";
    try {
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.cancel(PpSipKeepAliveService.INCOMING_NOTIFICATION_ID);
    } catch (Exception ignored) {}
    if ("decline".equals(userAction)) PpSipKeepAliveService.declineIncoming(c, callId);
    // Forward to plugin listeners.
    c.sendBroadcast(new Intent(PpSipKeepAliveService.ACTION_INCOMING_INVITE)
      .setPackage(c.getPackageName())
      .putExtra("callId", callId)
      .putExtra("from", from)
      .putExtra("fromUser", fromUser)
      .putExtra("fromDisplay", fromDisplay)
      .putExtra("userAction", userAction));
    // Bring MainActivity to front so the JS softphone can pick up the retransmit.
    try {
      Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launch.putExtra("pp_incoming_call", true);
        launch.putExtra("pp_call_action", userAction);
        launch.putExtra("pp_call_id", callId);
        launch.putExtra("pp_from", from);
        c.startActivity(launch);
      }
    } catch (Exception ignored) {}
    // Ask the softphone to reregister so JsSIP picks the ongoing INVITE.
    PpSipKeepAliveService.requestReregister(c, "incoming_" + userAction);
  }
}
`;

const ANDROID_SERVICE_JAVA = (pkg) => `package ${pkg};

// Planiprêt-only background SIP keep-alive over WSS (NetSapiens).
// DO NOT reuse or unify with Lemtel's SipConnectionService (FreeSWITCH/Verto).
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.*;
import android.net.wifi.WifiManager;
import android.os.*;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.SSLSocketFactory;

public class PpSipKeepAliveService extends Service {
  public static final String
    CHANNEL_ID = "pp_sip_keepalive_channel",
    CHANNEL_INCOMING_ID = "pp_sip_incoming_channel",
    PREFS_NAME = "pp_sip_keepalive",
    ACTION_STATUS = "com.planipret.mobile.PP_SIP_STATUS",
    ACTION_REREGISTER = "com.planipret.mobile.PP_SIP_REREGISTER",
    ACTION_DECLINE_CALL = "com.planipret.mobile.PP_SIP_DECLINE_CALL",
    ACTION_INCOMING_INVITE = "com.planipret.mobile.PP_SIP_INCOMING_INVITE";
  public static final int NOTIFICATION_ID = 2201, INCOMING_NOTIFICATION_ID = 2202;
  public static final String KEY_STATUS = "status", KEY_REASON = "reason", KEY_UPDATED_AT = "updated_at", KEY_WAKE_HELD = "wake_held", KEY_WIFI_HELD = "wifi_held", KEY_LOGGED_IN = "logged_in";
  private final ScheduledExecutorService executor = Executors.newScheduledThreadPool(2);
  private ScheduledFuture<?> heartbeat;
  private PowerManager.WakeLock wakeLock; private WifiManager.WifiLock wifiLock;
  private ConnectivityManager cm; private ConnectivityManager.NetworkCallback networkCallback;
  private Socket wsSocket; private InputStream wsIn; private OutputStream wsOut;
  private int cseq = 1;
  private final String callId = UUID.randomUUID().toString() + "@planipret-mobile";
  private final String fromTag = Long.toHexString(System.nanoTime());
  private volatile boolean readerRunning = false;
  // Reconnection strategy (configurable from JS — see src/config/ppSipReconnect.json).
  private int backoffMinMs = 4000, backoffMaxMs = 60000, backoffMaxAttempts = 5, verifyDelayMs = 8000, heartbeatSec = 60, registerExpires = 1800;
  private int reconnectAttempts = 0; private volatile boolean reconnectPending = false;
  private long lastRegisterSentMs = 0L;
  private long lastRegisterOkMs = 0L;
  private volatile String activeInviteVia, activeInviteFrom, activeInviteTo, activeInviteCallId, activeInviteCSeq;
  private static final long REGISTER_DEBOUNCE_MS = 5000L;

  public static void start(Context c) { Intent i = new Intent(c, PpSipKeepAliveService.class); if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i); else c.startService(i); }
  public static void stop(Context c) { c.stopService(new Intent(c, PpSipKeepAliveService.class)); }
  public static void declineIncoming(Context c, String callId) {
    Intent i = new Intent(c, PpSipKeepAliveService.class).setAction(ACTION_DECLINE_CALL).putExtra("callId", callId);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i); else c.startService(i);
  }
  public static void saveConfig(Context c, String host, int port, String path, String login, String domain, String displayName, String password) { c.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString("host", host).putInt("port", port).putString("path", path).putString("login", login).putString("domain", domain).putString("display_name", displayName).putString("password", password).apply(); }
  public static void saveStrategy(Context c, int backoffMinMs, int backoffMaxMs, int backoffMaxAttempts, int verifyDelayMs, int heartbeatSec, int registerExpiresSec) {
    c.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
      .putInt("backoff_min_ms", backoffMinMs).putInt("backoff_max_ms", backoffMaxMs).putInt("backoff_max_attempts", backoffMaxAttempts)
      .putInt("verify_delay_ms", verifyDelayMs).putInt("heartbeat_sec", heartbeatSec).putInt("register_expires_sec", registerExpiresSec).apply();
  }
  private void loadStrategy() {
    SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    backoffMinMs = Math.max(4000, p.getInt("backoff_min_ms", 4000));
    backoffMaxMs = Math.max(backoffMinMs, p.getInt("backoff_max_ms", 60000));
    backoffMaxAttempts = Math.max(1, p.getInt("backoff_max_attempts", 5));
    verifyDelayMs = Math.max(1000, p.getInt("verify_delay_ms", 8000));
    heartbeatSec = Math.max(15, p.getInt("heartbeat_sec", 60));
    registerExpires = Math.max(60, p.getInt("register_expires_sec", 1800));
  }
  /** Exponential backoff reconnect + re-REGISTER, mirroring the iOS plugin. */
  private void scheduleReconnect(String why) {
    if (reconnectPending) return;
    reconnectPending = true;
    reconnectAttempts = Math.min(reconnectAttempts + 1, backoffMaxAttempts);
    long delay = Math.min((long) backoffMaxMs, (long) (backoffMinMs * Math.pow(2, reconnectAttempts - 1)));
    emitStatus("reconnecting", why);
    executor.schedule(() -> {
      reconnectPending = false;
      connectAndRegister();
      executor.schedule(() -> { if (!"registered".equals(lastStatus)) scheduleReconnect("still_unregistered"); }, verifyDelayMs, TimeUnit.MILLISECONDS);
    }, delay, TimeUnit.MILLISECONDS);
  }
  public static void requestReregister(Context c, String reason) { c.sendBroadcast(new Intent(ACTION_REREGISTER).setPackage(c.getPackageName()).putExtra("reason", reason)); }
  public static void clearIncomingNotification(Context c) { try { NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(INCOMING_NOTIFICATION_ID); } catch(Exception ignored) {} }

  @Override public void onCreate() {
    super.onCreate();
    loadStrategy();
    createChannels();
    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Planipret::SipWakeLock"); wakeLock.setReferenceCounted(false); wakeLock.acquire();
    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Planipret::SipWifiLock"); wifiLock.setReferenceCounted(false); wifiLock.acquire();
    registerNetworkWatchdog();
    emitStatus("protected", "service_created");
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    Notification n = buildOngoingNotification("Téléphonie prête en arrière-plan");
    if (Build.VERSION.SDK_INT >= 34) ServiceCompat.startForeground(this, NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
    else startForeground(NOTIFICATION_ID, n);
    if (intent != null && ACTION_DECLINE_CALL.equals(intent.getAction())) {
      String requestedCallId = intent.getStringExtra("callId");
      executor.execute(() -> { try { sendDecline(requestedCallId); } catch (Exception ignored) {} });
      return START_STICKY;
    }
    emitStatus("connecting", "native_register_start");
    executor.execute(this::connectAndRegister);
    if (heartbeat != null) heartbeat.cancel(false);
    heartbeat = executor.scheduleAtFixedRate(() -> {
      try { sendRegister(null); } catch (Exception e) { scheduleReconnect("register_retry"); }
    }, heartbeatSec, heartbeatSec, TimeUnit.SECONDS);
    return START_STICKY;
  }

  @Override public void onTaskRemoved(Intent rootIntent) { emitStatus("registered", "task_removed_keepalive"); super.onTaskRemoved(rootIntent); }
  @Override public void onDestroy() { if (heartbeat != null) heartbeat.cancel(true); unregisterNetworkWatchdog(); closeWs(); try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {} try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) {} executor.shutdownNow(); emitStatus("disconnected", "service_destroyed"); super.onDestroy(); }
  @Override public IBinder onBind(Intent intent) { return null; }

  private void registerNetworkWatchdog() { try { cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE); NetworkRequest req = new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(); networkCallback = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { emitStatus("registered", "network_available"); scheduleReconnect("network_available"); } @Override public void onLost(Network n) { emitStatus("reconnecting", "network_lost"); } }; cm.registerNetworkCallback(req, networkCallback); } catch(Exception ignored) {} }
  private void unregisterNetworkWatchdog() { try { if (cm != null && networkCallback != null) cm.unregisterNetworkCallback(networkCallback); } catch(Exception ignored) {} networkCallback = null; }

  private void connectAndRegister() { synchronized (this) { try {
    closeWs();
    SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String host = p.getString("host", ""); int port = p.getInt("port", 443); String path = p.getString("path", "/");
    if (host == null || host.length() == 0) { emitStatus("error", "missing_host"); return; }
    Socket raw = port == 443 ? SSLSocketFactory.getDefault().createSocket(host, port) : new Socket(host, port);
    raw.setKeepAlive(true);
    raw.setSoTimeout(90000);
    wsSocket = raw; wsIn = raw.getInputStream(); wsOut = raw.getOutputStream();
    String key = websocketKey();
    String req = "GET " + (path == null || path.length() == 0 ? "/" : path) + " HTTP/1.1\\r\\nHost: " + host + ":" + port + "\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: " + key + "\\r\\nSec-WebSocket-Version: 13\\r\\nSec-WebSocket-Protocol: sip\\r\\nOrigin: https://" + host + "\\r\\n\\r\\n";
    wsOut.write(req.getBytes(StandardCharsets.UTF_8)); wsOut.flush();
    String headers = readHttpHeaders();
    if (!headers.contains(" 101 ")) { emitStatus("error", "ws_handshake_failed"); return; }
    emitStatus("connecting", "ws_connected");
    sendRegister(null);
    if (!readerRunning) { readerRunning = true; executor.execute(this::readLoop); }
  } catch(Exception e) { emitStatus("error", "connect_failed:" + e.getClass().getSimpleName()); } } }

  private void readLoop() { try {
    while (wsSocket != null && wsSocket.isConnected() && !wsSocket.isClosed()) {
      String msg = readFrame(); if (msg == null) break; handleSipMessage(msg);
    }
  } catch(Exception ignored) {} finally { readerRunning = false; closeWs(); scheduleReconnect("ws_reader_closed"); } }

  private void handleSipMessage(String msg) throws Exception {
    if (msg.startsWith("SIP/2.0 401") || msg.startsWith("SIP/2.0 407")) {
      String challenge = header(msg, msg.startsWith("SIP/2.0 407") ? "Proxy-Authenticate" : "WWW-Authenticate");
      sendRegister(challenge); return;
    }
    if (msg.startsWith("SIP/2.0 200") && msg.toLowerCase(Locale.US).contains("cseq:") && msg.toUpperCase(Locale.US).contains(" REGISTER")) {
      lastRegisterOkMs = System.currentTimeMillis();
      emitStatus("registered", "native_register_200"); return;
    }
    if (msg.startsWith("INVITE ")) {
      emitStatus("registered", "incoming_invite");
      // Parse caller identity + Call-ID + Via/From/To for a 180 Ringing reply.
      String fromHdr = header(msg, "From"); String toHdr = header(msg, "To");
      String viaHdr = header(msg, "Via"); String inviteCallId = header(msg, "Call-ID");
      String inviteCSeq = header(msg, "CSeq");
      activeInviteVia = viaHdr; activeInviteFrom = fromHdr; activeInviteTo = toHdr;
      activeInviteCallId = inviteCallId; activeInviteCSeq = inviteCSeq;
      String fromDisplay = parseDisplay(fromHdr); String fromUser = parseUser(fromHdr);
      // Send 180 Ringing so the PBX keeps the INVITE alive while the app wakes.
      try { sendRinging(viaHdr, fromHdr, toHdr, inviteCallId, inviteCSeq); } catch (Exception ignored) {}
      // Broadcast to the JS plugin.
      sendBroadcast(new Intent(ACTION_INCOMING_INVITE).setPackage(getPackageName())
        .putExtra("callId", inviteCallId).putExtra("from", fromHdr)
        .putExtra("fromUser", fromUser).putExtra("fromDisplay", fromDisplay));
      // Fire the full-screen "ringing" notification with Answer / Decline actions.
      showIncomingCallNotification(inviteCallId, fromHdr, fromUser, fromDisplay);
      return;
    }
    if (msg.startsWith("CANCEL ")) {
      String cancelCallId = header(msg, "Call-ID");
      if (cancelCallId != null && cancelCallId.equals(activeInviteCallId)) {
        clearIncomingNotification(this);
        sendBroadcast(new Intent(ACTION_INCOMING_INVITE).setPackage(getPackageName())
          .putExtra("callId", cancelCallId).putExtra("userAction", "cancelled"));
        clearActiveInvite();
      }
    }
  }

  private void sendDecline(String requestedCallId) throws Exception {
    if (activeInviteCallId == null || (requestedCallId != null && !requestedCallId.equals(activeInviteCallId))) return;
    if (activeInviteVia == null || activeInviteFrom == null || activeInviteTo == null || activeInviteCSeq == null) return;
    String toWithTag = activeInviteTo.contains(";tag=") ? activeInviteTo : activeInviteTo + ";tag=" + Long.toHexString(System.nanoTime());
    String response = "SIP/2.0 603 Decline\r\nVia: " + activeInviteVia + "\r\nFrom: " + activeInviteFrom
      + "\r\nTo: " + toWithTag + "\r\nCall-ID: " + activeInviteCallId + "\r\nCSeq: " + activeInviteCSeq
      + "\r\nUser-Agent: Planipret Native KeepAlive\r\nContent-Length: 0\r\n\r\n";
    sendFrame(response);
    clearIncomingNotification(this);
    clearActiveInvite();
  }

  private void clearActiveInvite() {
    activeInviteVia = null; activeInviteFrom = null; activeInviteTo = null;
    activeInviteCallId = null; activeInviteCSeq = null;
  }

  private void sendRinging(String via, String from, String to, String cid, String cseqHeader) throws Exception {
    if (via == null || from == null || to == null || cid == null || cseqHeader == null) return;
    // Add a to-tag if none, so upstream proxies don't reject.
    String toWithTag = to.contains(";tag=") ? to : to + ";tag=" + Long.toHexString(System.nanoTime());
    StringBuilder r = new StringBuilder();
    r.append("SIP/2.0 180 Ringing\\r\\n")
     .append("Via: ").append(via).append("\\r\\n")
     .append("From: ").append(from).append("\\r\\n")
     .append("To: ").append(toWithTag).append("\\r\\n")
     .append("Call-ID: ").append(cid).append("\\r\\n")
     .append("CSeq: ").append(cseqHeader).append("\\r\\n")
     .append("User-Agent: Planipret Native KeepAlive\\r\\n")
     .append("Content-Length: 0\\r\\n\\r\\n");
    sendFrame(r.toString());
  }

  private void sendRegister(String challenge) throws Exception {
    SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String login = p.getString("login", ""), domain = p.getString("domain", ""), display = p.getString("display_name", login), password = p.getString("password", "");
    if (login == null || login.length() == 0 || domain == null || domain.length() == 0) { emitStatus("error", "missing_credentials"); return; }
    long now = System.currentTimeMillis();
    if (challenge == null && (now - lastRegisterSentMs) < REGISTER_DEBOUNCE_MS) { emitStatus("connecting", "register_debounced_sent"); return; }
    if (challenge == null && lastRegisterOkMs > 0 && (now - lastRegisterOkMs) < REGISTER_DEBOUNCE_MS) { emitStatus("registered", "register_debounced_ok"); return; }
    int seq = cseq++;
    String branch = "z9hG4bK" + UUID.randomUUID().toString().replace("-", "");
    String contact = "<sip:" + login + "@" + domain + ";transport=wss>";
    StringBuilder sip = new StringBuilder();
    sip.append("REGISTER sip:").append(domain).append(" SIP/2.0\\r\\n");
    sip.append("Via: SIP/2.0/WSS ").append(domain).append(";branch=").append(branch).append("\\r\\n");
    sip.append("Max-Forwards: 70\\r\\n");
    sip.append("To: <sip:").append(login).append("@").append(domain).append(">\\r\\n");
    sip.append("From: \\"").append(display == null ? login : display.replace("\\"", "")).append("\\" <sip:").append(login).append("@").append(domain).append(">;tag=").append(fromTag).append("\\r\\n");
    sip.append("Call-ID: ").append(callId).append("\\r\\n");
    sip.append("CSeq: ").append(seq).append(" REGISTER\\r\\n");
    sip.append("Contact: ").append(contact).append(";expires=").append(registerExpires).append("\\r\\nExpires: ").append(registerExpires).append("\\r\\nUser-Agent: Planipret Native KeepAlive\\r\\nSupported: outbound,path,gruu\\r\\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\\r\\n");
    if (challenge != null && password != null && password.length() > 0) sip.append("Authorization: ").append(digestAuth(challenge, login, password, domain)).append("\\r\\n");
    sip.append("Content-Length: 0\\r\\n\\r\\n");
    lastRegisterSentMs = now;
    sendFrame(sip.toString());
    emitStatus("connecting", challenge == null ? "register_sent" : "register_auth_sent");
  }

  private String digestAuth(String challenge, String user, String pass, String domain) throws Exception { Map<String,String> m = parseDigest(challenge); String realm = m.containsKey("realm") ? m.get("realm") : domain, nonce = m.get("nonce"), qop = m.get("qop"), opaque = m.get("opaque"), uri = "sip:" + domain, nc = "00000001", cnonce = Long.toHexString(System.nanoTime()); String ha1 = md5(user + ":" + realm + ":" + pass), ha2 = md5("REGISTER:" + uri); String resp = qop != null && qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); StringBuilder a = new StringBuilder("Digest username=\\"").append(user).append("\\", realm=\\"").append(realm).append("\\", nonce=\\"").append(nonce).append("\\", uri=\\"").append(uri).append("\\", response=\\"").append(resp).append("\\", algorithm=MD5"); if (qop != null && qop.contains("auth")) a.append(", qop=auth, nc=").append(nc).append(", cnonce=\\"").append(cnonce).append("\\""); if (opaque != null) a.append(", opaque=\\"").append(opaque).append("\\""); return a.toString(); }
  private String stableToken(String raw) { String s = raw == null ? "planipret" : raw.toLowerCase(Locale.US).replaceAll("[^a-z0-9-]", "-").replaceAll("-+", "-").replaceAll("^-|-$", ""); return s.length() == 0 ? "planipret" : s; }
  private Map<String,String> parseDigest(String h) { Map<String,String> out = new HashMap<>(); String s = h.replaceFirst("(?i)^Digest\\\\s+", ""); for (String part : s.split(",")) { int i = part.indexOf('='); if (i <= 0) continue; String k = part.substring(0, i).trim(); String v = part.substring(i + 1).trim(); if (v.startsWith("\\"") && v.endsWith("\\"")) v = v.substring(1, v.length() - 1); out.put(k, v); } return out; }
  private String header(String msg, String name) { for (String line : msg.split("\\r?\\n")) if (line.toLowerCase(Locale.US).startsWith(name.toLowerCase(Locale.US) + ":")) return line.substring(name.length() + 1).trim(); return null; }
  private String parseDisplay(String header) { if (header == null) return null; int lt = header.indexOf('<'); if (lt > 0) { String d = header.substring(0, lt).trim(); if (d.startsWith("\\"") && d.endsWith("\\"")) d = d.substring(1, d.length() - 1); return d.length() == 0 ? null : d; } return null; }
  private String parseUser(String header) { if (header == null) return null; int lt = header.indexOf('<'); String uri = lt >= 0 ? header.substring(lt + 1, Math.max(lt + 1, header.indexOf('>', lt))) : header; if (uri.startsWith("sip:")) uri = uri.substring(4); else if (uri.startsWith("sips:")) uri = uri.substring(5); int at = uri.indexOf('@'); if (at > 0) uri = uri.substring(0, at); int semi = uri.indexOf(';'); if (semi > 0) uri = uri.substring(0, semi); return uri; }
  private String md5(String s) throws Exception { MessageDigest md = MessageDigest.getInstance("MD5"); byte[] b = md.digest(s.getBytes(StandardCharsets.UTF_8)); StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format(Locale.US, "%02x", x & 0xff)); return sb.toString(); }
  private String websocketKey() { byte[] b = new byte[16]; new SecureRandom().nextBytes(b); return Base64.encodeToString(b, Base64.NO_WRAP); }
  private String readHttpHeaders() throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); int prev3 = -1, prev2 = -1, prev1 = -1, cur; while ((cur = wsIn.read()) != -1) { b.write(cur); if (prev3 == '\\r' && prev2 == '\\n' && prev1 == '\\r' && cur == '\\n') break; prev3 = prev2; prev2 = prev1; prev1 = cur; } return b.toString("UTF-8"); }
  private void sendFrame(String text) throws IOException { if (wsOut == null) throw new IOException("no_ws"); byte[] payload = text.getBytes(StandardCharsets.UTF_8); ByteArrayOutputStream f = new ByteArrayOutputStream(); f.write(0x81); int len = payload.length; if (len < 126) f.write(0x80 | len); else if (len <= 65535) { f.write(0x80 | 126); f.write((len >> 8) & 255); f.write(len & 255); } else throw new IOException("frame_too_large"); byte[] mask = new byte[4]; new SecureRandom().nextBytes(mask); f.write(mask); for (int i = 0; i < payload.length; i++) f.write(payload[i] ^ mask[i % 4]); wsOut.write(f.toByteArray()); wsOut.flush(); }
  private String readFrame() throws IOException { int b1 = wsIn.read(); if (b1 < 0) return null; int b2 = wsIn.read(); if (b2 < 0) return null; int opcode = b1 & 0x0f; boolean masked = (b2 & 0x80) != 0; long len = b2 & 0x7f; if (len == 126) len = (wsIn.read() << 8) | wsIn.read(); else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | wsIn.read(); } byte[] mask = new byte[4]; if (masked) readFully(mask); byte[] payload = new byte[(int)len]; readFully(payload); if (masked) for (int i = 0; i < payload.length; i++) payload[i] = (byte)(payload[i] ^ mask[i % 4]); if (opcode == 8) return null; if (opcode == 9) { sendPong(payload); return ""; } if (opcode != 1) return ""; return new String(payload, StandardCharsets.UTF_8); }
  private void readFully(byte[] b) throws IOException { int off = 0; while (off < b.length) { int r = wsIn.read(b, off, b.length - off); if (r < 0) throw new EOFException(); off += r; } }
  private void sendPong(byte[] payload) throws IOException { if (wsOut == null) return; ByteArrayOutputStream f = new ByteArrayOutputStream(); f.write(0x8A); f.write(0x80 | payload.length); byte[] mask = new byte[4]; new SecureRandom().nextBytes(mask); f.write(mask); for (int i = 0; i < payload.length; i++) f.write(payload[i] ^ mask[i % 4]); wsOut.write(f.toByteArray()); wsOut.flush(); }
  private void closeWs() { try { if (wsSocket != null) wsSocket.close(); } catch(Exception ignored) {} wsSocket = null; wsIn = null; wsOut = null; }

  private void showIncomingCallNotification(String cid, String fromHdr, String fromUser, String fromDisplay) {
    try {
      String label = (fromDisplay != null && fromDisplay.length() > 0) ? fromDisplay :
                     (fromUser != null && fromUser.length() > 0 ? fromUser : "Appel entrant");
      Intent contentIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
      if (contentIntent == null) contentIntent = new Intent();
      contentIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      contentIntent.putExtra("pp_incoming_call", true).putExtra("pp_call_id", cid).putExtra("pp_from", fromHdr);
      int pf = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT;
      PendingIntent contentPi = PendingIntent.getActivity(this, 3001, contentIntent, pf);

      Intent answer = new Intent(this, PpIncomingActionReceiver.class).setAction(PpIncomingActionReceiver.ACTION_ANSWER)
        .putExtra("callId", cid).putExtra("from", fromHdr).putExtra("fromUser", fromUser).putExtra("fromDisplay", fromDisplay);
      Intent decline = new Intent(this, PpIncomingActionReceiver.class).setAction(PpIncomingActionReceiver.ACTION_DECLINE)
        .putExtra("callId", cid).putExtra("from", fromHdr).putExtra("fromUser", fromUser).putExtra("fromDisplay", fromDisplay);
      PendingIntent answerPi = PendingIntent.getBroadcast(this, 3011, answer, pf);
      PendingIntent declinePi = PendingIntent.getBroadcast(this, 3012, decline, pf);

      NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_INCOMING_ID)
        .setContentTitle("Appel entrant")
        .setContentText(label)
        .setSmallIcon(android.R.drawable.sym_call_incoming)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setOngoing(true)
        .setAutoCancel(true)
        .setColor(Color.parseColor("#0023e6"))
        .setContentIntent(contentPi)
        .setFullScreenIntent(contentPi, true)
        .addAction(new NotificationCompat.Action(android.R.drawable.sym_action_call, "Répondre", answerPi))
        .addAction(new NotificationCompat.Action(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", declinePi));
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (nm != null) nm.notify(INCOMING_NOTIFICATION_ID, b.build());
    } catch (Exception ignored) {}
  }

  private volatile String lastStatus = "idle";
  private void emitStatus(String status, String reason) { lastStatus = status; if ("registered".equals(status)) { reconnectAttempts = 0; } long now = System.currentTimeMillis(); boolean wake = wakeLock != null && wakeLock.isHeld(), wifi = wifiLock != null && wifiLock.isHeld(), logged = status.equals("registered") || status.equals("protected"); getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_STATUS, status).putString(KEY_REASON, reason).putLong(KEY_UPDATED_AT, now).putBoolean(KEY_WAKE_HELD, wake).putBoolean(KEY_WIFI_HELD, wifi).putBoolean(KEY_LOGGED_IN, logged).apply(); sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("status", status).putExtra("reason", reason).putExtra("updatedAt", now).putExtra("wakeLockHeld", wake).putExtra("wifiLockHeld", wifi).putExtra("loggedIn", logged)); }
  private Notification buildOngoingNotification(String text) { return new NotificationCompat.Builder(this, CHANNEL_ID).setContentTitle("Planiprêt Mobile").setContentText(text).setSmallIcon(android.R.drawable.ic_menu_call).setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).setSilent(true).build(); }
  private void createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(NotificationManager.class);
    if (nm == null) return;
    nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Connexion téléphonique", NotificationManager.IMPORTANCE_LOW));
    NotificationChannel incoming = new NotificationChannel(CHANNEL_INCOMING_ID, "Appels entrants", NotificationManager.IMPORTANCE_HIGH);
    incoming.setDescription("Notifications d'appel entrant Planiprêt");
    incoming.enableVibration(true);
    incoming.enableLights(true);
    AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    incoming.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), attrs);
    incoming.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(incoming);
  }
}
`;

const IOS_PLUGIN = `import Foundation
import Capacitor
import UIKit
import AVFoundation
import CryptoKit
import UserNotifications
import Network
import Security

/// Vrai lorsque le moteur PJSIP natif est linké : dans ce cas il détient
/// l'AOR \`<ext>M\` en TLS 5061 et la pile WSS de secours ne doit jamais
/// ré-enregistrer par-dessus (sinon le Contact TLS est remplacé côté NetSapiens).
var nativeEngineOwnsAor: Bool {
  #if canImport(pjsua)
  return true
  #else
  return false
  #endif
}

// Planiprêt-only. DO NOT reuse in Lemtel (Verto stack).
@objc(PpSipKeepAlive)
public class PpSipKeepAlive: CAPPlugin, CAPBridgedPlugin, URLSessionWebSocketDelegate {
    public let identifier = "PpSipKeepAlive"; public let jsName = "PpSipKeepAlive"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "startSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "stopSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "getSipServiceStatus", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "triggerReregister", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "acknowledgeIncoming", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "wakeForIncomingCall", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "setCallActive", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "declareJsOwnsAor", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "setAudioRoute", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "getAudioRoute", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]
    private var status = "idle"; private var reason = "plugin_loaded"; private var updatedAt = Date().timeIntervalSince1970 * 1000
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var host = ""; private var port = 443; private var path = "/"; private var login = ""; private var domain = ""; private var displayName = ""; private var password = ""
    private var socket: URLSessionWebSocketTask?
    /// Only true once the WSS handshake completed. Sending a REGISTER before
    /// that fails with POSIX 57 "Socket is not connected".
    private var socketOpen = false
    private var registerOnOpen = false
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    private var timer: Timer?
    private var cseq = 1
    private let callIdReg = UUID().uuidString + "@planipret-ios"
    private let fromTag = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)
    private var appActive = true
    private var reconnectAttempts = 0
    // Reconnection strategy pushed from JS (src/config/ppSipReconnect.json + VITE_PP_SIP_* env).
    private var backoffMinMs: Double = 4000
    private var backoffMaxMs: Double = 60000
    private var backoffMaxAttempts: Int = 5
    private var verifyDelayMs: Double = 8000
    private var registerExpires: Int = 1800
    // NetSapiens closes the socket when it sees two REGISTERs for the same AoR
    // back-to-back. Debounce every REGISTER for 2s after a 200 OK.
    private var lastRegisterOkTime: Date?
    private var lastRegisterSentTime: Date?
    private let registerDebounceSec: TimeInterval = 2.0
    private var reconnectPending = false
    private var backgroundHandoffWorkItem: DispatchWorkItem?
    private var pathMonitor: NWPathMonitor?
    private var networkUp = true
    private var lastPathChangeAt: Date?
    /// True while the WebView (JsSIP) has a live call. During a call the native
    /// stack must NEVER take the AOR over: doing so closes the JsSIP transport
    /// (WSS 1001) and kills the audio. We only keep the audio session alive.
    private var callActive = false
    /// True only while CallKit owns the activated AVAudioSession.
    private var callKitAudioActive = false
    /// Set on VoIP push wake: while an inbound call is pending we must never
    /// release the SIP registration (that sent the caller to voicemail).
    private var incomingPendingUntil: Date? = nil
    /// R3 (ring9): JsSIP (WebView) explicitly claimed the shared 113M AOR. The
    /// native stack must then stay off it — it can ring but has no media plan.
    private var jsOwnsAor = false
    private var pushGraceWorkItem: DispatchWorkItem? = nil
    /// "earpiece" | "speaker" | "bluetooth" — chosen by the user in the in-call UI.
    /// A phone call MUST start on the earpiece: WebKit WebRTC otherwise defaults
    /// to the loudspeaker as soon as the remote party answers.
    private var preferredRoute = "earpiece"
    private var audioKeepAliveTimer: Timer?
    private let configDefaultsKey = "pp_sip_native_config_v1"
    private let passwordService = "com.planipret.mobile.sip"
    private let passwordAccount = "background-register"
    private var lastPushWakeAt: Date?


    public override func load() {
      restoreConfig()
      DispatchQueue.main.async { [weak self] in self?.appActive = UIApplication.shared.applicationState != .background }
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
      // UIScene lifecycle (iOS 13+) — the app adopts scenes, so the legacy
      // UIApplication notifications are not always delivered. Only the actual
      // didEnterBackground transition may transfer SIP ownership. The transient
      // willDeactivate/willResignActive events also fire for CallKit, Control
      // Center and notification interruptions and previously caused handoff loops.
      if #available(iOS 13.0, *) {
        NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIScene.didActivateNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onSceneWillEnterForeground), name: UIScene.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
      }
      // Ask for notification permission so the incoming-call banner can ring.
      // PushKit (PpVoipCall) posts this when an incoming-call VoIP push lands:
      // this is the ONLY reliable iOS background wake, so re-REGISTER immediately
      // instead of relying on a long-lived WSS socket.
      NotificationCenter.default.addObserver(self, selector: #selector(onVoipPushWake(_:)), name: Notification.Name("PpVoipIncomingPush"), object: nil)
      // CallKit Answer tapped: hold the transport + audio session up so the
      // WebView can complete the SIP 200 OK while still in the background.
      NotificationCenter.default.addObserver(forName: Notification.Name("PpVoipCallAnswered"), object: nil, queue: .main) { [weak self] _ in
        guard let self = self else { return }
        self.beginBackgroundTask()
      }
      NotificationCenter.default.addObserver(forName: Notification.Name("PpCallKitAudioActivated"), object: nil, queue: .main) { [weak self] _ in
        self?.callKitAudioActive = true
        self?.applyAudioRoute()
      }
      NotificationCenter.default.addObserver(forName: Notification.Name("PpCallKitAudioDeactivated"), object: nil, queue: .main) { [weak self] _ in
        self?.callKitAudioActive = false
      }
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil) }

    @objc func startSipService(_ call: CAPPluginCall) {
      if nativeEngineOwnsAor {
        NSLog("[PpSipKeepAlive] startSipService skipped — PJSIP owns the AOR")
        releaseRegistration("pjsip_owns_aor")
        call.resolve(["ok": true, "status": "protected", "reason": "pjsip_owns_aor"])
        return
      }
      host = call.getString("host") ?? call.getString("domain") ?? ""; port = call.getInt("port") ?? 443; path = call.getString("path") ?? "/"

      login = call.getString("login") ?? call.getString("username") ?? call.getString("extension") ?? ""
      domain = call.getString("domain") ?? ""; displayName = call.getString("displayName") ?? login; password = call.getString("password") ?? ""
      backoffMinMs = max(4000, Double(call.getInt("backoffMinMs") ?? 4000))
      backoffMaxMs = Double(call.getInt("backoffMaxMs") ?? 60000)
      backoffMaxAttempts = call.getInt("backoffMaxAttempts") ?? 5
      verifyDelayMs = Double(call.getInt("verifyDelayMs") ?? 8000)
      registerExpires = call.getInt("registerExpiresSec") ?? 1800
      persistConfig()
      NSLog("[PpSipKeepAlive] reconnect strategy min=%.0fms max=%.0fms attempts=%d verify=%.0fms expires=%ds", backoffMinMs, backoffMaxMs, backoffMaxAttempts, verifyDelayMs, registerExpires)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false, "status": "error", "reason": "plugin_released"]); return }
        self.activateAudioSession()
        // Only ONE SIP registration per AOR: while the app is in the foreground the
        // JsSIP web layer owns the registration. Registering natively at the same
        // time made NetSapiens close the JsSIP socket (1001), producing an endless
        // disconnect/reconnect loop. Store the credentials and stay idle instead.
        // Same rule during an ACTIVE call: the WebView owns the media + transport.
        if self.callActive { self.setStatus("protected", "call_active_js_owns"); call.resolve(self.snapshot(ok: true)); return }
        if self.isForeground() { self.releaseRegistration("foreground_js_owns") } else { self.beginNativeOwnership("service_start") }
        call.resolve(self.snapshot(ok: true))
      }
    }
    /// JS marks the call lifecycle. While a call is up we keep the audio session
    /// active in background (WebKit otherwise interrupts it => one-way / no audio)
    /// and never take the SIP AOR over.
    @objc func setCallActive(_ call: CAPPluginCall) {
      let active = call.getBool("active") ?? false
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.callActive = active
        if active {
          self.beginBackgroundTask()
          self.activateAudioSession()
          self.startAudioKeepAlive()
          // Never hold a second transport while the WebView carries the call.
          self.backgroundHandoffWorkItem?.cancel(); self.backgroundHandoffWorkItem = nil
          if self.socket != nil { self.releaseRegistration("call_active_js_owns") }
        } else {
          self.incomingPendingUntil = nil
          self.stopAudioKeepAlive()
        }
        call.resolve(self.snapshot(ok: true))
      }
    }
    private func startAudioKeepAlive() {
      audioKeepAliveTimer?.invalidate()
      audioKeepAliveTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
        guard let self = self, self.callActive else { return }
        // Never touch a CallKit-owned session from a timer.
        if self.callKitAudioActive { return }
        self.activateAudioSession()
      }
    }
    private func stopAudioKeepAlive() { audioKeepAliveTimer?.invalidate(); audioKeepAliveTimer = nil }

    @objc func setAudioRoute(_ call: CAPPluginCall) {
      let route = call.getString("route") ?? "earpiece"
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.preferredRoute = route
        self.activateAudioSession()
        self.applyAudioRoute()
        call.resolve(["ok": true, "route": self.preferredRoute])
      }
    }

    @objc func getAudioRoute(_ call: CAPPluginCall) {
      DispatchQueue.main.async { [weak self] in
        call.resolve(["ok": true, "route": self?.currentAudioRoute() ?? "earpiece"])
      }
    }

    private func currentAudioRoute() -> String {
      let outs = AVAudioSession.sharedInstance().currentRoute.outputs
      if outs.contains(where: { $0.portType == .bluetoothHFP || $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE }) { return "bluetooth" }
      if outs.contains(where: { $0.portType == .builtInSpeaker }) { return "speaker" }
      return "earpiece"
    }

    private func applyAudioRoute() {
      let s = AVAudioSession.sharedInstance()
      switch preferredRoute {
      case "speaker":
        try? s.overrideOutputAudioPort(.speaker)
      case "bluetooth":
        try? s.overrideOutputAudioPort(.none)
        if let bt = s.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) { try? s.setPreferredInput(bt) }
      default:
        try? s.overrideOutputAudioPort(.none)
      }
    }

    @objc func stopSipService(_ call: CAPPluginCall) {
      DispatchQueue.main.async {
        if let until = self.incomingPendingUntil, until > Date() {
          NSLog("[PpSipKeepAlive] stopSipService ignored: inbound call pending")
          self.setStatus("protected", "incoming_pending")
          call.resolve(self.snapshot(ok: true)); return
        }
        self.releaseRegistration("stopped"); call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func getSipServiceStatus(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.snapshot(ok: true)) } }
    @objc func triggerReregister(_ call: CAPPluginCall) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false, "status": "error", "reason": "plugin_released"]); return }
        if self.isForeground() { self.releaseRegistration("foreground_js_owns") } else { self.sendRegister(challenge: nil); self.notifyListeners("sipReregisterRequested", data: ["reason": "manual"]) }
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func acknowledgeIncoming(_ call: CAPPluginCall) {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["pp_incoming_call"])
      call.resolve(["ok": true])
    }
    /// R3 (ring9): explicit JS ownership signal for the shared AOR. Unlike
    /// releaseRegistration("..._js_owns") this is never refused while ringing.
    @objc func declareJsOwnsAor(_ call: CAPPluginCall) {
      let owns = call.getBool("owns") ?? true
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.jsOwnsAor = owns
        NSLog("[PpSipKeepAlive] jsOwnsAor=%@", owns ? "true" : "false")
        if owns {
          // JsSIP holds the 113M binding: cancel our fallback REGISTER and drop
          // our own socket so NetSapiens never sees two transports on one AOR.
          self.pushGraceWorkItem?.cancel(); self.pushGraceWorkItem = nil
          self.timer?.invalidate(); self.timer = nil
          self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil
          self.setStatus("protected", "js_owns_aor")
        }
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func wakeForIncomingCall(_ call: CAPPluginCall) {
      let why = call.getString("reason") ?? "js"
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.wakeForPush(why)
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc private func onVoipPushWake(_ note: Notification) {
      DispatchQueue.main.async { [weak self] in
        self?.incomingPendingUntil = Date().addingTimeInterval(45)
        self?.wakeForPush("voip_push")
      }
    }
    /// Immediate, debounce-free REGISTER triggered by a VoIP push. Apple only
    /// guarantees background execution through PushKit, so this is the path that
    /// must bring the AOR back before the PBX times out to voicemail.
    private func wakeForPush(_ why: String) {
      if nativeEngineOwnsAor {
        NSLog("[PpSipKeepAlive] VoIP push wake skipped — PJSIP owns the AOR")
        releaseRegistration("pjsip_owns_aor")
        return
      }
      // PushKit can wake iOS before the WebView has loaded. Restore the last
      // confirmed SIP configuration so REGISTER never depends on JS startup.
      if host.isEmpty || login.isEmpty || domain.isEmpty { restoreConfig() }
      guard !host.isEmpty, !login.isEmpty, !domain.isEmpty, !password.isEmpty else {
        setStatus("error", "missing_persisted_sip_config")
        notifyListeners("sipReregisterRequested", data: ["reason": "missing_persisted_sip_config"])
        return
      }
      if let previous = lastPushWakeAt, Date().timeIntervalSince(previous) < 1.0 { return }
      lastPushWakeAt = Date()
      NSLog("[PpSipKeepAlive] VoIP push wake (%@)", why)
      beginBackgroundTask()
      activateAudioSession()
      lastRegisterOkTime = nil
      lastRegisterSentTime = nil
      if isForeground() {
        notifyListeners("sipReregisterRequested", data: ["reason": "voip_push"])
        return
      }
      // R4 (ring9): give JsSIP a 1.5s grace window to claim the AOR before we
      // fall back to a native REGISTER. Do NOT lengthen it: NetSapiens only forks
      // the INVITE to devices already registered at fork time.
      jsOwnsAor = false
      setStatus(status == "registered" ? "registered" : "protected", "voip_push_wake")
      pushGraceWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        if self.jsOwnsAor { NSLog("[PpSipKeepAlive] push grace: JS owns AOR - skipping native REGISTER"); return }
        if self.isForeground() || self.callActive { return }
        if self.socket == nil { self.connect() } else { self.sendRegister(challenge: nil, force: true) }
      }
      pushGraceWorkItem = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    private func persistConfig() {
      UserDefaults.standard.set([
        "host": host, "port": port, "path": path, "login": login,
        "domain": domain, "displayName": displayName,
        "backoffMinMs": backoffMinMs, "backoffMaxMs": backoffMaxMs,
        "backoffMaxAttempts": backoffMaxAttempts, "verifyDelayMs": verifyDelayMs,
        "registerExpires": registerExpires,
      ], forKey: configDefaultsKey)
      let data = Data(password.utf8)
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: passwordService,
        kSecAttrAccount as String: passwordAccount,
      ]
      SecItemDelete(query as CFDictionary)
      var add = query
      add[kSecValueData as String] = data
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      SecItemAdd(add as CFDictionary, nil)
    }

    private func restoreConfig() {
      if let saved = UserDefaults.standard.dictionary(forKey: configDefaultsKey) {
        host = saved["host"] as? String ?? host
        port = saved["port"] as? Int ?? port
        path = saved["path"] as? String ?? path
        login = saved["login"] as? String ?? login
        domain = saved["domain"] as? String ?? domain
        displayName = saved["displayName"] as? String ?? displayName
        backoffMinMs = saved["backoffMinMs"] as? Double ?? backoffMinMs
        backoffMaxMs = saved["backoffMaxMs"] as? Double ?? backoffMaxMs
        backoffMaxAttempts = saved["backoffMaxAttempts"] as? Int ?? backoffMaxAttempts
        verifyDelayMs = saved["verifyDelayMs"] as? Double ?? verifyDelayMs
        registerExpires = saved["registerExpires"] as? Int ?? registerExpires
      }
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: passwordService,
        kSecAttrAccount as String: passwordAccount,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var item: CFTypeRef?
      if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
         let data = item as? Data,
         let savedPassword = String(data: data, encoding: .utf8) {
        password = savedPassword
      }
    }

    // NEVER touch UIApplication/UIScene off the main thread: it triggers
    // "UI API called on a background thread" and can deadlock (DispatchQueue.main.sync).
    // The cached appActive flag is refreshed only from main-thread notifications.
    private func isForeground() -> Bool {
      if Thread.isMainThread {
        appActive = UIApplication.shared.applicationState != .background
        return appActive
      }
      return appActive
    }
    @objc private func onSceneWillEnterForeground() { onForeground() }
    private func releaseRegistration(_ why: String) {
      if !Thread.isMainThread { DispatchQueue.main.async { [weak self] in self?.releaseRegistration(why) }; return }
      // Arm the ownership flag BEFORE the refusal point: during a ringing call we
      // must still record that JS owns the AOR, even though we refuse to tear the
      // socket down (ringlock1 guard — never remove it).
      if why.hasSuffix("js_owns") { jsOwnsAor = true }
      if let until = incomingPendingUntil, until > Date() {
        NSLog("[PpSipKeepAlive] releaseRegistration refused (%@): inbound call pending", why)
        setStatus("protected", "incoming_pending")
        return
      }
      pushGraceWorkItem?.cancel(); pushGraceWorkItem = nil
      backgroundHandoffWorkItem?.cancel(); backgroundHandoffWorkItem = nil
      timer?.invalidate(); timer = nil
      socket?.cancel(with: .goingAway, reason: nil); socket = nil
      endBackgroundTask(); setStatus("idle", why)
    }

    @objc private func onBackground() {
      appActive = false
      beginBackgroundTask()
      activateAudioSession()
      // During an active call the WebView keeps the media: only keep the audio
      // session alive, never flip to native ownership (that closed the JsSIP
      // transport with WSS 1001 and killed the audio).
      if callActive {
        startAudioKeepAlive()
        setStatus("protected", "call_active_audio_kept")
        backgroundHandoffWorkItem?.cancel(); backgroundHandoffWorkItem = nil
        return
      }
      setStatus("protected", "background_handoff_pending")
      backgroundHandoffWorkItem?.cancel()
      // JS owns the ordering: it unregisters/stops JsSIP before calling
      // startSipService. Starting here first creates two transports for the same
      // NetSapiens device AOR and the SBC closes one with WebSocket code 1001.
    }

    @objc private func onForeground() {
      appActive = true
      // Keep the last confirmed native Contact until JS reports its own
      // REGISTER 200 and explicitly calls stopSipService. Closing here created
      // a zero-Contact window where NetSapiens followed the voicemail rule.
      notifyListeners("sipReregisterRequested", data: ["reason": "enter_foreground"])
    }

    private func beginNativeOwnership(_ why: String) {
      guard !isForeground() else { releaseRegistration("foreground_js_owns"); return }
      connect()
      scheduleRegister()
      if socket != nil, status != "registered" { sendRegister(challenge: nil) }
      setStatus(status == "registered" ? "registered" : "protected", why)
    }

    private func activateAudioSession() {
      let s = AVAudioSession.sharedInstance()
      // ring16: once CallKit has activated the session it owns category, mode
      // and activation. Re-applying setCategory (the 2s keep-alive did it over
      // and over) makes iOS re-arbitrate the route and drop every output —
      // that is the measured 'hadOutputs=n' silence. Only re-assert the route.
      if callKitAudioActive {
        if s.category != .playAndRecord || s.mode != .voiceChat {
          try? s.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        }
        applyAudioRoute()
        NSLog("[PpSipKeepAlive] audio owned by CallKit outputs=%d", s.currentRoute.outputs.count)
        return
      }
      // During a live call we must own the session exclusively: .mixWithOthers
      // lets WebKit interrupt it when the app goes background (no audio at all).
      let opts: AVAudioSession.CategoryOptions = callActive
        ? [.allowBluetoothHFP, .allowBluetoothA2DP]
        : [.allowBluetoothHFP, .allowBluetoothA2DP, .mixWithOthers]
      try? s.setCategory(.playAndRecord, mode: .voiceChat, options: opts)
      // Foreground in-app calls do not pass through CXProvider.didActivate.
      if !callKitAudioActive { try? s.setActive(true, options: []) }
      // Re-assert the user's choice: activating the session resets the override
      // and iOS would fall back to the loudspeaker mid-call.
      applyAudioRoute()
    }
    private func connect() {
      // A new socket means a new AoR binding: clear the 200 OK debounce.
      lastRegisterOkTime = nil
      guard !host.isEmpty else { setStatus("error", "missing_host"); return }
      startPathMonitor()
      if isForeground() { return }
      if callActive { return }
      if socket != nil { return }
      var comps = URLComponents(); comps.scheme = port == 80 ? "ws" : "wss"; comps.host = host; comps.port = port; comps.path = path.isEmpty ? "/" : path
      guard let url = comps.url else { setStatus("error", "bad_ws_url"); return }
      var req = URLRequest(url: url); req.setValue("sip", forHTTPHeaderField: "Sec-WebSocket-Protocol")
      socketOpen = false
      registerOnOpen = true
      socket = session.webSocketTask(with: req); socket?.resume(); setStatus("connecting", "ws_connecting"); receiveLoop()
      // Safety net: if didOpen never fires within 10s, drop the socket and let
      // the reconnect watchdog take over. No REGISTER is sent in that case.
      let pending = socket
      DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) { [weak self] in
        guard let self = self, let pending = pending, pending === self.socket, !self.socketOpen else { return }
        NSLog("[PpSipKeepAlive] ws open timeout - cancelling socket")
        self.registerOnOpen = false
        self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil
        self.setStatus("reconnecting", "ws_open_timeout"); self.scheduleReconnect("ws_open_timeout")
      }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, webSocketTask === self.socket else { return }
        self.socketOpen = true
        NSLog("[PpSipKeepAlive] ws open")
        if self.registerOnOpen { self.registerOnOpen = false; self.sendRegister(challenge: nil, force: true) }
      }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, webSocketTask === self.socket else { return }
        self.socketOpen = false
        self.socket = nil
        NSLog("[PpSipKeepAlive] ws closed code=%ld", closeCode.rawValue)
        if !self.isForeground() { self.setStatus("reconnecting", "ws_closed"); self.scheduleReconnect("ws_closed") }
      }
    }
    private func scheduleRegister() {
      timer?.invalidate()
      // Refresh once near expiry, not every minute. NetSapiens treats repeated
      // REGISTER handshakes on one AOR as competing bindings.
      let refreshInterval = max(60.0, Double(registerExpires) * 0.8)
      timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in self?.sendRegister(challenge: nil) }
      if let timer = timer { RunLoop.main.add(timer, forMode: .common) }
    }
    private func receiveLoop() {
      socket?.receive { [weak self] result in
        guard let self = self else { return }
        switch result {
        case .success(let message):
          self.reconnectAttempts = 0
          if case .string(let text) = message { self.handle(text) }
          self.receiveLoop()
        case .failure(let err):
          self.socket = nil
          self.socketOpen = false
          if self.isForeground() { self.setStatus("idle", "foreground_js_owns") }
          else {
            NSLog("[PpSipKeepAlive] socket closed: %@", String(describing: err))
            self.setStatus("reconnecting", "ws_closed")
            self.scheduleReconnect("ws_closed")
          }
        }
      }
    }

    /// Exponential backoff (2s → 60s cap) until the socket is back and REGISTER succeeds.
    private func scheduleReconnect(_ why: String) {
      if reconnectPending { return }
      reconnectPending = true
      reconnectAttempts = min(reconnectAttempts + 1, max(1, backoffMaxAttempts))
      let delay = min(backoffMaxMs / 1000.0, (backoffMinMs / 1000.0) * pow(2.0, Double(reconnectAttempts - 1)))
      NSLog("[PpSipKeepAlive] reconnect in %.0fs (%@)", delay, why)
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self = self else { return }
        self.reconnectPending = false
        if self.isForeground() { self.setStatus("idle", "foreground_js_owns"); return }
        guard self.networkUp else { self.setStatus("reconnecting", "network_down"); self.scheduleReconnect("network_down"); return }
        self.connect()
        DispatchQueue.main.asyncAfter(deadline: .now() + self.verifyDelayMs / 1000.0) { [weak self] in
          guard let self = self else { return }
          if self.status != "registered" && !self.isForeground() { self.scheduleReconnect("still_unregistered") }
        }
      }
    }

    private func startPathMonitor() {
      if pathMonitor != nil { return }
      let m = NWPathMonitor()
      m.pathUpdateHandler = { [weak self] path in
        guard let self = self else { return }
        let up = path.status == .satisfied
        let wasUp = self.networkUp
        if up == wasUp { return }
        if let last = self.lastPathChangeAt, Date().timeIntervalSince(last) < 2.0 { return }
        self.lastPathChangeAt = Date()
        self.networkUp = up
        NSLog("[PpSipKeepAlive] network %@", up ? "available" : "lost")
        if up {
          self.reconnectAttempts = 0
          DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.isForeground() else { return }
            self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil; self.socketOpen = false
            self.connect()
          }
        } else {
          self.setStatus("reconnecting", "network_lost")
        }
      }
      m.start(queue: DispatchQueue.global(qos: .utility))
      pathMonitor = m
    }

    private func handle(_ msg: String) {
      // A 401/407 only authenticates REGISTER when the response CSeq says so.
      // NetSapiens can challenge OPTIONS too; treating that as a REGISTER
      // challenge created a REGISTER → OPTIONS → 407 → REGISTER loop every 3s.
      let responseCSeq = (headerVal(msg, "CSeq") ?? "").uppercased()
      if (msg.hasPrefix("SIP/2.0 401") || msg.hasPrefix("SIP/2.0 407")) && responseCSeq.contains("REGISTER") {
        let isProxyAuth = msg.hasPrefix("SIP/2.0 407")
        sendRegister(challenge: headerVal(msg, isProxyAuth ? "Proxy-Authenticate" : "WWW-Authenticate"), proxyAuth: isProxyAuth)
        return
      }
      if msg.hasPrefix("SIP/2.0 200") && msg.uppercased().contains(" REGISTER") {
        lastRegisterOkTime = Date()
        setStatus("registered", "native_register_200")
        // NetSapiens accepts OPTIONS only after the dialog settles; too early can close WSS with 1001.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in self?.sendOptionsPing() }
        return
      }
      if msg.hasPrefix("INVITE ") {
        setStatus("registered", "incoming_invite")
        let fromHdr = headerVal(msg, "From") ?? ""
        let toHdr = headerVal(msg, "To") ?? ""
        let viaHdr = headerVal(msg, "Via") ?? ""
        let cidHdr = headerVal(msg, "Call-ID") ?? ""
        let cseqHdr = headerVal(msg, "CSeq") ?? ""
        let fromDisplay = parseDisplay(fromHdr)
        let fromUser = parseUser(fromHdr)
        sendRinging(via: viaHdr, from: fromHdr, to: toHdr, cid: cidHdr, cseq: cseqHdr)
        notifyListeners("sipIncomingInvite", data: [
          "callId": cidHdr, "from": fromHdr, "fromUser": fromUser, "fromDisplay": fromDisplay
        ])
        showIncomingCallBanner(callId: cidHdr, label: fromDisplay.isEmpty ? (fromUser.isEmpty ? "Appel entrant" : fromUser) : fromDisplay)
      }
    }

    private func sendRinging(via: String, from: String, to: String, cid: String, cseq: String) {
      guard socket != nil, !via.isEmpty, !cid.isEmpty else { return }
      let toWithTag = to.contains(";tag=") ? to : to + ";tag=" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)
      var r = "SIP/2.0 180 Ringing\\r\\n"
      r += "Via: " + via + "\\r\\n"
      r += "From: " + from + "\\r\\n"
      r += "To: " + toWithTag + "\\r\\n"
      r += "Call-ID: " + cid + "\\r\\n"
      r += "CSeq: " + cseq + "\\r\\n"
      r += "User-Agent: Planipret iOS KeepAlive\\r\\n"
      r += "Content-Length: 0\\r\\n\\r\\n"
      socket?.send(.string(r)) { _ in }
    }

    private func showIncomingCallBanner(callId: String, label: String) {
      let content = UNMutableNotificationContent()
      content.title = "Appel entrant"
      content.body = label
      if #available(iOS 15.2, *) { content.sound = UNNotificationSound.defaultRingtone } else { content.sound = UNNotificationSound.default }
      if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
      content.categoryIdentifier = "PP_INCOMING_CALL"
      content.userInfo = ["pp_call_id": callId, "pp_incoming_call": true]
      let req = UNNotificationRequest(identifier: "pp_incoming_call", content: content, trigger: nil)
      UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    /// OPTIONS keep-alive sent right after the REGISTER 200 OK (never before:
    /// an un-authenticated OPTIONS makes NetSapiens close the socket).
    private func sendOptionsPing() {
      guard let sock = socket, status == "registered", !domain.isEmpty else { return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      var sip = "OPTIONS sip:" + domain + " SIP/2.0\\r\\n"
      sip += "Via: SIP/2.0/WSS " + domain + ";branch=" + branch + "\\r\\n"
      sip += "From: <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\\r\\n"
      sip += "To: <sip:" + domain + ">\\r\\n"
      sip += "Call-ID: " + UUID().uuidString + "@planipret-ios\\r\\n"
      sip += "CSeq: " + String(seq) + " OPTIONS\\r\\n"
      sip += "Max-Forwards: 70\\r\\nUser-Agent: Planipret iOS KeepAlive\\r\\nContent-Length: 0\\r\\n\\r\\n"
      sock.send(.string(sip)) { err in
        if let e = err { NSLog("[PpSipKeepAlive] OPTIONS ping failed: %@", String(describing: e)) }
      }
    }

    private func sendRegister(challenge: String?, proxyAuth: Bool = false, force: Bool = false) {
      if isForeground() { releaseRegistration("foreground_js_owns"); return }
      if socket == nil { connect(); return }
      if !socketOpen {
        registerOnOpen = true
        if !force { NSLog("[PpSipKeepAlive] REGISTER skipped: ws_not_open") }
        return
      }
      // Two REGISTERs in a row on the same WSS connection make NetSapiens see a
      // duplicate AoR and close the socket. Hold off after each send/200 OK
      // (auth challenge responses are exempt: they complete the same handshake).
      if !force, challenge == nil, let sentAt = lastRegisterSentTime, Date().timeIntervalSince(sentAt) <= registerDebounceSec {
        NSLog("[PpSipKeepAlive] REGISTER debounced: %.2fs since sent (min %.1fs)", Date().timeIntervalSince(sentAt), registerDebounceSec)
        return
      }
      if !force, challenge == nil, let okAt = lastRegisterOkTime, Date().timeIntervalSince(okAt) <= registerDebounceSec {
        NSLog("[PpSipKeepAlive] REGISTER debounced: %.2fs since 200 OK (min %.1fs)", Date().timeIntervalSince(okAt), registerDebounceSec)
        return
      }
      guard !login.isEmpty, !domain.isEmpty else { setStatus("error", "missing_credentials"); return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      let contact = "<sip:" + login + "@" + stableContactHost() + ";transport=wss>"
      var sip = "REGISTER sip:" + domain + " SIP/2.0\\r\\n"
      sip += "Via: SIP/2.0/WSS " + domain + ";branch=" + branch + "\\r\\nMax-Forwards: 70\\r\\n"
      sip += "To: <sip:" + login + "@" + domain + ">\\r\\nFrom: \\"" + displayName.replacingOccurrences(of: "\\"", with: "") + "\\" <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\\r\\n"
      sip += "Call-ID: " + callIdReg + "\\r\\nCSeq: " + String(seq) + " REGISTER\\r\\nContact: " + contact + ";expires=" + String(registerExpires) + "\\r\\nExpires: " + String(registerExpires) + "\\r\\nUser-Agent: Planipret iOS KeepAlive\\r\\nSupported: outbound,path,gruu\\r\\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\\r\\n"
      if let ch = challenge, !password.isEmpty { sip += (proxyAuth ? "Proxy-Authorization: " : "Authorization: ") + digest(challenge: ch) + "\\r\\n" }
      sip += "Content-Length: 0\\r\\n\\r\\n"
      socket?.send(.string(sip)) { [weak self] err in
        DispatchQueue.main.async {
          guard let self = self else { return }
          if err == nil {
            self.lastRegisterSentTime = Date()
            self.setStatus("connecting", challenge == nil ? "register_sent" : "register_auth_sent")
          } else {
            NSLog("[PpSipKeepAlive] REGISTER send failed: %@", String(describing: err))
            self.socket?.cancel(with: .abnormalClosure, reason: nil)
            self.socket = nil
            self.setStatus("reconnecting", "register_send_failed")
            self.scheduleReconnect("register_send_failed")
          }
        }
      }
    }

    private func stableContactHost() -> String {
      // RFC-routable Contact host: always the real SIP domain (never .invalid)
      return domain.isEmpty ? "planipret.ca" : domain
    }

    private func digest(challenge: String) -> String { let m = parseDigest(challenge); let realm = m["realm"] ?? domain; let nonce = m["nonce"] ?? ""; let qop = m["qop"] ?? ""; let uri = "sip:" + domain; let nc = "00000001"; let cnonce = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16); let ha1 = md5(login + ":" + realm + ":" + password); let ha2 = md5("REGISTER:" + uri); let response = qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); var out = "Digest username=\\"" + login + "\\", realm=\\"" + realm + "\\", nonce=\\"" + nonce + "\\", uri=\\"" + uri + "\\", response=\\"" + response + "\\", algorithm=MD5"; if qop.contains("auth") { out += ", qop=auth, nc=" + nc + ", cnonce=\\"" + cnonce + "\\"" }; if let opaque = m["opaque"] { out += ", opaque=\\"" + opaque + "\\"" }; return out }
    private func parseDigest(_ h: String) -> [String:String] { var out: [String:String] = [:]; let s = h.replacingOccurrences(of: "Digest ", with: "", options: .caseInsensitive); for part in s.split(separator: ",") { let pieces = part.split(separator: "=", maxSplits: 1); if pieces.count == 2 { var v = pieces[1].trimmingCharacters(in: .whitespaces); if v.hasPrefix("\\"") && v.hasSuffix("\\"") { v.removeFirst(); v.removeLast() }; out[pieces[0].trimmingCharacters(in: .whitespaces)] = v } }; return out }
    private func headerVal(_ msg: String, _ name: String) -> String? { for line in msg.components(separatedBy: .newlines) { if line.lowercased().hasPrefix(name.lowercased() + ":") { return String(line.dropFirst(name.count + 1)).trimmingCharacters(in: .whitespaces) } }; return nil }
    private func parseDisplay(_ hdr: String) -> String { guard let lt = hdr.firstIndex(of: "<") else { return "" }; var d = String(hdr[..<lt]).trimmingCharacters(in: .whitespaces); if d.hasPrefix("\\"") && d.hasSuffix("\\"") { d.removeFirst(); d.removeLast() }; return d }
    private func parseUser(_ hdr: String) -> String { var uri = hdr; if let lt = hdr.firstIndex(of: "<"), let gt = hdr[lt...].firstIndex(of: ">") { uri = String(hdr[hdr.index(after: lt)..<gt]) }; if uri.hasPrefix("sip:") { uri = String(uri.dropFirst(4)) } else if uri.hasPrefix("sips:") { uri = String(uri.dropFirst(5)) }; if let at = uri.firstIndex(of: "@") { uri = String(uri[..<at]) }; if let semi = uri.firstIndex(of: ";") { uri = String(uri[..<semi]) }; return uri }
    private func md5(_ s: String) -> String { let d = Insecure.MD5.hash(data: Data(s.utf8)); return d.map { String(format: "%02hhx", $0) }.joined() }
    private func beginBackgroundTask() { if bgTask != .invalid { return }; bgTask = UIApplication.shared.beginBackgroundTask(withName: "PlanipretSIPKeepAlive") { [weak self] in self?.endBackgroundTask(); self?.setStatus("protected", "background_task_expired") }; DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.sendRegister(challenge: nil); self?.endBackgroundTask() } }
    private func endBackgroundTask() { if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid } }
    private func setStatus(_ next: String, _ nextReason: String) { status = next; reason = nextReason; updatedAt = Date().timeIntervalSince1970 * 1000; DispatchQueue.main.async { self.notifyListeners("sipServiceStatus", data: self.snapshot(ok: true)) } }
    private func snapshot(ok: Bool) -> [String: Any] { ["ok": ok, "status": status, "reason": reason, "updatedAt": updatedAt, "backgroundTaskActive": bgTask != .invalid, "loggedIn": status == "registered"] }
}
`;

// ---------- PpVoipCall: iOS PushKit + CallKit ----------
// Planiprêt only. Renders the native iOS incoming-call screen from a VoIP push,
// even when the app is killed or the phone is locked. Runs alongside
// PpSipKeepAlive (which owns the SIP socket). Do NOT reuse in Lemtel.
const IOS_VOIP_CALL_PLUGIN = `import Foundation
import Capacitor
import UIKit
import PushKit
import CallKit
import AVFoundation

@objc(PpVoipCall)
public class PpVoipCall: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "PpVoipCall"; public let jsName = "PpVoipCall"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "getVoipPushToken", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "refreshVoipPushToken", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "completeAnswer", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    private var pushRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private var callController = CXCallController()
    private var voipToken: String?
    private var lastReportedToken: String?
    private var activeCallUUID: UUID?
    private var activeCallId: String?
    private var pendingAnswerAction: CXAnswerCallAction?
    private var pendingAnswerBackgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var answerCompleted = false
    // ring17: NetSapiens can emit the SAME inbound call twice with two
    // different callIds. Deduplicate on the caller number too, otherwise a
    // second CallKit call races the first answer action.
    private var lastPushNumber: String = ""
    private var lastPushAt: TimeInterval = 0
    private let voipTokenDefaultsKey = "pp.voip.push-token.v1"
    /// true quand l'appel CallKit courant est piloté par le moteur PJSIP natif
    /// (INVITE reçu en TLS 5061) et non plus par le chemin JsSIP/WebView.
    private var nativeEngineOwnsCall = false

    private func beginAnswerBackgroundTask() {
        endAnswerBackgroundTask()
        pendingAnswerBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: "PpVoipAnswer") { [weak self] in
            guard let self = self else { return }
            self.pendingAnswerAction?.fail()
            self.pendingAnswerAction = nil
            self.endAnswerBackgroundTask()
        }
    }

    private func endAnswerBackgroundTask() {
        guard pendingAnswerBackgroundTask != .invalid else { return }
        let task = pendingAnswerBackgroundTask
        pendingAnswerBackgroundTask = .invalid
        UIApplication.shared.endBackgroundTask(task)
    }


    private func apnsEnvironment() -> String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.voipToken = UserDefaults.standard.string(forKey: self.voipTokenDefaultsKey)
            self.setupCallKit()
            self.setupPushKit()
            self.notifyListeners("callKitReady", data: ["ok": true])
            self.observePjsipEngine()
        }
    }

    // MARK: - Pont PJSIP natif → CallKit
    /// La sonnerie système est désormais déclenchée par l'INVITE PJSIP natif.
    /// Le push VoIP ne sert plus qu'à réveiller le process : si PJSIP présente
    /// l'appel en premier, le chemin JsSIP n'est jamais sollicité.
    private func observePjsipEngine() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: Notification.Name("PpPjsipIncomingCall"), object: nil, queue: .main) { [weak self] note in
            guard let self = self else { return }
            let info = note.userInfo as? [String: Any] ?? [:]
            self.reportNativeIncomingCall(
                callId: (info["callId"] as? String) ?? UUID().uuidString,
                callerName: (info["callerName"] as? String) ?? "Appel entrant",
                callerNumber: (info["callerNumber"] as? String) ?? ""
            )
        }
        nc.addObserver(forName: Notification.Name("PpPjsipCallConnected"), object: nil, queue: .main) { [weak self] _ in
            guard let self = self, let uuid = self.activeCallUUID else { return }
            self.provider?.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
        nc.addObserver(forName: Notification.Name("PpPjsipOutgoingCall"), object: nil, queue: .main) { [weak self] note in
            guard let self = self else { return }
            let info = note.userInfo as? [String: Any] ?? [:]
            let callId = (info["callId"] as? String) ?? UUID().uuidString
            let destination = (info["destination"] as? String) ?? ""
            let uuid = UUID()
            self.activeCallUUID = uuid
            self.activeCallId = callId
            self.nativeEngineOwnsCall = true
            let handle = CXHandle(type: .phoneNumber, value: destination)
            let action = CXStartCallAction(call: uuid, handle: handle)
            self.callController.request(CXTransaction(action: action)) { error in
                if let error = error {
                    NSLog("[PpVoipCall] outgoing CallKit transaction failed: %@", error.localizedDescription)
                    NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil)
                }
            }
        }
        nc.addObserver(forName: Notification.Name("PpPjsipOutgoingRinging"), object: nil, queue: .main) { [weak self] _ in
            guard let self = self, let uuid = self.activeCallUUID else { return }
            self.provider?.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
        }
        nc.addObserver(forName: Notification.Name("PpPjsipAnswerResult"), object: nil, queue: .main) { [weak self] note in
            guard let self = self, let pending = self.pendingAnswerAction else { return }
            let ok = (note.userInfo?["ok"] as? Bool) ?? false
            self.pendingAnswerAction = nil
            self.answerCompleted = ok
            if ok { pending.fulfill() } else { pending.fail() }
            self.endAnswerBackgroundTask()
            NSLog("[PpVoipCall] native SIP answer %@", ok ? "confirmed" : "failed")
        }
        nc.addObserver(forName: Notification.Name("PpPjsipCallEnded"), object: nil, queue: .main) { [weak self] note in
            guard let self = self, let uuid = self.activeCallUUID else { return }
            let code = (note.userInfo?["code"] as? Int) ?? 0
            let reason: CXCallEndedReason = (code == 486 || code == 603) ? .declinedElsewhere
                : (code >= 400 && code != 487) ? .failed : .remoteEnded
            self.provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
            self.pendingAnswerAction?.fail(); self.pendingAnswerAction = nil
            self.endAnswerBackgroundTask()
            self.activeCallUUID = nil; self.activeCallId = nil
            self.nativeEngineOwnsCall = false
        }
    }

    private func reportNativeIncomingCall(callId: String, callerName: String, callerNumber: String) {
        // Un push VoIP a pu déjà présenter le même appel : on garde le premier
        // UUID CallKit et on se contente d'enrichir l'affichage.
        if let uuid = activeCallUUID {
            nativeEngineOwnsCall = true
            activeCallId = callId
            let update = CXCallUpdate()
            // Le push VoIP arrive souvent sans numero (NetSapiens ne le fournit
            // pas toujours) -> CallKit affiche "Numero indisponible". L'INVITE
            // natif, lui, porte toujours le From : on corrige le handle ici.
            if !callerNumber.isEmpty {
                update.remoteHandle = CXHandle(type: .phoneNumber, value: callerNumber)
            }
            update.localizedCallerName = callerName
            provider?.reportCall(with: uuid, updated: update)
            NSLog("[PpVoipCall] PJSIP INVITE joined existing CallKit call callId=%@", callId)
            // L'utilisateur a pu decrocher AVANT l'arrivee de l'INVITE (appel
            // presente par le push). L'action CallKit attendait alors JsSIP qui
            // ne repond plus : on la remplit maintenant via PJSIP.
            if let pending = pendingAnswerAction {
                pendingAnswerAction = nil
                answerCompleted = true
                endAnswerBackgroundTask()
                // PpPjsipAnswerPending already armed the engine when CallKit
                // was answered before this INVITE. handleIncomingCall() sends
                // the 200 OK itself; posting AnswerRequested here would answer
                // the same dialog twice and can leave the caller ringing.
                notifyListeners("incomingCallAnswered", data: [
                    "callUUID": uuid.uuidString,
                    "callId": callId,
                    "source": "pjsip"
                ], retainUntilConsumed: true)
                pending.fulfill()
                NSLog("[PpVoipCall] pending answer fulfilled by native INVITE callId=%@", callId)
            }
            return
        }

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId
        nativeEngineOwnsCall = true

        let update = CXCallUpdate()
        update.remoteHandle = callerNumber.isEmpty
            ? CXHandle(type: .generic, value: callerName)
            : CXHandle(type: .phoneNumber, value: callerNumber)
        update.localizedCallerName = callerName
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsDTMF = true

        provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                NSLog("[PpVoipCall] PJSIP reportNewIncomingCall failed: \\(error.localizedDescription)")
                NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil)
                return
            }
            NSLog("[PpVoipCall] CallKit ringing from native PJSIP INVITE callId=%@", callId)
            self?.notifyListeners("callKitReady", data: [
                "callUUID": uuid.uuidString,
                "callId": callId,
                "callerName": callerName,
                "callerNumber": callerNumber,
                "source": "pjsip"
            ], retainUntilConsumed: true)
        }
    }


    private func setupCallKit() {
        let cfg = CXProviderConfiguration(localizedName: "Planiprêt")
        cfg.supportsVideo = false
        cfg.maximumCallsPerCallGroup = 1
        cfg.maximumCallGroups = 1
        cfg.supportedHandleTypes = [.phoneNumber, .generic]
        cfg.includesCallsInRecents = true
        if let img = UIImage(named: "AppIcon") { cfg.iconTemplateImageData = img.pngData() }
        let p = CXProvider(configuration: cfg)
        p.setDelegate(self, queue: nil)
        self.provider = p
    }

    private func setupPushKit() {
        guard pushRegistry == nil else {
            pushRegistry?.desiredPushTypes = [.voIP]
            return
        }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.pushRegistry = registry
    }

    // MARK: - JS ↔ Native
    @objc func getVoipPushToken(_ call: CAPPluginCall) {
        if pushRegistry == nil {
            NSLog("[PpVoipCall] PushKit registry missing, creating it")
            setupPushKit()
        }
        call.resolve([
            "token": voipToken ?? "",
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment()
        ])
    }

    /// Keep one registry alive; replacing it while APNs registration is pending
    /// prevents the delegate callback from ever delivering the token.
    @objc func refreshVoipPushToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(["ok": false]); return }
            self.setupPushKit()
            let current = self.voipToken ?? ""
            NSLog("[PpVoipCall] PushKit registry armed (cached token: %@)", current.isEmpty ? "no" : "yes")
            call.resolve(["ok": true, "token": current])
        }
    }

    @objc func reportCallEnded(_ call: CAPPluginCall) {
        if let uuid = activeCallUUID {
            let end = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: end)) { _ in }
            activeCallUUID = nil
            activeCallId = nil
        }
        endAnswerBackgroundTask()
        call.resolve(["ok": true])
    }

    @objc func completeAnswer(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        let ok = call.getBool("ok") ?? false
        // Push webhook IDs and the final SIP Call-ID are not guaranteed to be
        // identical. CallKit is configured for one call only, so the pending
        // CXAnswerCallAction is the authoritative correlation token.
        guard let action = pendingAnswerAction else {
            // ring16: completeAnswer is idempotent. A second call after the
            // action was already fulfilled is a duplicate, not a failure.
            call.resolve(["ok": answerCompleted, "reason": answerCompleted ? "already_completed" : "no_pending_answer"])
            return
        }
        pendingAnswerAction = nil
        answerCompleted = ok
        if ok { action.fulfill() } else { action.fail() }
        endAnswerBackgroundTask()
        call.resolve(["ok": true])
    }

    // MARK: - PKPushRegistryDelegate
    public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = credentials.token.map { String(format: "%02x", $0) }.joined()
        let changed = token != (lastReportedToken ?? "")
        self.voipToken = token
        self.lastReportedToken = token
        UserDefaults.standard.set(token, forKey: voipTokenDefaultsKey)
        NSLog("[PpVoipCall] VoIP token updated changed=%@ suffix=%@", changed ? "yes" : "no", String(token.suffix(6)))
        notifyListeners("voipPushToken", data: [
            "token": token,
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment(),
            "changed": changed,
            "source": "pushkit"
        ])
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        NSLog("[PpVoipCall] VoIP token invalidated — re-arming PushKit")
        self.voipToken = nil
        UserDefaults.standard.removeObject(forKey: voipTokenDefaultsKey)
        notifyListeners("voipPushTokenInvalidated", data: ["platform": "ios"])
        DispatchQueue.main.async { [weak self] in self?.setupPushKit() }
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let dict = payload.dictionaryPayload
        let callId = (dict["callId"] as? String) ?? (dict["call_id"] as? String) ?? UUID().uuidString
        let callerName = (dict["callerName"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from"] as? String) ?? "Appel entrant"
        let callerNumber = (dict["callerNumber"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from_user"] as? String) ?? ""

        // CallKit is configured for exactly one call. The webhook push and the
        // native SIP INVITE use different IDs, and APNs retries may omit the
        // caller number. Therefore any push received while a CallKit call is
        // already alive belongs to that existing physical call. Never replace
        // its UUID: doing so creates two system call screens and makes the green
        // button target the stale UUID.
        if let uuid = activeCallUUID {
            let update = CXCallUpdate()
            if !callerNumber.isEmpty {
                update.remoteHandle = CXHandle(type: .phoneNumber, value: callerNumber)
            }
            update.localizedCallerName = callerName
            provider?.reportCall(with: uuid, updated: update)
            NSLog("[PpVoipCall] VoIP push joined active CallKit call pushCallId=%@ activeCallId=%@", callId, activeCallId ?? "")
            completion()
            return
        }

        // NetSapiens can retry a call event while iOS is waking. Preserve the
        // first CallKit UUID so its Answer action never becomes stale.
        if callId == activeCallId, activeCallUUID != nil {
            NSLog("[PpVoipCall] duplicate VoIP push ignored callId=%@", callId)
            completion()
            return
        }
        // ring17: same caller, different callId, within 45s of the first push
        // and a CallKit call still up → same physical call, drop it.
        let now = Date().timeIntervalSince1970
        let digits = callerNumber.filter { $0.isNumber }
        if !digits.isEmpty, digits == lastPushNumber, activeCallUUID != nil, now - lastPushAt < 45 {
            NSLog("[PpVoipCall] duplicate VoIP push ignored (same caller) callId=%@", callId)
            completion()
            return
        }
        lastPushNumber = digits
        lastPushAt = now


        // Wake the native SIP keep-alive FIRST: iOS may have killed the WSS
        // socket while suspended, and only this push guarantees runtime.
        NotificationCenter.default.post(name: Notification.Name("PpVoipIncomingPush"), object: nil, userInfo: ["callId": callId])

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId

        let update = CXCallUpdate()
        let handle: CXHandle = callerNumber.isEmpty
            ? CXHandle(type: .generic, value: callerName)
            : CXHandle(type: .phoneNumber, value: callerNumber)
        update.remoteHandle = handle
        update.localizedCallerName = callerName
        update.hasVideo = false
        update.supportsHolding = true
        update.supportsDTMF = true

        provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                NSLog("[PpVoipCall] reportNewIncomingCall failed: \\(error.localizedDescription)")
            }
            self?.notifyListeners("callKitReady", data: [
                "callUUID": uuid.uuidString,
                "callId": callId,
                "callerName": callerName,
                "callerNumber": callerNumber
            ], retainUntilConsumed: true)
            completion()
        }
    }

    // MARK: - CXProviderDelegate
    public func providerDidReset(_ provider: CXProvider) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        endAnswerBackgroundTask()
        if nativeEngineOwnsCall {
            NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil)
        }
        nativeEngineOwnsCall = false
        activeCallUUID = nil; activeCallId = nil
    }

    /// Mute système (bouton CallKit) → coupe le flux micro dans PJSIP.
    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("PpPjsipMuteRequested"), object: nil,
            userInfo: ["muted": action.isMuted]
        )
        notifyListeners("callMuted", data: ["muted": action.isMuted])
        action.fulfill()
    }

    /// Clavier CallKit → DTMF RFC 2833 côté PJSIP.
    public func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("PpPjsipDtmfRequested"), object: nil,
            userInfo: ["digits": action.digits]
        )
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // Never invalidate the first valid answer transaction. A duplicate
        // CallKit callback must join/lose, not fail the action JS is completing.
        if pendingAnswerAction != nil {
            NSLog("[PpVoipCall] duplicate answer action ignored")
            // Do not show a failed Answer operation for a duplicate callback.
            // The first action remains authoritative and completes with SIP.
            action.fulfill()
            return
        }
        // Prepare the route but let CallKit own activation (didActivate:) —
        // activating here races the system session and yields a dead call.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])

        // Keep CallKit pending until pjsua_call_answer really accepts the 200 OK.
        if nativeEngineOwnsCall {
            pendingAnswerAction = action
            answerCompleted = false
            beginAnswerBackgroundTask()
            NotificationCenter.default.post(name: Notification.Name("PpVoipCallAnswered"), object: nil, userInfo: ["callId": activeCallId ?? ""])
            NotificationCenter.default.post(name: Notification.Name("PpPjsipAnswerRequested"), object: nil, userInfo: ["callId": activeCallId ?? ""])
            notifyListeners("incomingCallAnswered", data: [
                "callUUID": action.callUUID.uuidString,
                "callId": activeCallId ?? "",
                "source": "pjsip"
            ], retainUntilConsumed: true)
            return
        }

        // Store the transaction BEFORE waking JS. A retained Capacitor listener
        // can answer synchronously; completeAnswer() must already have the
        // authoritative CXAnswerCallAction when that callback returns.
        pendingAnswerAction = action
        answerCompleted = false
        beginAnswerBackgroundTask()
        // Si le moteur PJSIP est demarre, l'INVITE natif va arriver d'un
        // instant a l'autre : reportNativeIncomingCall remplira cette action.
        NotificationCenter.default.post(name: Notification.Name("PpPjsipAnswerPending"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        // Keep the SIP transport pinned up while the WebView answers.
        NotificationCenter.default.post(name: Notification.Name("PpVoipCallAnswered"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        notifyListeners("incomingCallAnswered", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ], retainUntilConsumed: true)
        // JS keeps the pending SIP-answer intent for 30s. Keep CallKit alive
        // slightly longer so slow WSS registration/refork can still complete.
        DispatchQueue.main.asyncAfter(deadline: .now() + 32.0) { [weak self, weak action] in
            guard let self = self, let action = action, self.pendingAnswerAction === action else { return }
            self.pendingAnswerAction = nil
            NSLog("[PpVoipCall] answer action timed out — SIP dialog not confirmed")
            action.fail()
            self.endAnswerBackgroundTask()
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        guard activeCallUUID == action.callUUID else {
            action.fail()
            return
        }
        let update = CXCallUpdate()
        update.remoteHandle = action.handle
        update.hasVideo = false
        update.supportsDTMF = true
        update.supportsHolding = false
        provider.reportCall(with: action.callUUID, updated: update)
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        endAnswerBackgroundTask()
        if nativeEngineOwnsCall {
            // 603 Decline côté PJSIP : un 486 renverrait l'appel en messagerie.
            NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        }
        notifyListeners("incomingCallRejected", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? "",
            "source": nativeEngineOwnsCall ? "pjsip" : "jssip"
        ])
        activeCallUUID = nil; activeCallId = nil
        nativeEngineOwnsCall = false
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        NotificationCenter.default.post(name: Notification.Name("PpCallKitAudioActivated"), object: audioSession)
        // ring17: JS must only attach/enable the microphone track AFTER CallKit
        // owns the session, otherwise the outgoing direction stays silent.
        notifyListeners("audioSessionActivated", data: ["callId": activeCallId ?? ""], retainUntilConsumed: true)
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        NotificationCenter.default.post(name: Notification.Name("PpCallKitAudioDeactivated"), object: audioSession)
        notifyListeners("audioSessionDeactivated", data: ["callId": activeCallId ?? ""])
    }
}
`;

const IOS_VOIP_CALL_BRIDGE = `#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpVoipCall, "PpVoipCall",
  CAP_PLUGIN_METHOD(getVoipPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(refreshVoipPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(reportCallEnded, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(completeAnswer, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
)
`;

// ---------- PpAuthSession: iOS ASWebAuthenticationSession ----------
// Microsoft SSO must come back into the app WITHOUT the Safari
// "Ouvrir cette page dans Planiprêt Mobile ?" prompt. SFSafariViewController
// (@capacitor/browser) cannot follow a custom-scheme redirect silently;
// ASWebAuthenticationSession hands the callback URL straight back to JS.
const IOS_AUTH_SESSION_PLUGIN = `import Foundation
import Capacitor
import UIKit
import AuthenticationServices

@objc(PpAuthSession)
public class PpAuthSession: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "PpAuthSession"
    public let jsName = "PpAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("missing url"); return
        }
        let scheme = call.getString("scheme") ?? "capacitor"
        DispatchQueue.main.async {
            guard self.session == nil else {
                NSLog("[PpAuthSession] duplicate start rejected")
                call.reject("session_in_progress")
                return
            }
            let authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackUrl, error in
                self.session = nil
                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.resolve(["cancelled": true])
                        return
                    }
                    NSLog("[PpAuthSession] failed: %@", error.localizedDescription)
                    call.reject(error.localizedDescription)
                    return
                }
                guard let callbackUrl = callbackUrl else { call.resolve(["cancelled": true]); return }
                NSLog("[PpAuthSession] callback received")
                call.resolve(["url": callbackUrl.absoluteString])
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            self.session = authSession
            if !authSession.start() {
                self.session = nil
                call.reject("cannot start auth session")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
`;

const IOS_AUTH_SESSION_BRIDGE = `#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpAuthSession, "PpAuthSession",
  CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
)
`;

const IOS_KEEPALIVE_BRIDGE_FILENAME = "PpSipKeepAlive.m";
const IOS_KEEPALIVE_BRIDGE = `#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpSipKeepAlive, "PpSipKeepAlive",
  CAP_PLUGIN_METHOD(startSipService, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(stopSipService, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getSipServiceStatus, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(triggerReregister, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(acknowledgeIncoming, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(wakeForIncomingCall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setCallActive, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(declareJsOwnsAor, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setAudioRoute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getAudioRoute, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
)
`;

function writeIfChanged(file, next) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (prev === next) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return true;
}

function stripObsoleteIosFallbackFromHtml(html) {
  let next = html;
  next = next.replace(
    /\n\s*function showBootFallback\(message\) \{[\s\S]*?\n\s*window\.__PP_DISABLE_NATIVE_BOOT_FALLBACK__ = true;/,
    "\n        window.__PP_DISABLE_NATIVE_BOOT_FALLBACK__ = true;",
  );
  next = next.replace(/\n\s*window\.__PP_SHOW_BOOT_FALLBACK__ = showBootFallback;\s*/g, "\n");
  next = next.replace(/\n\s*<div id="pp-native-boot-fallback"[\s\S]*?\n\s*<\/body>/, "\n  </body>");
  next = next.replace(/const t=document\.getElementById\("pp-native-boot-fallback"\);t&&\(t\.style\.display="none"\)/g, "");
  return next;
}

function patchCopiedWebBundles() {
  const rels = [
    "dist/index.html",
    "ios/App/App/public/index.html",
    "android/app/src/main/assets/public/index.html",
  ];
  for (const assetsRel of ["dist/assets", "ios/App/App/public/assets", "android/app/src/main/assets/public/assets"]) {
    const dir = path.join(appDir, assetsRel);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) if (name.endsWith(".js")) rels.push(path.join(assetsRel, name));
  }
  for (const rel of rels) {
    const file = path.join(appDir, rel);
    if (!fs.existsSync(file)) continue;
    const before = fs.readFileSync(file, "utf8");
    const next = stripObsoleteIosFallbackFromHtml(before);
    if (next !== before) {
      fs.writeFileSync(file, next);
      console.log(`[native-config] removed obsolete iOS boot fallback from ${rel}`);
    }
  }
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function findFile(root, name) {
  return walk(root).find((file) => path.basename(file) === name);
}

function ensureSwiftImports(swift, imports) {
  let next = swift;
  for (const name of imports) {
    if (!new RegExp(`^import\\s+${name}\\b`, "m").test(next)) {
      next = `import ${name}\n${next}`;
    }
  }
  return next;
}

function stripSwiftImports(swift) {
  return swift.replace(/^import\s+[^\n]+\n/gm, "").trim();
}

// Remove plugin class bodies that older versions of this script inlined into
// the launch view controller (they now live in App/Plugins/*.swift).
function stripInlinePlugins(swift) {
  let next = swift;
  const marker = "// MARK: - Inline Planiprêt native plugins";
  const idx = next.indexOf(marker);
  if (idx > -1) {
    next = `${next.slice(0, idx).trimEnd()}\n`;
    console.log("[native-config] Removed inline duplicate plugin classes from iOS view controller.");
  }
  // Defensive: drop any leftover @objc(PpSipKeepAlive)/@objc(PpVoipCall) class
  // declarations still present in the controller file.
  for (const name of ["PpSipKeepAlive", "PpVoipCall"]) {
    const re = new RegExp(`@objc\\(${name}\\)\\s*\\n(public\\s+)?class\\s+${name}\\b`);
    const m = re.exec(next);
    if (!m) continue;
    const start = m.index;
    const braceStart = next.indexOf("{", start);
    if (braceStart === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < next.length; i += 1) {
      const ch = next[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) continue;
    next = `${next.slice(0, start).trimEnd()}\n${next.slice(end).trimStart()}`;
    console.log(`[native-config] Removed duplicate inline ${name} class from iOS view controller.`);
  }
  return next.trimEnd() + "\n";
}


// True when the committed PpPjsip plugin sources are present in the iOS tree.
const PP_HAS_PJSIP = fs.existsSync(
  path.join(appDir, "ios", "App", "App", "Plugins", "PpPjsip", "PpPjsip.swift")
);

function hasProjectReference(iosRoot, fileName) {
  const pbx = path.join(iosRoot, "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbx)) return false;
  return fs.readFileSync(pbx, "utf8").includes(fileName);
}

function xcodeId(seed) {
  return crypto.createHash("sha1").update(`planipret:${seed}`).digest("hex").slice(0, 24).toUpperCase();
}

function ensureXcodeSourceFiles(iosRoot, relativeFiles) {
  const pbx = path.join(iosRoot, "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbx)) return false;
  let text = fs.readFileSync(pbx, "utf8");
  const before = text;

  for (const rel of relativeFiles) {
    const fileName = path.basename(rel);
    const buildName = `${fileName} in Sources`;
    const fileRef = xcodeId(`file:${rel}`);
    const buildRef = xcodeId(`build:${rel}`);
    const fileType = rel.endsWith(".swift") ? "sourcecode.swift" : "sourcecode.c.objc";
    const quotedRel = rel.includes(" ") ? `\"${rel}\"` : rel;

    if (!text.includes(`${fileRef} /* ${fileName} */`)) {
      const fileLine = `\t\t${fileRef} /* ${fileName} */ = {isa = PBXFileReference; lastKnownFileType = ${fileType}; path = ${quotedRel}; sourceTree = SOURCE_ROOT; };\n`;
      text = text.replace(/(\/\* End PBXFileReference section \*\/)/, `${fileLine}$1`);
    }
    if (!text.includes(`${buildRef} /* ${buildName} */`)) {
      const buildLine = `\t\t${buildRef} /* ${buildName} */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* ${fileName} */; };\n`;
      text = text.replace(/(\/\* End PBXBuildFile section \*\/)/, `${buildLine}$1`);
    }
    text = text.replace(/(isa = PBXSourcesBuildPhase;[\s\S]*?files = \(\n)([\s\S]*?)(\s*\);)/g, (match, start, files, end) => {
      if (files.includes(buildRef) || files.includes(buildName)) return match;
      return `${start}${files}\t\t\t\t${buildRef} /* ${buildName} */,\n${end}`;
    });
  }

  if (text !== before) {
    fs.writeFileSync(pbx, text);
    console.log("[native-config] iOS Xcode project source build phase patched for Planiprêt plugins.");
    return true;
  }
  return false;
}

// Retire complètement un fichier source du projet Xcode (références + phase de
// compilation). Utilisé pour purger les bridges ObjC obsolètes.
function removeXcodeSourceFile(iosRoot, rel) {
  const pbx = path.join(iosRoot, "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbx)) return false;
  let text = fs.readFileSync(pbx, "utf8");
  const before = text;
  const fileName = path.basename(rel);
  const fileRef = xcodeId(`file:${rel}`);
  const buildRef = xcodeId(`build:${rel}`);
  text = text
    .split("\n")
    .filter((line) => !(line.includes(fileRef) || line.includes(buildRef) || line.includes(`${fileName} in Sources`)))
    .join("\n");
  if (text !== before) {
    fs.writeFileSync(pbx, text);
    console.log(`[native-config] removed stale Xcode reference: ${rel}`);
    return true;
  }
  return false;
}


// Lier libpjsip.xcframework à la cible App + exposer son module.modulemap à
// Swift. Sans ça `#if canImport(pjsua)` est FAUX et tout le moteur PJSIP est
// exclu à la compilation, même si l'archive est visible dans Xcode.
const pjsipWarnings = [];

function ensurePjsipXcframework(iosRoot) {
  const rel = "App/Plugins/PpPjsip/Frameworks/libpjsip.xcframework";
  const abs = path.join(iosRoot, rel);
  const present = fs.existsSync(abs);
  const hasHeaders =
    present &&
    fs.readdirSync(abs).some((slice) => fs.existsSync(path.join(abs, slice, "Headers")));

  // Le script ne doit JAMAIS échouer si le binaire manque : le repli JsSIP
  // prend le relais. On avertit clairement en fin d'exécution.
  if (!present) {
    pjsipWarnings.push(`⚠ libpjsip.xcframework absent → lancer scripts/build-pjsip-ios.sh (${rel})`);
  } else if (!hasHeaders) {
    pjsipWarnings.push("⚠ libpjsip.xcframework sans dossier Headers → canImport(pjsua) sera faux; relancer scripts/build-pjsip-ios.sh");
  }

  // Sans binaire sur disque, on n'injecte pas de référence (Xcode refuserait
  // de compiler un fichier manquant) — le repli JsSIP reste opérationnel.
  if (!present) return false;

  const pbx = path.join(iosRoot, "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbx)) return false;

  let text = fs.readFileSync(pbx, "utf8");
  const before = text;

  const fileName = "libpjsip.xcframework";
  const fileRef = xcodeId(`file:${rel}`);
  const buildRef = xcodeId(`build:${rel}`);
  const buildName = `${fileName} in Frameworks`;

  if (!text.includes(`${fileRef} /* ${fileName} */`)) {
    const line = `\t\t${fileRef} /* ${fileName} */ = {isa = PBXFileReference; lastKnownFileType = wrapper.xcframework; path = ${rel}; sourceTree = SOURCE_ROOT; };\n`;
    text = text.replace(/(\/\* End PBXFileReference section \*\/)/, `${line}$1`);
  }
  if (!text.includes(`${buildRef} /* ${buildName} */`)) {
    const line = `\t\t${buildRef} /* ${buildName} */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* ${fileName} */; };\n`;
    text = text.replace(/(\/\* End PBXBuildFile section \*\/)/, `${line}$1`);
  }
  text = text.replace(
    /(isa = PBXFrameworksBuildPhase;[\s\S]*?files = \(\n)([\s\S]*?)(\s*\);)/g,
    (match, start, files, end) =>
      files.includes(buildRef) ? match : `${start}${files}\t\t\t\t${buildRef} /* ${buildName} */,\n${end}`
  );

  // Réglages de build: on purge les anciens chemins SRCROOT vers les Headers
  // des tranches (cause de "redefinition of module 'pjsua'") et on pointe
  // uniquement vers le include généré par Xcode pour l'xcframework.
  const includes = `\"$(BUILT_PRODUCTS_DIR)/include\"`;
  text = text.replace(/(buildSettings = \{\n)([\s\S]*?)(\n\t*\};)/g, (match, start, body, end) => {
    if (!/PRODUCT_BUNDLE_IDENTIFIER/.test(body)) return match;
    let next = body;
    for (const key of ["SWIFT_INCLUDE_PATHS", "HEADER_SEARCH_PATHS"]) {
      const re = new RegExp(`(${key} = )([^;]*);`);
      if (re.test(next)) {
        const current = next.match(re)[2];
        if (current.includes("BUILT_PRODUCTS_DIR)/include") && !current.includes("libpjsip.xcframework")) continue;
        next = next.replace(re, `$1(\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t${includes},\n\t\t\t\t);`);
      } else {
        next += `\n\t\t\t\t${key} = (\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t${includes},\n\t\t\t\t);`;
      }
    }
    return `${start}${next}${end}`;
  });


  if (text !== before) {
    fs.writeFileSync(pbx, text);
    console.log("[native-config] libpjsip.xcframework lié à la cible App (+ chemins de module pjsua).");
    return true;
  }
  return false;
}

function ensurePluginRegistration(swift) {
  let next = swift;
  const sipLine = "        bridge?.registerPluginInstance(PpSipKeepAlive())\n";
  const voipLine = "        bridge?.registerPluginInstance(PpVoipCall())\n";
  const authLine = "        bridge?.registerPluginInstance(PpAuthSession())\n";
  const pjsipLine = "        bridge?.registerPluginInstance(PpPjsip())\n";
  const needsSip = !next.includes("PpSipKeepAlive()");
  const needsVoip = !next.includes("PpVoipCall()");
  const needsAuth = !next.includes("PpAuthSession()");
  const needsPjsip = PP_HAS_PJSIP && !next.includes("PpPjsip()");
  if (!needsSip && !needsVoip && !needsAuth && !needsPjsip) return next;
  const lines = `${needsSip ? sipLine : ""}${needsVoip ? voipLine : ""}${needsAuth ? authLine : ""}${needsPjsip ? pjsipLine : ""}`;
  if (next.includes("registerPluginInstance")) {
    return next.replace(/(bridge\?\.registerPluginInstance\([^\n]+\)\n)/, `$1${lines}`);
  }
  if (next.includes("override func capacitorDidLoad()")) {
    return next.replace(/(override func capacitorDidLoad\(\)\s*\{\n)/, `$1${lines}`);
  }
  if (next.includes("CAPBridgeViewController")) {
    const insert = `\n    override func capacitorDidLoad() {\n${lines}    }\n`;
    const lastBrace = next.lastIndexOf("}");
    if (lastBrace > -1) return `${next.slice(0, lastBrace)}${insert}${next.slice(lastBrace)}`;
  }
  return next;
}

function ensurePluginRegistrationOrThrow(swift, file) {
  const next = ensurePluginRegistration(swift);
  if (!next.includes("PpSipKeepAlive()") || !next.includes("PpVoipCall()")) {
    throw new Error(`[native-config] iOS plugin registration failed in ${file}: PpSipKeepAlive/PpVoipCall missing`);
  }
  return next;
}

// Force portrait at the AppDelegate level (Info.plist alone is overridden by
// a .all Swift override in some Capacitor templates).
function patchIosAppDelegate(iosApp) {
  const file = path.join(iosApp, "AppDelegate.swift");
  if (!fs.existsSync(file)) return;
  let swift = fs.readFileSync(file, "utf8");
  const before = swift;
  if (/supportedInterfaceOrientationsFor/.test(swift)) {
    swift = swift.replace(
      /(func application\(\s*_ application: UIApplication,\s*supportedInterfaceOrientationsFor[^)]*\)\s*->\s*UIInterfaceOrientationMask\s*\{)[\s\S]*?\n\s*\}/,
      "$1\n        return .portrait\n    }",
    );
  } else {
    const insert = `\n    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {\n        return .portrait\n    }\n`;
    const lastBrace = swift.lastIndexOf("}");
    if (lastBrace > -1) swift = `${swift.slice(0, lastBrace)}${insert}${swift.slice(lastBrace)}`;
  }
  if (swift !== before) {
    writeIfChanged(file, swift);
    console.log("[native-config] iOS AppDelegate locked to portrait.");
  }
}

// The default Capacitor template ships no ViewController subclass, so the
// plugin-registration fallback had nothing to attach to and both native
// plugins reported UNIMPLEMENTED. Create a bridge controller and point the
// storyboard at it so registration always happens.
function ensureIosBridgeController(iosApp) {
  const storyboard = path.join(iosApp, "Base.lproj", "Main.storyboard");
  const existing = ["AppBridgeViewController.swift", "ViewController.swift"]
    .map((n) => path.join(iosApp, n))
    .filter((f) => fs.existsSync(f));

  // Always create/refresh AppBridgeViewController and always point the
  // storyboard to it. Some generated iOS projects already contain a plain
  // ViewController, so the old early-return skipped the storyboard patch and
  // Capacitor loaded CAPBridgeViewController directly → JS saw both native
  // plugins as UNIMPLEMENTED.
  if (existing.length && !existing.some((f) => path.basename(f) === "AppBridgeViewController.swift")) {
    console.log("[native-config] iOS existing ViewController found; adding AppBridgeViewController for plugin registration.");
  }

  const file = path.join(iosApp, "AppBridgeViewController.swift");
  const source = `import Foundation
import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PpSipKeepAlive())
        bridge?.registerPluginInstance(PpVoipCall())
        bridge?.registerPluginInstance(PpAuthSession())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}`;
  writeIfChanged(file, source);
  ensureXcodeSourceFiles(path.join(appDir, "ios", "App"), ["App/AppBridgeViewController.swift"]);

  // Point Main.storyboard at the subclass.
  if (fs.existsSync(storyboard)) {
    let xml = fs.readFileSync(storyboard, "utf8");
    if (!xml.includes('customClass="AppBridgeViewController"')) {
      xml = xml.replace(
        /customClass="CAPBridgeViewController"\s*customModule="Capacitor"(\s*customModuleProvider="target")?/,
        'customClass="AppBridgeViewController" customModule="App" customModuleProvider="target"',
      );
      xml = xml.replace(
        /customClass="ViewController"\s*customModule="App"(\s*customModuleProvider="target")?/,
        'customClass="AppBridgeViewController" customModule="App" customModuleProvider="target"',
      );
      writeIfChanged(storyboard, xml);
    }
  }
  console.log("[native-config] iOS AppBridgeViewController created and wired to Main.storyboard.");
  return Array.from(new Set([...existing, file]));
}

function ensureIosSceneDelegate(iosApp) {
  const file = path.join(iosApp, "SceneDelegate.swift");
  const source = `import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        let rootViewController = storyboard.instantiateInitialViewController() ?? AppBridgeViewController()
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = rootViewController
        self.window = window
        window.makeKeyAndVisible()
    }
}
`;
  writeIfChanged(file, source);
  ensureXcodeSourceFiles(path.join(appDir, "ios", "App"), ["App/SceneDelegate.swift"]);
  console.log("[native-config] iOS SceneDelegate applied.");
}

function patchIosInfoPlist() {
  const file = path.join(appDir, "ios", "App", "App", "Info.plist");
  if (!fs.existsSync(file)) {
    console.log("[native-config] iOS Info.plist not found — run npx cap add ios first.");
    return;
  }

  let xml = fs.readFileSync(file, "utf8");
  if (!(xml.includes("<string>planipret</string>") && xml.includes("<string>capacitor</string>"))) {
    if (xml.includes("<key>CFBundleURLTypes</key>")) {
      xml = xml.replace(/(<key>CFBundleURLTypes<\/key>\s*<array>)/, `$1${IOS_URL_TYPES_DICT}`);
    } else {
      xml = xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `${IOS_URL_TYPES}\n</dict>\n</plist>\n`);
    }
  }

  if (!xml.includes("<string>audio</string>") || !xml.includes("<string>voip</string>")) {
    const modes = `
\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>audio</string>
\t\t<string>voip</string>
\t\t<string>remote-notification</string>
\t\t<string>fetch</string>
\t</array>
`;
    xml = xml.includes("<key>UIBackgroundModes</key>")
      ? xml.replace(/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<\/array>/, modes.trim())
      : xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `${modes}\n</dict>\n</plist>\n`);
  }

  // App Review compliance keys: purpose strings + encryption export declaration.
  const REQUIRED_PLIST_STRINGS = [
    ["NSMicrophoneUsageDescription", "Planipret uses the microphone to place and receive VoIP business calls."],
    ["NSContactsUsageDescription", "Planipret accesses your contacts so you can call and message your clients."],
    ["NSCameraUsageDescription", "Planipret uses the camera so you can set a profile photo."],
    ["NSPhotoLibraryUsageDescription", "Planipret accesses your photo library so you can pick a profile photo."],
    ["NSLocalNetworkUsageDescription", "Planipret uses the local network to establish VoIP call audio."],
    ["NSSpeechRecognitionUsageDescription", "Planipret transcribes your recorded calls when you enable transcription."],
  ];
  for (const [key, value] of REQUIRED_PLIST_STRINGS) {
    if (!xml.includes(`<key>${key}</key>`)) {
      xml = xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `\n\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>\n`);
    }
  }
  // Portrait-only (matches the AppDelegate override below).
  const portraitArray = "\n\t<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>\n\t<key>UISupportedInterfaceOrientations~ipad</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>\n";
  xml = xml.replace(/\n\t?<key>UISupportedInterfaceOrientations(~ipad)?<\/key>\s*<array>[\s\S]*?<\/array>/g, "");
  xml = xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `${portraitArray}</dict>\n</plist>\n`);

  if (!xml.includes("<key>ITSAppUsesNonExemptEncryption</key>")) {
    xml = xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, "\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n</dict>\n</plist>\n");
  }

  const sceneManifest = `
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
		<false/>
		<key>UISceneConfigurations</key>
		<dict>
			<key>UIWindowSceneSessionRoleApplication</key>
			<array>
				<dict>
					<key>UISceneConfigurationName</key>
					<string>Default Configuration</string>
					<key>UISceneDelegateClassName</key>
					<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
					<key>UISceneStoryboardFile</key>
					<string>Main</string>
				</dict>
			</array>
		</dict>
	</dict>
`;
  xml = xml.replace(/\n\t?<key>UIApplicationSceneManifest<\/key>\s*<dict>[\s\S]*?\n\t<\/dict>/, "");
  xml = xml.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `${sceneManifest}\n</dict>\n</plist>\n`);

  writeIfChanged(file, xml);
  console.log("[native-config] iOS URL schemes + background modes applied.");
}

function patchIosEntitlements() {
  const file = path.join(appDir, "ios", "App", "App", "App.entitlements");
  if (!fs.existsSync(path.dirname(file))) {
    console.log("[native-config] iOS App.entitlements path not found — run npx cap add ios first.");
    return;
  }
  writeIfChanged(file, IOS_ENTITLEMENTS);
  console.log("[native-config] iOS PushKit VoIP entitlements applied.");
}

function patchAndroidManifest() {
  const file = path.join(appDir, "android", "app", "src", "main", "AndroidManifest.xml");
  if (!fs.existsSync(file)) {
    console.log("[native-config] AndroidManifest.xml not found — run npx cap add android first.");
    return;
  }

  let xml = fs.readFileSync(file, "utf8");
  for (const permission of ANDROID_PERMISSIONS) {
    if (!xml.includes(permission)) {
      xml = xml.replace(/<manifest([^>]*)>/, `<manifest$1>\n    <uses-permission android:name="${permission}" />`);
    }
  }

  const hasPlanipret = xml.includes('android:scheme="planipret"');
  const hasCapacitor = xml.includes('android:scheme="capacitor"') && xml.includes('android:host="localhost"');
  if (!(hasPlanipret && hasCapacitor)) {
    const mainActivityClose = /\n\s*<\/activity>/;
    if (!mainActivityClose.test(xml)) {
      console.warn("[native-config] Android MainActivity close tag not found; skipped deep links.");
    } else {
      xml = xml.replace(mainActivityClose, `${ANDROID_INTENT_FILTERS}\n        </activity>`);
    }
  }

  if (!xml.includes(".PpSipKeepAliveService")) {
    xml = xml.replace(/\n\s*<\/application>/, `${ANDROID_SERVICE}\n    </application>`);
  } else if (!xml.includes(".PpIncomingActionReceiver")) {
    xml = xml.replace(/\n\s*<\/application>/, `        <receiver\n            android:name=".PpIncomingActionReceiver"\n            android:exported="false" />\n    </application>`);
  }
  // Ensure MainActivity can be shown over the lockscreen for full-screen intents.
  if (!xml.includes('android:showWhenLocked')) {
    xml = xml.replace(/<activity([^>]*android:name="\.MainActivity"[^>]*)>/, `<activity$1\n            android:showWhenLocked="true"\n            android:turnScreenOn="true">`);
  }
  writeIfChanged(file, xml);
  console.log("[native-config] Android deep links + SIP keep-alive service applied.");
}

function patchAndroidNativeFiles() {
  const javaRoot = path.join(appDir, "android", "app", "src", "main", "java");
  if (!fs.existsSync(javaRoot)) {
    console.log("[native-config] Android source tree not found — run npx cap add android first.");
    return;
  }
  const mainActivity = findFile(javaRoot, "MainActivity.kt") || findFile(javaRoot, "MainActivity.java");
  const mainText = mainActivity && fs.existsSync(mainActivity) ? fs.readFileSync(mainActivity, "utf8") : "";
  const pkg = mainText.match(/^package\s+([\w.]+)/m)?.[1] || "com.planipret.mobile";
  const pkgDir = path.join(javaRoot, ...pkg.split("."));
  writeIfChanged(path.join(pkgDir, "PpSipKeepAlivePlugin.java"), ANDROID_PLUGIN_JAVA(pkg));
  writeIfChanged(path.join(pkgDir, "PpSipKeepAliveService.java"), ANDROID_SERVICE_JAVA(pkg));
  writeIfChanged(path.join(pkgDir, "PpIncomingActionReceiver.java"), ANDROID_RECEIVER_JAVA(pkg));
  for (const stale of ["PpSipKeepAlivePlugin.kt", "PpSipKeepAliveService.kt"]) {
    const staleFile = path.join(pkgDir, stale);
    if (fs.existsSync(staleFile)) fs.rmSync(staleFile);
  }
  const pluginAlreadyRegistered = mainText.includes("PpSipKeepAlivePlugin::class.java") || mainText.includes("PpSipKeepAlivePlugin.class");
  if (mainActivity && !pluginAlreadyRegistered) {
    let next = mainText;
    if (mainActivity.endsWith(".java")) {
      if (next.includes("registerPlugin(")) {
        next = next.replace(/(registerPlugin\([^\n]+\);\n)/, `$1        registerPlugin(PpSipKeepAlivePlugin.class);\n`);
      } else if (next.includes("super.onCreate(savedInstanceState);")) {
        next = next.replace("super.onCreate(savedInstanceState);", "registerPlugin(PpSipKeepAlivePlugin.class);\n        super.onCreate(savedInstanceState);");
      }
    } else if (next.includes("registerPlugin(")) {
      next = next.replace(/(registerPlugin\([^\n]+\)\n)/, `$1        registerPlugin(PpSipKeepAlivePlugin::class.java)\n`);
    } else if (next.includes("super.onCreate(savedInstanceState)")) {
      next = next.replace("super.onCreate(savedInstanceState)", "registerPlugin(PpSipKeepAlivePlugin::class.java)\n        super.onCreate(savedInstanceState)");
    }
    writeIfChanged(mainActivity, next);
  }
  console.log("[native-config] Android PpSipKeepAlive plugin applied.");
}

function patchIosNativeFiles() {
  const iosApp = path.join(appDir, "ios", "App", "App");
  if (!fs.existsSync(iosApp)) {
    console.log("[native-config] iOS source tree not found — run npx cap add ios first.");
    return;
  }
  writeIfChanged(path.join(iosApp, "Plugins", "PpSipKeepAlive", "PpSipKeepAlive.swift"), IOS_PLUGIN);
  writeIfChanged(path.join(iosApp, "Plugins", "PpSipKeepAlive", IOS_KEEPALIVE_BRIDGE_FILENAME), IOS_KEEPALIVE_BRIDGE);
  writeIfChanged(path.join(iosApp, "Plugins", "PpVoipCall", "PpVoipCall.swift"), IOS_VOIP_CALL_PLUGIN);
  writeIfChanged(path.join(iosApp, "Plugins", "PpVoipCall", "PpVoipCall.m"), IOS_VOIP_CALL_BRIDGE);
  writeIfChanged(path.join(iosApp, "Plugins", "PpAuthSession", "PpAuthSession.swift"), IOS_AUTH_SESSION_PLUGIN);
  writeIfChanged(path.join(iosApp, "Plugins", "PpAuthSession", "PpAuthSession.m"), IOS_AUTH_SESSION_BRIDGE);
  // PpPjsip: sources committed under Plugins/PpPjsip (not generated here).
  const pjsipDir = path.join(iosApp, "Plugins", "PpPjsip");
  const hasPjsip = fs.existsSync(path.join(pjsipDir, "PpPjsip.swift"));
  // Le bridge ObjC CAP_PLUGIN(PpPjsip) faisait double emploi avec
  // CAPBridgedPlugin + registerPluginInstance : Capacitor gardait la table de
  // méthodes ObjC (sans isEngineLinked) -> UNIMPLEMENTED et repli JsSIP.
  const stalePjsipBridge = path.join(pjsipDir, "PpPjsip.m");
  if (fs.existsSync(stalePjsipBridge)) {
    fs.rmSync(stalePjsipBridge);
    console.log("[native-config] removed stale PpPjsip.m (duplicate plugin registration).");
  }

  const iosRoot = path.join(appDir, "ios", "App");
  removeXcodeSourceFile(iosRoot, "App/Plugins/PpPjsip/PpPjsip.m");

  ensureXcodeSourceFiles(iosRoot, [
    "App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift",
    "App/Plugins/PpSipKeepAlive/PpSipKeepAlive.m",
    "App/Plugins/PpVoipCall/PpVoipCall.swift",
    "App/Plugins/PpVoipCall/PpVoipCall.m",
    "App/Plugins/PpAuthSession/PpAuthSession.swift",
    "App/Plugins/PpAuthSession/PpAuthSession.m",
    ...(hasPjsip
      ? [
          "App/Plugins/PpPjsip/PpPjsip.swift",

          ...(fs.existsSync(path.join(pjsipDir, "PpPjsipEngine.swift"))
            ? ["App/Plugins/PpPjsip/PpPjsipEngine.swift"]
            : []),
        ]
      : []),
  ]);
  if (!hasPjsip) {
    throw new Error("[native-config] sources PpPjsip absentes — build iOS refusé: aucun moteur média natif ne pourrait répondre aux appels entrants.");
  }
  ensurePjsipXcframework(iosRoot);
  patchIosAppDelegate(iosApp);
  ensureIosBridgeController(iosApp);
  ensureIosSceneDelegate(iosApp);
  for (const controllerName of ["AppBridgeViewController.swift", "ViewController.swift"]) {
    const file = path.join(iosApp, controllerName);
    if (!fs.existsSync(file)) continue;
    let swift = fs.readFileSync(file, "utf8");
    const before = swift;
    swift = stripInlinePlugins(swift);
    swift = ensurePluginRegistrationOrThrow(swift, file);
    if (swift !== before) writeIfChanged(file, swift);
  }

  const bridge = path.join(iosApp, "AppBridgeViewController.swift");
  const storyboard = path.join(iosApp, "Base.lproj", "Main.storyboard");
  const storyboardText = fs.existsSync(storyboard) ? fs.readFileSync(storyboard, "utf8") : "";
  const bridgeText = fs.existsSync(bridge) ? fs.readFileSync(bridge, "utf8") : "";
  if (!bridgeText.includes("PpSipKeepAlive()") || !bridgeText.includes("PpVoipCall()") || !bridgeText.includes("PpAuthSession()") || !storyboardText.includes('customClass="AppBridgeViewController"')) {
    throw new Error("[native-config] iOS native plugins are not wired into the launch ViewController; aborting sync so SIP/VoIP/OAuth cannot ship UNIMPLEMENTED.");
  }
  if (hasPjsip && !bridgeText.includes("PpPjsip()")) {
    throw new Error("[native-config] PpPjsip sources present but not registered in AppBridgeViewController.");
  }
  console.log(
    `[native-config] iOS PpSipKeepAlive + PpVoipCall + PpAuthSession${hasPjsip ? " + PpPjsip" : ""} plugins applied.`
  );
}

patchCopiedWebBundles();
patchIosInfoPlist();
patchIosEntitlements();
patchAndroidManifest();
patchAndroidNativeFiles();
patchIosNativeFiles();

// Guard: cap sync can regenerate native files — fail loudly if the UIScene /
// SceneDelegate patch did not land.
if (!verifyIosScene({ soft: process.env.PP_SCENE_CHECK_SOFT === "1" })) {
  throw new Error("[native-config] iOS UIScene/SceneDelegate patch missing after cap sync — aborting.");
}

// Avertissements non bloquants (binaire PJSIP absent → repli JsSIP actif).
if (pjsipWarnings.length) {
  console.warn("\n[native-config] " + pjsipWarnings.join("\n[native-config] ") + "\n");
}
