package com.planipret.mobile;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Relays FCM to Capacitor and wakes SIP only for incoming calls. */
public class PpFirebaseMessagingService extends FirebaseMessagingService {
  @Override public void onMessageReceived(@NonNull RemoteMessage message) {
    PushNotificationsPlugin.sendRemoteMessage(message);
    String type = message.getData().get("type");
    if ("incoming_call".equals(type) || "call_incoming".equals(type)) {
      PpSipKeepAliveService.start(getApplicationContext());
      PpSipKeepAliveService.requestReregister(getApplicationContext(), "fcm_incoming_call");
    }
  }

  @Override public void onNewToken(@NonNull String token) {
    PushNotificationsPlugin.onNewToken(token);
  }
}
