package com.planipret.mobile;

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
