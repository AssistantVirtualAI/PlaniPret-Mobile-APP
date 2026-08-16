package com.planipret.mobile;

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
      // Android 12+ (API 31) : setSpeakerphoneOn/startBluetoothSco sont
      // dépréciés et souvent sans effet. Il faut passer par
      // setCommunicationDevice(), sinon le bouton haut-parleur ne fait rien.
      boolean routed = false;
      if (Build.VERSION.SDK_INT >= 31) {
        try {
          int wanted = "speaker".equals(route)
            ? android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
            : ("bluetooth".equals(route) ? android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                                         : android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
          android.media.AudioDeviceInfo target = null;
          android.media.AudioDeviceInfo wired = null;
          for (android.media.AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
            if (d.getType() == wanted) { target = d; break; }
            if (d.getType() == android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET
             || d.getType() == android.media.AudioDeviceInfo.TYPE_USB_HEADSET) wired = d;
          }
          if (target == null && !"speaker".equals(route)) target = wired;
          if (target != null) {
            am.clearCommunicationDevice();
            routed = am.setCommunicationDevice(target);
          }
        } catch (Exception ignored) {}
      }
      if (!routed) {
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
      }
      call.resolve(new JSObject().put("ok", true).put("route", route));
    } catch (Exception e) { call.reject(e.getMessage()); }
  }
  @PluginMethod public void getAudioRoute(PluginCall call) {
    try {
      android.media.AudioManager am = (android.media.AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
      String route = "earpiece";
      if (am != null) {
        android.media.AudioDeviceInfo cur = null;
        if (Build.VERSION.SDK_INT >= 31) { try { cur = am.getCommunicationDevice(); } catch (Exception ignored) {} }
        if (cur != null) {
          int t = cur.getType();
          if (t == android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO) route = "bluetooth";
          else if (t == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) route = "speaker";
        } else if (am.isBluetoothScoOn()) route = "bluetooth";
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
