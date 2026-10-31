package com.planipret.mobile;

// Planiprêt-only Capacitor bridge for the native PJSIP M/TLS engine.
// DO NOT reuse in Lemtel.

import android.Manifest;
import android.content.pm.PackageManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;

@CapacitorPlugin(name = "PpPjsip")
public class PpPjsipPlugin extends Plugin {
  @Override public void load() {
    PpPjsipEngine.setListener(new PpPjsipEngine.Listener() {
      @Override public void onRegistration(String state, int code, String reason) {
        notifyListeners("registrationState", new JSObject()
          .put("state", state)
          .put("code", code)
          .put("reason", reason), true);
      }
      @Override public void onIncoming(int callId, String number, String name) {
        notifyListeners("incomingCall", new JSObject()
          .put("callId", String.valueOf(callId))
          .put("remoteNumber", number)
          .put("remoteName", name), true);
      }
      @Override public void onCallState(int callId, String state, String direction, String number) {
        notifyListeners("callState", new JSObject()
          .put("callId", String.valueOf(callId))
          .put("state", state)
          .put("direction", direction)
          .put("remoteNumber", number), true);
      }
    });
  }

  @PluginMethod public void isEngineLinked(PluginCall call) {
    call.resolve(new JSObject().put("linked", PpPjsipEngine.isLinked()));
  }

  @PluginMethod public void wakeForIncomingCall(PluginCall call) {
    PpPjsipEngine.wakeForIncoming(getContext());
    call.resolve(new JSObject().put("ok", true));
  }

  @PluginMethod public void clearStoredSession(PluginCall call) {
    PpPjsipEngine.clearStoredSession(getContext());
    call.resolve(new JSObject().put("ok", true));
  }

  @PluginMethod public void requestMicrophonePermission(PluginCall call) {
    boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    call.resolve(new JSObject().put("granted", granted).put("state", granted ? "granted" : "denied"));
  }

  @PluginMethod public void initialize(PluginCall call) {
    try {
      String transport = call.getString("transport", "TLS");
      int port = call.getInt("port", 5061);
      PpPjsipEngine.initialize(
        getContext(),
        call.getString("username", ""),
        call.getString("password", ""),
        call.getString("domain", ""),
        call.getString("proxy", ""),
        transport,
        port,
        call.getString("displayName", "Planiprêt")
      );
      call.resolve(new JSObject().put("ok", true).put("username", call.getString("username", "")));
    } catch (Throwable error) {
      call.reject("pjsip_error", safeReason(error));
    }
  }

  @PluginMethod public void register(PluginCall call) { invoke(call, () -> PpPjsipEngine.setRegistration(true)); }
  @PluginMethod public void unregister(PluginCall call) { invoke(call, () -> PpPjsipEngine.setRegistration(false)); }

  @PluginMethod public void makeCall(PluginCall call) {
    try {
      int callId = PpPjsipEngine.makeCall(call.getString("destination", ""));
      call.resolve(new JSObject().put("callId", String.valueOf(callId)));
    } catch (Throwable error) {
      call.reject("pjsip_error", safeReason(error));
    }
  }

  @PluginMethod public void answerCall(PluginCall call) {
    try { PpPjsipEngine.answer(parseCallId(call.getString("callId"))); call.resolve(new JSObject().put("ok", true)); }
    catch (Throwable error) { call.reject("pjsip_error", safeReason(error)); }
  }

  @PluginMethod public void hangupCall(PluginCall call) {
    try { PpPjsipEngine.hangup(parseCallId(call.getString("callId"))); call.resolve(new JSObject().put("ok", true)); }
    catch (Throwable error) { call.reject("pjsip_error", safeReason(error)); }
  }

  @PluginMethod public void setMute(PluginCall call) { invoke(call, () -> PpPjsipEngine.setMuted(call.getBoolean("muted", false))); }
  @PluginMethod public void setHold(PluginCall call) { invoke(call, () -> PpPjsipEngine.setHold(call.getBoolean("onHold", false))); }
  @PluginMethod public void setSpeaker(PluginCall call) { PpPjsipEngine.setSpeaker(call.getBoolean("enabled", false)); call.resolve(new JSObject().put("ok", true)); }
  /** Explicit user route only: calls never invoke this path automatically. */
  @PluginMethod public void setAudioRoute(PluginCall call) {
    PpPjsipEngine.setAudioRoute(call.getString("route", "earpiece"));
    call.resolve(new JSObject().put("ok", true).put("route", PpPjsipEngine.getAudioRoute()));
  }
  @PluginMethod public void getAudioRoute(PluginCall call) {
    call.resolve(new JSObject().put("ok", true).put("route", PpPjsipEngine.getAudioRoute()));
  }
  /** Called once by the Android native-network bridge after a true interface change. */
  @PluginMethod public void notifyNetworkChange(PluginCall call) {
    call.resolve(new JSObject().put("ok", true).put("handled", PpPjsipEngine.handleNetworkChange()));
  }
  @PluginMethod public void sendDTMF(PluginCall call) { invoke(call, () -> PpPjsipEngine.sendDtmf(call.getString("digits", ""))); }
  @PluginMethod public void getState(PluginCall call) {
    // JSObject(String) parses JSON text; the engine returns a controlled Java
    // Map of primitive diagnostics. Copy it explicitly to retain types without
    // serializing credentials, SDP or transport internals.
    JSObject payload = new JSObject();
    for (Map.Entry<String, Object> entry : PpPjsipEngine.state().entrySet()) {
      payload.put(entry.getKey(), entry.getValue());
    }
    call.resolve(payload);
  }

  static void answerFromNotification(String callId) {
    try { PpPjsipEngine.answer(parseCallId(callId)); } catch (Throwable ignored) { }
  }
  static void declineFromNotification(String callId) {
    try { PpPjsipEngine.hangup(parseCallId(callId)); } catch (Throwable ignored) { }
  }

  private interface Operation { void run() throws Exception; }
  private void invoke(PluginCall call, Operation operation) {
    try { operation.run(); call.resolve(new JSObject().put("ok", true)); }
    catch (Throwable error) { call.reject("pjsip_error", safeReason(error)); }
  }
  private static Integer parseCallId(String value) {
    try { return value == null || value.isEmpty() ? null : Integer.valueOf(value); }
    catch (NumberFormatException ignored) { return null; }
  }
  private static String safeReason(Throwable error) {
    String text = error.getMessage();
    return text == null || text.isEmpty() ? "native_sip_error" : text.replaceAll("(?i)password=[^, ]+", "password=[redacted]");
  }
}
