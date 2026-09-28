package com.planipret.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Android wake-only bridge.
 *
 * JsSIP in the foreground WebView is the one and only <ext>W/WSS user agent
 * that owns SDP, WebRTC and RTP. This service deliberately contains no SIP
 * socket, REGISTER, INVITE or response logic: a second background UA cannot
 * take over an existing dialog and would produce a false "Answer" action.
 */
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
  private final Handler handler = new Handler(Looper.getMainLooper());
  private Runnable stopRunnable;

  public static void start(Context context) {
    Intent intent = new Intent(context, PpSipKeepAliveService.class).setAction("com.planipret.mobile.PP_SIP_WAKE_ONLY");
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent); else context.startService(intent);
  }
  public static void stop(Context context) { context.stopService(new Intent(context, PpSipKeepAliveService.class)); }
  public static void declineIncoming(Context context, String callId) {
    Intent intent = new Intent(context, PpSipKeepAliveService.class).setAction(ACTION_DECLINE_CALL).putExtra("callId", callId);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent); else context.startService(intent);
  }
  /** Credentials are intentionally not persisted by a wake-only service. */
  public static void saveConfig(Context context, String host, int port, String path, String login, String domain, String displayName, String password) {
    context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString("mode", "wake_only").apply();
  }
  public static void saveStrategy(Context context, int backoffMinMs, int backoffMaxMs, int backoffMaxAttempts, int verifyDelayMs, int heartbeatSec, int registerExpiresSec) { }
  public static void requestReregister(Context context, String reason) {
    Intent intent = new Intent(context, PpSipKeepAliveService.class).setAction(ACTION_REREGISTER).putExtra("reason", reason);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent); else context.startService(intent);
  }
  public static void clearIncomingNotification(Context context) {
    try {
      NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.cancel(INCOMING_NOTIFICATION_ID);
    } catch (Exception ignored) { }
  }

  @Override public void onCreate() {
    super.onCreate();
    createChannels();
    emitStatus("protected", "wake_only_service_created");
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notification = buildOngoingNotification("Ouverture de l’application pour la téléphonie");
    if (Build.VERSION.SDK_INT >= 34) {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
    String action = intent == null ? "" : intent.getAction();
    if (ACTION_REREGISTER.equals(action)) {
      sendBroadcast(new Intent(ACTION_REREGISTER).setPackage(getPackageName())
        .putExtra("reason", intent.getStringExtra("reason")));
    }
    if (ACTION_DECLINE_CALL.equals(action)) {
      sendBroadcast(new Intent(ACTION_INCOMING_INVITE).setPackage(getPackageName())
        .putExtra("callId", intent.getStringExtra("callId"))
        .putExtra("userAction", "decline"));
    }
    emitStatus("protected", "wake_only_no_media_engine");
    if (stopRunnable != null) handler.removeCallbacks(stopRunnable);
    stopRunnable = () -> {
      stopForeground(STOP_FOREGROUND_REMOVE);
      stopSelf(startId);
    };
    handler.postDelayed(stopRunnable, 20_000L);
    return START_NOT_STICKY;
  }

  @Override public void onTaskRemoved(Intent rootIntent) {
    emitStatus("protected", "task_removed_wake_only");
    super.onTaskRemoved(rootIntent);
  }
  @Override public void onDestroy() {
    if (stopRunnable != null) handler.removeCallbacks(stopRunnable);
    emitStatus("disconnected", "service_destroyed");
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent) { return null; }

  private void emitStatus(String status, String reason) {
    long now = System.currentTimeMillis();
    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    prefs.edit()
      .putString(KEY_STATUS, status)
      .putString(KEY_REASON, reason)
      .putLong(KEY_UPDATED_AT, now)
      .putBoolean(KEY_WAKE_HELD, false)
      .putBoolean(KEY_WIFI_HELD, false)
      .putBoolean(KEY_LOGGED_IN, false)
      .apply();
    sendBroadcast(new Intent(ACTION_STATUS).setPackage(getPackageName())
      .putExtra("status", status)
      .putExtra("reason", reason)
      .putExtra("updatedAt", now)
      .putExtra("wakeLockHeld", false)
      .putExtra("wifiLockHeld", false)
      .putExtra("loggedIn", false));
  }

  private Notification buildOngoingNotification(String text) {
    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Planiprêt Mobile")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_call)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .build();
  }
  private void createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Réveil téléphonie", NotificationManager.IMPORTANCE_LOW));
    nm.createNotificationChannel(new NotificationChannel(CHANNEL_INCOMING_ID, "Appels entrants", NotificationManager.IMPORTANCE_HIGH));
  }
}
