package com.planipret.mobile;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Relays FCM to Capacitor and wakes only the existing native PJSIP M/TLS engine. */
public class PpFirebaseMessagingService extends FirebaseMessagingService {
  @Override public void onMessageReceived(@NonNull RemoteMessage message) {
    PushNotificationsPlugin.sendRemoteMessage(message);
    String type = message.getData().get("type");
    if ("incoming_call".equals(type) || "call_incoming".equals(type)) {
      PpPjsipEngine.wakeForIncoming(getApplicationContext());
    }
  }

  @Override public void onNewToken(@NonNull String token) {
    PushNotificationsPlugin.onNewToken(token);
  }
}
