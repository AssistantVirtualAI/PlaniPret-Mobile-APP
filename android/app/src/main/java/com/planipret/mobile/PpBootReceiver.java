package com.planipret.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PpBootReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    String action = intent.getAction();
    if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
      android.content.SharedPreferences p = context.getSharedPreferences(PpSipKeepAliveService.PREFS_NAME, Context.MODE_PRIVATE);
      String host = p.getString("host", "");
      String login = p.getString("login", "");
      String password = p.getString("password", "");
      if (host != null && !host.isEmpty() && login != null && !login.isEmpty() && password != null && !password.isEmpty()) {
        PpSipKeepAliveService.start(context);
      }
    }
  }
}
