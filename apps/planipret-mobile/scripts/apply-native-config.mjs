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
            android:foregroundServiceType="phoneCall"
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
    PpSipKeepAliveService.start(getContext());
    call.resolve(readStatus().put("ok", true));
  }
  @PluginMethod public void stopSipService(PluginCall call) { PpSipKeepAliveService.stop(getContext()); call.resolve(new JSObject().put("ok", true)); }
  @PluginMethod public void getSipServiceStatus(PluginCall call) { call.resolve(readStatus().put("ok", true)); }
  @PluginMethod public void triggerReregister(PluginCall call) { PpSipKeepAliveService.requestReregister(getContext(), "manual"); call.resolve(readStatus().put("ok", true)); }
  @PluginMethod public void acknowledgeIncoming(PluginCall call) { PpSipKeepAliveService.clearIncomingNotification(getContext()); call.resolve(new JSObject().put("ok", true)); }
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

  public static void start(Context c) { Intent i = new Intent(c, PpSipKeepAliveService.class); if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i); else c.startService(i); }
  public static void stop(Context c) { c.stopService(new Intent(c, PpSipKeepAliveService.class)); }
  public static void saveConfig(Context c, String host, int port, String path, String login, String domain, String displayName, String password) { c.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString("host", host).putInt("port", port).putString("path", path).putString("login", login).putString("domain", domain).putString("display_name", displayName).putString("password", password).apply(); }
  public static void requestReregister(Context c, String reason) { c.sendBroadcast(new Intent(ACTION_REREGISTER).setPackage(c.getPackageName()).putExtra("reason", reason)); }
  public static void clearIncomingNotification(Context c) { try { NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(INCOMING_NOTIFICATION_ID); } catch(Exception ignored) {} }

  @Override public void onCreate() {
    super.onCreate();
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
    if (Build.VERSION.SDK_INT >= 34) ServiceCompat.startForeground(this, NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
    else startForeground(NOTIFICATION_ID, n);
    emitStatus("connecting", "native_register_start");
    requestReregister(this, "service_start");
    executor.execute(this::connectAndRegister);
    if (heartbeat != null) heartbeat.cancel(false);
    heartbeat = executor.scheduleAtFixedRate(() -> {
      try { sendRegister(null); } catch (Exception e) { emitStatus("reconnecting", "register_retry"); connectAndRegister(); }
      requestReregister(this, "keepalive");
    }, 60, 60, TimeUnit.SECONDS);
    return START_STICKY;
  }

  @Override public void onTaskRemoved(Intent rootIntent) { emitStatus("registered", "task_removed_keepalive"); requestReregister(this, "task_removed"); super.onTaskRemoved(rootIntent); }
  @Override public void onDestroy() { if (heartbeat != null) heartbeat.cancel(true); unregisterNetworkWatchdog(); closeWs(); try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {} try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) {} executor.shutdownNow(); emitStatus("disconnected", "service_destroyed"); super.onDestroy(); }
  @Override public IBinder onBind(Intent intent) { return null; }

  private void registerNetworkWatchdog() { try { cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE); NetworkRequest req = new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(); networkCallback = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { emitStatus("registered", "network_available"); requestReregister(PpSipKeepAliveService.this, "network_available"); } @Override public void onLost(Network n) { emitStatus("reconnecting", "network_lost"); } }; cm.registerNetworkCallback(req, networkCallback); } catch(Exception ignored) {} }
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
    String req = "GET " + (path == null || path.length() == 0 ? "/" : path) + " HTTP/1.1\r\nHost: " + host + ":" + port + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: sip\r\nOrigin: https://" + host + "\r\n\r\n";
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
  } catch(Exception ignored) {} finally { readerRunning = false; emitStatus("reconnecting", "ws_reader_closed"); closeWs(); executor.schedule(this::connectAndRegister, 2, TimeUnit.SECONDS); } }

  private void handleSipMessage(String msg) throws Exception {
    if (msg.startsWith("SIP/2.0 401") || msg.startsWith("SIP/2.0 407")) {
      String challenge = header(msg, msg.startsWith("SIP/2.0 407") ? "Proxy-Authenticate" : "WWW-Authenticate");
      sendRegister(challenge); return;
    }
    if (msg.startsWith("SIP/2.0 200") && msg.toLowerCase(Locale.US).contains("cseq:") && msg.toUpperCase(Locale.US).contains(" REGISTER")) {
      emitStatus("registered", "native_register_200"); return;
    }
    if (msg.startsWith("INVITE ")) {
      emitStatus("registered", "incoming_invite");
      // Parse caller identity + Call-ID + Via/From/To for a 180 Ringing reply.
      String fromHdr = header(msg, "From"); String toHdr = header(msg, "To");
      String viaHdr = header(msg, "Via"); String inviteCallId = header(msg, "Call-ID");
      String inviteCSeq = header(msg, "CSeq");
      String fromDisplay = parseDisplay(fromHdr); String fromUser = parseUser(fromHdr);
      // Send 180 Ringing so the PBX keeps the INVITE alive while the app wakes.
      try { sendRinging(viaHdr, fromHdr, toHdr, inviteCallId, inviteCSeq); } catch (Exception ignored) {}
      // Broadcast to the JS plugin.
      sendBroadcast(new Intent(ACTION_INCOMING_INVITE).setPackage(getPackageName())
        .putExtra("callId", inviteCallId).putExtra("from", fromHdr)
        .putExtra("fromUser", fromUser).putExtra("fromDisplay", fromDisplay));
      // Fire the full-screen "ringing" notification with Answer / Decline actions.
      showIncomingCallNotification(inviteCallId, fromHdr, fromUser, fromDisplay);
      requestReregister(this, "incoming_invite");
    }
  }

  private void sendRinging(String via, String from, String to, String cid, String cseqHeader) throws Exception {
    if (via == null || from == null || to == null || cid == null || cseqHeader == null) return;
    // Add a to-tag if none, so upstream proxies don't reject.
    String toWithTag = to.contains(";tag=") ? to : to + ";tag=" + Long.toHexString(System.nanoTime());
    StringBuilder r = new StringBuilder();
    r.append("SIP/2.0 180 Ringing\r\n")
     .append("Via: ").append(via).append("\r\n")
     .append("From: ").append(from).append("\r\n")
     .append("To: ").append(toWithTag).append("\r\n")
     .append("Call-ID: ").append(cid).append("\r\n")
     .append("CSeq: ").append(cseqHeader).append("\r\n")
     .append("User-Agent: Planipret Native KeepAlive\r\n")
     .append("Content-Length: 0\r\n\r\n");
    sendFrame(r.toString());
  }

  private void sendRegister(String challenge) throws Exception {
    SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String login = p.getString("login", ""), domain = p.getString("domain", ""), display = p.getString("display_name", login), password = p.getString("password", "");
    if (login == null || login.length() == 0 || domain == null || domain.length() == 0) { emitStatus("error", "missing_credentials"); return; }
    int seq = cseq++;
    String branch = "z9hG4bK" + UUID.randomUUID().toString().replace("-", "");
    String contact = "<sip:" + login + "@" + UUID.randomUUID().toString().replace("-", "") + ".invalid;transport=wss>";
    StringBuilder sip = new StringBuilder();
    sip.append("REGISTER sip:").append(domain).append(" SIP/2.0\r\n");
    sip.append("Via: SIP/2.0/WSS planipret-mobile.invalid;branch=").append(branch).append("\r\n");
    sip.append("Max-Forwards: 70\r\n");
    sip.append("To: <sip:").append(login).append("@").append(domain).append(">\r\n");
    sip.append("From: \"").append(display == null ? login : display.replace("\"", "")).append("\" <sip:").append(login).append("@").append(domain).append(">;tag=").append(fromTag).append("\r\n");
    sip.append("Call-ID: ").append(callId).append("\r\n");
    sip.append("CSeq: ").append(seq).append(" REGISTER\r\n");
    sip.append("Contact: ").append(contact).append(";expires=1800\r\nExpires: 1800\r\nUser-Agent: Planipret Native KeepAlive\r\nSupported: outbound,path,gruu\r\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\r\n");
    if (challenge != null && password != null && password.length() > 0) sip.append("Authorization: ").append(digestAuth(challenge, login, password, domain)).append("\r\n");
    sip.append("Content-Length: 0\r\n\r\n");
    sendFrame(sip.toString());
    emitStatus("connecting", challenge == null ? "register_sent" : "register_auth_sent");
  }

  private String digestAuth(String challenge, String user, String pass, String domain) throws Exception { Map<String,String> m = parseDigest(challenge); String realm = m.containsKey("realm") ? m.get("realm") : domain, nonce = m.get("nonce"), qop = m.get("qop"), opaque = m.get("opaque"), uri = "sip:" + domain, nc = "00000001", cnonce = Long.toHexString(System.nanoTime()); String ha1 = md5(user + ":" + realm + ":" + pass), ha2 = md5("REGISTER:" + uri); String resp = qop != null && qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); StringBuilder a = new StringBuilder("Digest username=\"").append(user).append("\", realm=\"").append(realm).append("\", nonce=\"").append(nonce).append("\", uri=\"").append(uri).append("\", response=\"").append(resp).append("\", algorithm=MD5"); if (qop != null && qop.contains("auth")) a.append(", qop=auth, nc=").append(nc).append(", cnonce=\"").append(cnonce).append("\""); if (opaque != null) a.append(", opaque=\"").append(opaque).append("\""); return a.toString(); }
  private Map<String,String> parseDigest(String h) { Map<String,String> out = new HashMap<>(); String s = h.replaceFirst("(?i)^Digest\\\\s+", ""); for (String part : s.split(",")) { int i = part.indexOf('='); if (i <= 0) continue; String k = part.substring(0, i).trim(); String v = part.substring(i + 1).trim(); if (v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1); out.put(k, v); } return out; }
  private String header(String msg, String name) { for (String line : msg.split("\\r?\\n")) if (line.toLowerCase(Locale.US).startsWith(name.toLowerCase(Locale.US) + ":")) return line.substring(name.length() + 1).trim(); return null; }
  private String parseDisplay(String header) { if (header == null) return null; int lt = header.indexOf('<'); if (lt > 0) { String d = header.substring(0, lt).trim(); if (d.startsWith("\"") && d.endsWith("\"")) d = d.substring(1, d.length() - 1); return d.length() == 0 ? null : d; } return null; }
  private String parseUser(String header) { if (header == null) return null; int lt = header.indexOf('<'); String uri = lt >= 0 ? header.substring(lt + 1, Math.max(lt + 1, header.indexOf('>', lt))) : header; if (uri.startsWith("sip:")) uri = uri.substring(4); else if (uri.startsWith("sips:")) uri = uri.substring(5); int at = uri.indexOf('@'); if (at > 0) uri = uri.substring(0, at); int semi = uri.indexOf(';'); if (semi > 0) uri = uri.substring(0, semi); return uri; }
  private String md5(String s) throws Exception { MessageDigest md = MessageDigest.getInstance("MD5"); byte[] b = md.digest(s.getBytes(StandardCharsets.UTF_8)); StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format(Locale.US, "%02x", x & 0xff)); return sb.toString(); }
  private String websocketKey() { byte[] b = new byte[16]; new SecureRandom().nextBytes(b); return Base64.encodeToString(b, Base64.NO_WRAP); }
  private String readHttpHeaders() throws IOException { ByteArrayOutputStream b = new ByteArrayOutputStream(); int prev3 = -1, prev2 = -1, prev1 = -1, cur; while ((cur = wsIn.read()) != -1) { b.write(cur); if (prev3 == '\r' && prev2 == '\n' && prev1 == '\r' && cur == '\n') break; prev3 = prev2; prev2 = prev1; prev1 = cur; } return b.toString("UTF-8"); }
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

  private void emitStatus(String status, String reason) { long now = System.currentTimeMillis(); boolean wake = wakeLock != null && wakeLock.isHeld(), wifi = wifiLock != null && wifiLock.isHeld(), logged = status.equals("registered") || status.equals("protected"); getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_STATUS, status).putString(KEY_REASON, reason).putLong(KEY_UPDATED_AT, now).putBoolean(KEY_WAKE_HELD, wake).putBoolean(KEY_WIFI_HELD, wifi).putBoolean(KEY_LOGGED_IN, logged).apply(); sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("status", status).putExtra("reason", reason).putExtra("updatedAt", now).putExtra("wakeLockHeld", wake).putExtra("wifiLockHeld", wifi).putExtra("loggedIn", logged)); }
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
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]
    private var status = "idle"; private var reason = "plugin_loaded"; private var updatedAt = Date().timeIntervalSince1970 * 1000
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var host = ""; private var port = 443; private var path = "/"; private var login = ""; private var domain = ""; private var displayName = ""; private var password = ""
    private var socket: URLSessionWebSocketTask?
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    private var timer: Timer?
    private var cseq = 1
    private let callIdReg = UUID().uuidString + "@planipret-ios"
    private let fromTag = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)

    public override func load() {
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
      // Ask for notification permission so the incoming-call banner can ring.
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil) }

    @objc func startSipService(_ call: CAPPluginCall) {
      host = call.getString("host") ?? call.getString("domain") ?? ""; port = call.getInt("port") ?? 443; path = call.getString("path") ?? "/"
      login = call.getString("login") ?? call.getString("username") ?? call.getString("extension") ?? ""
      domain = call.getString("domain") ?? ""; displayName = call.getString("displayName") ?? login; password = call.getString("password") ?? ""
      activateAudioSession()
      // Only ONE SIP registration per AOR: while the app is in the foreground the
      // JsSIP web layer owns the registration. Registering natively at the same
      // time made NetSapiens close the JsSIP socket (1001), producing an endless
      // disconnect/reconnect loop. Store the credentials and stay idle instead.
      if isForeground() { releaseRegistration("foreground_js_owns") } else { connect(); scheduleRegister() }
      call.resolve(snapshot(ok: true))
    }
    @objc func stopSipService(_ call: CAPPluginCall) { releaseRegistration("stopped"); call.resolve(snapshot(ok: true)) }
    @objc func getSipServiceStatus(_ call: CAPPluginCall) { call.resolve(snapshot(ok: true)) }
    @objc func triggerReregister(_ call: CAPPluginCall) {
      if isForeground() { releaseRegistration("foreground_js_owns") } else { sendRegister(challenge: nil); notifyListeners("sipReregisterRequested", data: ["reason": "manual"]) }
      call.resolve(snapshot(ok: true))
    }
    @objc func acknowledgeIncoming(_ call: CAPPluginCall) {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["pp_incoming_call"])
      call.resolve(["ok": true])
    }

    private func isForeground() -> Bool { UIApplication.shared.applicationState == .active }
    private func releaseRegistration(_ why: String) {
      timer?.invalidate(); timer = nil
      socket?.cancel(with: .goingAway, reason: nil); socket = nil
      endBackgroundTask(); setStatus("idle", why)
    }

    @objc private func onBackground() { beginBackgroundTask(); activateAudioSession(); connect(); scheduleRegister(); sendRegister(challenge: nil); setStatus("protected", "background_register_sent") }
    @objc private func onForeground() {
      // Hand the AOR back to JsSIP and ask the web layer to re-REGISTER.
      releaseRegistration("foreground_js_owns")
      notifyListeners("sipReregisterRequested", data: ["reason": "enter_foreground"])
    }

    private func activateAudioSession() { try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]); try? AVAudioSession.sharedInstance().setActive(true) }
    private func connect() {
      guard !host.isEmpty else { setStatus("error", "missing_host"); return }
      if isForeground() { return }
      if socket != nil { return }
      var comps = URLComponents(); comps.scheme = port == 80 ? "ws" : "wss"; comps.host = host; comps.port = port; comps.path = path.isEmpty ? "/" : path
      guard let url = comps.url else { setStatus("error", "bad_ws_url"); return }
      var req = URLRequest(url: url); req.setValue("sip", forHTTPHeaderField: "Sec-WebSocket-Protocol")
      socket = session.webSocketTask(with: req); socket?.resume(); setStatus("connecting", "ws_connecting"); receiveLoop()
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.sendRegister(challenge: nil) }
    }
    private func scheduleRegister() { timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.sendRegister(challenge: nil) }; RunLoop.main.add(timer!, forMode: .common) }
    private func receiveLoop() { socket?.receive { [weak self] result in guard let self = self else { return }; switch result { case .success(let message): if case .string(let text) = message { self.handle(text) }; self.receiveLoop(); case .failure: self.socket = nil; if self.isForeground() { self.setStatus("idle", "foreground_js_owns") } else { self.setStatus("reconnecting", "ws_closed"); DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.connect() } } } } }

    private func handle(_ msg: String) {
      if msg.hasPrefix("SIP/2.0 401") || msg.hasPrefix("SIP/2.0 407") { sendRegister(challenge: headerVal(msg, msg.hasPrefix("SIP/2.0 407") ? "Proxy-Authenticate" : "WWW-Authenticate")); return }
      if msg.hasPrefix("SIP/2.0 200") && msg.uppercased().contains(" REGISTER") { setStatus("registered", "native_register_200"); return }
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
        notifyListeners("sipReregisterRequested", data: ["reason": "incoming_invite"])
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

    private func sendRegister(challenge: String?) {
      if isForeground() { releaseRegistration("foreground_js_owns"); return }
      if socket == nil { connect(); return }
      guard !login.isEmpty, !domain.isEmpty else { setStatus("error", "missing_credentials"); return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      let contact = "<sip:" + login + "@" + UUID().uuidString.replacingOccurrences(of: "-", with: "") + ".invalid;transport=wss>"
      var sip = "REGISTER sip:" + domain + " SIP/2.0\\r\\n"
      sip += "Via: SIP/2.0/WSS planipret-ios.invalid;branch=" + branch + "\\r\\nMax-Forwards: 70\\r\\n"
      sip += "To: <sip:" + login + "@" + domain + ">\\r\\nFrom: \\"" + displayName.replacingOccurrences(of: "\\"", with: "") + "\\" <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\\r\\n"
      sip += "Call-ID: " + callIdReg + "\\r\\nCSeq: " + String(seq) + " REGISTER\\r\\nContact: " + contact + ";expires=1800\\r\\nExpires: 1800\\r\\nUser-Agent: Planipret iOS KeepAlive\\r\\nSupported: outbound,path,gruu\\r\\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\\r\\n"
      if let ch = challenge, !password.isEmpty { sip += "Authorization: " + digest(challenge: ch) + "\\r\\n" }
      sip += "Content-Length: 0\\r\\n\\r\\n"
      socket?.send(.string(sip)) { [weak self] err in DispatchQueue.main.async { self?.setStatus(err == nil ? "connecting" : "error", err == nil ? (challenge == nil ? "register_sent" : "register_auth_sent") : "register_send_failed") } }
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
    private func snapshot(ok: Bool) -> [String: Any] { ["ok": ok, "status": status, "reason": reason, "updatedAt": updatedAt, "backgroundTaskActive": bgTask != .invalid, "loggedIn": status == "registered" || status == "protected"] }
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
      CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    private var pushRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private var callController = CXCallController()
    private var voipToken: String?
    private var activeCallUUID: UUID?
    private var activeCallId: String?

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
            self.setupCallKit()
            self.setupPushKit()
            self.notifyListeners("callKitReady", data: ["ok": true])
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
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.pushRegistry = registry
    }

    // MARK: - JS ↔ Native
    @objc func getVoipPushToken(_ call: CAPPluginCall) {
        call.resolve([
            "token": voipToken ?? "",
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment()
        ])
    }

    @objc func reportCallEnded(_ call: CAPPluginCall) {
        if let uuid = activeCallUUID {
            let end = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: end)) { _ in }
            activeCallUUID = nil
            activeCallId = nil
        }
        call.resolve(["ok": true])
    }

    // MARK: - PKPushRegistryDelegate
    public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = credentials.token.map { String(format: "%02x", $0) }.joined()
        self.voipToken = token
        notifyListeners("voipPushToken", data: [
            "token": token,
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment()
        ])
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        self.voipToken = nil
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let dict = payload.dictionaryPayload
        let callId = (dict["callId"] as? String) ?? (dict["call_id"] as? String) ?? UUID().uuidString
        let callerName = (dict["callerName"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from"] as? String) ?? "Appel entrant"
        let callerNumber = (dict["callerNumber"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from_user"] as? String) ?? ""

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
            ])
            completion()
        }
    }

    // MARK: - CXProviderDelegate
    public func providerDidReset(_ provider: CXProvider) {
        activeCallUUID = nil; activeCallId = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        try? AVAudioSession.sharedInstance().setActive(true)
        notifyListeners("incomingCallAnswered", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        notifyListeners("incomingCallRejected", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ])
        activeCallUUID = nil; activeCallId = nil
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        try? audioSession.setActive(true)
    }
}
`;

const IOS_VOIP_CALL_BRIDGE = `#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PpVoipCall, "PpVoipCall",
  CAP_PLUGIN_METHOD(getVoipPushToken, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(reportCallEnded, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(addListener, CAPPluginReturnCallback);
  CAP_PLUGIN_METHOD(removeAllListeners, CAPPluginReturnPromise);
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

function ensurePluginRegistration(swift) {
  let next = swift;
  const sipLine = "        bridge?.registerPluginInstance(PpSipKeepAlive())\n";
  const voipLine = "        bridge?.registerPluginInstance(PpVoipCall())\n";
  const needsSip = !next.includes("PpSipKeepAlive()");
  const needsVoip = !next.includes("PpVoipCall()");
  if (!needsSip && !needsVoip) return next;
  const lines = `${needsSip ? sipLine : ""}${needsVoip ? voipLine : ""}`;
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
// a `.all` Swift override in some Capacitor templates).
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
function ensureIosBridgeController(iosApp, pluginFilesAreInProject) {
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
  const inline = pluginFilesAreInProject
    ? ""
    : `\n\n// MARK: - Inline Planiprêt native plugins\n${stripSwiftImports(IOS_PLUGIN)}\n\n${stripSwiftImports(IOS_VOIP_CALL_PLUGIN)}\n`;
  const source = `import Foundation
import UIKit
import Capacitor
import AVFoundation
import CryptoKit
import UserNotifications
import PushKit
import CallKit

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PpSipKeepAlive())
        bridge?.registerPluginInstance(PpVoipCall())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}${inline}`;
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

  writeIfChanged(file, xml);
  console.log("[native-config] iOS URL schemes + background modes applied.");
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
  const iosRoot = path.join(appDir, "ios", "App");
  ensureXcodeSourceFiles(iosRoot, [
    "App/Plugins/PpSipKeepAlive/PpSipKeepAlive.swift",
    "App/Plugins/PpSipKeepAlive/PpSipKeepAlive.m",
    "App/Plugins/PpVoipCall/PpVoipCall.swift",
    "App/Plugins/PpVoipCall/PpVoipCall.m",
  ]);
  const pluginFilesAreInProject = hasProjectReference(iosRoot, "PpSipKeepAlive.swift") && hasProjectReference(iosRoot, "PpVoipCall.swift");
  patchIosAppDelegate(iosApp);
  ensureIosBridgeController(iosApp, pluginFilesAreInProject);
  for (const controllerName of ["AppBridgeViewController.swift", "ViewController.swift"]) {
    const file = path.join(iosApp, controllerName);
    if (!fs.existsSync(file)) continue;
    let swift = fs.readFileSync(file, "utf8");
    const before = swift;
    swift = ensurePluginRegistrationOrThrow(swift, file);
    if (!pluginFilesAreInProject && !swift.includes("@objc(PpSipKeepAlive)")) {
      swift = ensureSwiftImports(swift, ["Foundation", "Capacitor", "UIKit", "AVFoundation", "CryptoKit", "UserNotifications", "PushKit", "CallKit"]);
      swift = `${swift.trim()}\n\n// MARK: - Inline Planiprêt native plugins\n${stripSwiftImports(IOS_PLUGIN)}\n\n${stripSwiftImports(IOS_VOIP_CALL_PLUGIN)}\n`;
      console.log("[native-config] iOS native plugins embedded into existing ViewController target.");
    }
    if (swift !== before) writeIfChanged(file, swift);
  }
  const bridge = path.join(iosApp, "AppBridgeViewController.swift");
  const storyboard = path.join(iosApp, "Base.lproj", "Main.storyboard");
  const storyboardText = fs.existsSync(storyboard) ? fs.readFileSync(storyboard, "utf8") : "";
  const bridgeText = fs.existsSync(bridge) ? fs.readFileSync(bridge, "utf8") : "";
  if (!bridgeText.includes("PpSipKeepAlive()") || !bridgeText.includes("PpVoipCall()") || !storyboardText.includes('customClass="AppBridgeViewController"')) {
    throw new Error("[native-config] iOS native plugins are not wired into the launch ViewController; aborting sync so SIP/VoIP cannot ship UNIMPLEMENTED.");
  }
  console.log("[native-config] iOS PpSipKeepAlive + PpVoipCall plugins applied.");
}

patchCopiedWebBundles();
patchIosInfoPlist();
patchAndroidManifest();
patchAndroidNativeFiles();
patchIosNativeFiles();
