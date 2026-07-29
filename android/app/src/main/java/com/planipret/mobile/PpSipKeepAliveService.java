package com.planipret.mobile;

// Planipret-only background SIP keep-alive over WSS (NetSapiens).
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
  // instanceId STABLE: calcule une seule fois a la creation du service.
  // Un UUID aleatoire a chaque REGISTER ferait croire a NS qu'il s'agit d'un
  // nouvel appareil -> NS ferme le WS (code 1001) -> boucle infinie.
  private final String instanceId = UUID.randomUUID().toString().replace("-", "");
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
    Notification n = buildOngoingNotification("Telephonie prete en arriere-plan");
    if (Build.VERSION.SDK_INT >= 34) ServiceCompat.startForeground(this, NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
    else startForeground(NOTIFICATION_ID, n);
    emitStatus("connecting", "native_register_start");
    requestReregister(this, "service_start");
    executor.execute(this::connectAndRegister);
    if (heartbeat != null) heartbeat.cancel(false);
    // Heartbeat toutes les 120s (2 min) -- bien avant l'expiration du REGISTER (1800s)
    // Garantit que le SIP reste enregistre en permanence, meme en arriere-plan
    heartbeat = executor.scheduleAtFixedRate(() -> {
      try {
        if (wsSocket == null || wsSocket.isClosed() || !wsSocket.isConnected()) {
          emitStatus("reconnecting", "ws_closed_reconnecting");
          connectAndRegister();
        } else {
          sendRegister(null);
        }
      } catch (Exception e) { emitStatus("reconnecting", "register_retry"); connectAndRegister(); }
      requestReregister(this, "keepalive");
    }, 120, 120, TimeUnit.SECONDS);
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
    raw.setSoTimeout(65000);
    wsSocket = raw; wsIn = raw.getInputStream(); wsOut = raw.getOutputStream();
    String key = websocketKey();
    String wsPath = (path == null || path.length() == 0) ? "/" : path;
    String req = "GET " + wsPath + " HTTP/1.1\r\n"
      + "Host: " + host + ":" + port + "\r\n"
      + "Upgrade: websocket\r\n"
      + "Connection: Upgrade\r\n"
      + "Sec-WebSocket-Key: " + key + "\r\n"
      + "Sec-WebSocket-Version: 13\r\n"
      + "Sec-WebSocket-Protocol: sip\r\n"
      + "Origin: https://" + host + "\r\n"
      + "\r\n";
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
  } catch(Exception ignored) {} finally { readerRunning = false; emitStatus("reconnecting", "ws_reader_closed"); if (wsSocket != null && !wsSocket.isClosed()) executor.schedule(this::connectAndRegister, 5, TimeUnit.SECONDS); } }

  private void handleSipMessage(String msg) throws Exception {
    if (msg.startsWith("SIP/2.0 401") || msg.startsWith("SIP/2.0 407")) {
      sendRegister(msg); return;
    }
    if (msg.startsWith("SIP/2.0 200") && msg.toLowerCase(Locale.US).contains("cseq:") && msg.toUpperCase(Locale.US).contains(" REGISTER")) {
      emitStatus("registered", "native_register_200"); return;
    }
    if (msg.startsWith("INVITE ")) {
      emitStatus("registered", "incoming_invite");
      String fromHdr = header(msg, "From"); String toHdr = header(msg, "To");
      String viaHdr = header(msg, "Via"); String inviteCallId = header(msg, "Call-ID");
      String inviteCSeq = header(msg, "CSeq");
      String fromDisplay = parseDisplay(fromHdr); String fromUser = parseUser(fromHdr);
      try { sendRinging(viaHdr, fromHdr, toHdr, inviteCallId, inviteCSeq); } catch (Exception ignored) {}
      sendBroadcast(new Intent(ACTION_INCOMING_INVITE).setPackage(getPackageName())
        .putExtra("callId", inviteCallId).putExtra("from", fromHdr)
        .putExtra("fromUser", fromUser).putExtra("fromDisplay", fromDisplay));
      showIncomingCallNotification(inviteCallId, fromHdr, fromUser, fromDisplay);
      requestReregister(this, "incoming_invite");
    }
  }

  private void sendRinging(String via, String from, String to, String cid, String cseqHeader) throws Exception {
    if (via == null || from == null || to == null || cid == null || cseqHeader == null) return;
    String toWithTag = to.contains(";tag=") ? to : to + ";tag=" + Long.toHexString(System.nanoTime());
    String r = "SIP/2.0 180 Ringing\r\n"
      + "Via: " + via + "\r\n"
      + "From: " + from + "\r\n"
      + "To: " + toWithTag + "\r\n"
      + "Call-ID: " + cid + "\r\n"
      + "CSeq: " + cseqHeader + "\r\n"
      + "User-Agent: Planipret Native KeepAlive\r\n"
      + "Content-Length: 0\r\n"
      + "\r\n";
    sendFrame(r);
  }

  private void sendRegister(String challenge) throws Exception {
    SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String login = p.getString("login", ""), domain = p.getString("domain", "");
    String display = p.getString("display_name", login), password = p.getString("password", "");
    if (login == null || login.length() == 0 || domain == null || domain.length() == 0) { emitStatus("error", "missing_credentials"); return; }
    int seq = cseq++;
    String branch = "z9hG4bK" + UUID.randomUUID().toString().replace("-", "");
    String sipHost = p.getString("host", "core1.cluster1.ucstack.io");
    int sipPort = p.getInt("port", 443);
    // Contact STABLE avec instanceId fixe -- pas de .invalid aleatoire a chaque REGISTER.
    String contact = "<sip:" + login + "@" + instanceId + ".planipret-mobile.invalid;transport=wss>";
    // Sanitize display name
    String safeDisplay = (display == null || display.length() == 0) ? login : display.replace("\"", "");
    StringBuilder sip = new StringBuilder();
    sip.append("REGISTER sip:").append(domain).append(" SIP/2.0\r\n");
    sip.append("Via: SIP/2.0/WSS planipret-mobile.invalid;branch=").append(branch).append("\r\n");
    sip.append("Max-Forwards: 70\r\n");
    sip.append("To: <sip:").append(login).append("@").append(domain).append(">\r\n");
    sip.append("From: \"").append(safeDisplay).append("\" <sip:").append(login).append("@").append(domain).append(">;tag=").append(fromTag).append("\r\n");
    sip.append("Call-ID: ").append(callId).append("\r\n");
    sip.append("CSeq: ").append(seq).append(" REGISTER\r\n");
    sip.append("Contact: ").append(contact).append(";expires=1800\r\n");
    sip.append("Expires: 1800\r\n");
    sip.append("User-Agent: Planipret Native KeepAlive\r\n");
    sip.append("Supported: outbound,path,gruu\r\n");
    sip.append("Allow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\r\n");
    if (challenge != null && password != null && password.length() > 0) {
      // Route header (use_preloaded_route RFC 3327): NS route les INVITEs entrants via le WebSocket.
      sip.append("Route: <sip:").append(sipHost).append(":").append(sipPort).append(";transport=wss;lr>\r\n");
      // RFC 3261 S22.3: NS proxy -> 407 -> Proxy-Authorization requis (pas Authorization)
      boolean isProxy = challenge.toLowerCase(Locale.US).contains("proxy-authenticate:");
      String authHeader = isProxy ? "Proxy-Authorization" : "Authorization";
      sip.append(authHeader).append(": ").append(digestAuth(challenge, login, password, domain)).append("\r\n");
    }
    sip.append("Content-Length: 0\r\n");
    sip.append("\r\n");
    sendFrame(sip.toString());
    emitStatus("connecting", challenge == null ? "register_sent" : "register_auth_sent");
  }

  private String digestAuth(String challenge, String user, String pass, String domain) throws Exception {
    Map<String,String> m = parseDigest(challenge);
    String realm = m.containsKey("realm") ? m.get("realm") : domain;
    String nonce = m.get("nonce"), qop = m.get("qop"), opaque = m.get("opaque");
    String uri = "sip:" + domain, nc = "00000001", cnonce = Long.toHexString(System.nanoTime());
    String ha1 = md5(user + ":" + realm + ":" + pass), ha2 = md5("REGISTER:" + uri);
    String resp = qop != null && qop.contains("auth")
      ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2)
      : md5(ha1 + ":" + nonce + ":" + ha2);
    StringBuilder a = new StringBuilder("Digest username=\"").append(user)
      .append("\", realm=\"").append(realm)
      .append("\", nonce=\"").append(nonce)
      .append("\", uri=\"").append(uri)
      .append("\", response=\"").append(resp)
      .append("\", algorithm=MD5");
    if (qop != null && qop.contains("auth"))
      a.append(", qop=auth, nc=").append(nc).append(", cnonce=\"").append(cnonce).append("\"");
    if (opaque != null)
      a.append(", opaque=\"").append(opaque).append("\"");
    return a.toString();
  }

  private Map<String,String> parseDigest(String h) {
    Map<String,String> out = new HashMap<>();
    String s = h.replaceFirst("(?i)^(Proxy-Authenticate|WWW-Authenticate):\\s*Digest\\s+", "");
    for (String part : s.split(",")) {
      int i = part.indexOf('='); if (i <= 0) continue;
      String k = part.substring(0, i).trim();
      String v = part.substring(i + 1).trim();
      if (v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
      out.put(k, v);
    }
    return out;
  }

  private String header(String msg, String name) {
    for (String line : msg.split("\r?\n"))
      if (line.toLowerCase(Locale.US).startsWith(name.toLowerCase(Locale.US) + ":"))
        return line.substring(name.length() + 1).trim();
    return null;
  }

  private String parseDisplay(String header) {
    if (header == null) return null;
    int lt = header.indexOf('<');
    if (lt > 0) {
      String d = header.substring(0, lt).trim();
      if (d.startsWith("\"") && d.endsWith("\"")) d = d.substring(1, d.length() - 1);
      return d.length() == 0 ? null : d;
    }
    return null;
  }

  private String parseUser(String header) {
    if (header == null) return null;
    int lt = header.indexOf('<');
    String uri = lt >= 0 ? header.substring(lt + 1, Math.max(lt + 1, header.indexOf('>', lt))) : header;
    if (uri.startsWith("sip:")) uri = uri.substring(4);
    else if (uri.startsWith("sips:")) uri = uri.substring(5);
    int at = uri.indexOf('@'); if (at > 0) uri = uri.substring(0, at);
    int semi = uri.indexOf(';'); if (semi > 0) uri = uri.substring(0, semi);
    return uri;
  }

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
        .addAction(new NotificationCompat.Action(android.R.drawable.sym_action_call, "Repondre", answerPi))
        .addAction(new NotificationCompat.Action(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", declinePi));
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (nm != null) nm.notify(INCOMING_NOTIFICATION_ID, b.build());
    } catch (Exception ignored) {}
  }

  private void emitStatus(String status, String reason) { long now = System.currentTimeMillis(); boolean wake = wakeLock != null && wakeLock.isHeld(), wifi = wifiLock != null && wifiLock.isHeld(), logged = status.equals("registered") || status.equals("protected"); getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_STATUS, status).putString(KEY_REASON, reason).putLong(KEY_UPDATED_AT, now).putBoolean(KEY_WAKE_HELD, wake).putBoolean(KEY_WIFI_HELD, wifi).putBoolean(KEY_LOGGED_IN, logged).apply(); sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("status", status).putExtra("reason", reason).putExtra("updatedAt", now).putExtra("wakeLockHeld", wake).putExtra("wifiLockHeld", wifi).putExtra("loggedIn", logged)); }
  private Notification buildOngoingNotification(String text) { return new NotificationCompat.Builder(this, CHANNEL_ID).setContentTitle("Planipret Mobile").setContentText(text).setSmallIcon(android.R.drawable.ic_menu_call).setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).setSilent(true).build(); }
  private void createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(NotificationManager.class);
    if (nm == null) return;
    nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Connexion telephonique", NotificationManager.IMPORTANCE_LOW));
    NotificationChannel incoming = new NotificationChannel(CHANNEL_INCOMING_ID, "Appels entrants", NotificationManager.IMPORTANCE_HIGH);
    incoming.setDescription("Notifications d'appel entrant Planipret");
    incoming.enableVibration(true);
    incoming.enableLights(true);
    AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    incoming.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), attrs);
    incoming.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(incoming);
  }
}
