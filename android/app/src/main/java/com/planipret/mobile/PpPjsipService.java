package com.planipret.mobile;

// Planiprêt-only native-call foreground service. DO NOT reuse in Lemtel.

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Owns the Android foreground lifecycle for the native PJSIP M/TLS engine.
 * It does not create a second SIP stack. PpPjsipEngine is process-global and
 * the only class permitted to REGISTER, INVITE, 200 OK, BYE or attach RTP.
 */
public class PpPjsipService extends Service {
  private static final String TAG = "PpPjsipService";
  static final String CHANNEL_ID = "pp_native_sip";
  static final String INCOMING_CHANNEL_ID = "incoming_calls";
  static final int SERVICE_NOTIFICATION_ID = 2401;
  static final int INCOMING_NOTIFICATION_ID = 2402;

  /**
   * Starting an FGS can be rejected on Android 12+ when a process is in the
   * background. Never let that policy exception terminate the entire app.
   */
  static boolean start(Context context, String reason) {
    if (context == null) return false;
    Intent intent = new Intent(context, PpPjsipService.class).putExtra("reason", reason);
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
      else context.startService(intent);
      return true;
    } catch (SecurityException | IllegalStateException error) {
      Log.w(TAG, "native call service unavailable", error);
      return false;
    }
  }

  /** Starts/promotes the service only after the user has granted microphone use. */
  static boolean prepareForCall(Context context) {
    if (context == null || ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) return false;
    return start(context, "native_call_audio");
  }

  static void showIncoming(Context context, int callId, String from) {
    if (context == null) return;
    createChannels(context);
    Intent answer = new Intent(context, PpIncomingActionReceiver.class)
      .setAction(PpIncomingActionReceiver.ACTION_ANSWER)
      .putExtra("callId", String.valueOf(callId));
    Intent decline = new Intent(context, PpIncomingActionReceiver.class)
      .setAction(PpIncomingActionReceiver.ACTION_DECLINE)
      .putExtra("callId", String.valueOf(callId));
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    PendingIntent answerPi = PendingIntent.getBroadcast(context, 24021, answer, flags);
    PendingIntent declinePi = PendingIntent.getBroadcast(context, 24022, decline, flags);
    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    PendingIntent contentPi = launch == null ? null : PendingIntent.getActivity(context, 24023, launch, flags);
    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, INCOMING_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_call)
      .setContentTitle("Appel entrant Planiprêt")
      .setContentText(from == null || from.isEmpty() ? "Appel entrant" : from)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", declinePi)
      .addAction(android.R.drawable.ic_menu_call, "Répondre", answerPi);
    if (contentPi != null) builder.setContentIntent(contentPi);
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.notify(INCOMING_NOTIFICATION_ID, builder.build());
  }

  static void clearIncoming(Context context) {
    if (context == null) return;
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(INCOMING_NOTIFICATION_ID);
  }

  @Override public void onCreate() {
    super.onCreate();
    createChannels(this);
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_call)
      .setContentTitle("Planiprêt Mobile")
      .setContentText("Ligne mobile sécurisée active")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setSilent(true)
      .build();
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      int types = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL;
      // Android 14+ throws SecurityException if microphone is included before
      // RECORD_AUDIO has been granted. Initial M/TLS registration is phoneCall
      // only; prepareForCall() promotes after the permission is present.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && hasMicrophonePermission()) {
        types |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
      }
      ServiceCompat.startForeground(this, SERVICE_NOTIFICATION_ID, notification, types);
      } else {
      startForeground(SERVICE_NOTIFICATION_ID, notification);
      }
    } catch (SecurityException | IllegalStateException error) {
      Log.e(TAG, "foreground start rejected; app remains usable", error);
      stopSelfResult(startId);
    }
    return START_NOT_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }

  private boolean hasMicrophonePermission() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
      == PackageManager.PERMISSION_GRANTED;
  }

  private static void createChannels(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Ligne mobile sécurisée", NotificationManager.IMPORTANCE_LOW));
    }
    if (manager.getNotificationChannel(INCOMING_CHANNEL_ID) == null) {
      NotificationChannel channel = new NotificationChannel(INCOMING_CHANNEL_ID, "Appels entrants", NotificationManager.IMPORTANCE_HIGH);
      channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      manager.createNotificationChannel(channel);
    }
  }
}
