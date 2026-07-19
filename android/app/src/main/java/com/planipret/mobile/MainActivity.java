package com.planipret.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private AudioManager audioManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // ── Configure audio mode for VoIP ──────────────────────────────────
        // MODE_IN_COMMUNICATION = optimized for VoIP (echo cancellation, noise suppression)
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        // Do NOT force speaker — user must activate manually via button
        audioManager.setSpeakerphoneOn(false);

        // ── Create notification channels at startup (Android 8+) ──────────
        createNotificationChannels();

        // ── Allow WebView to request microphone/camera permissions ─────────
        // We extend the existing Capacitor WebChromeClient to preserve all
        // Capacitor functionality while adding WebRTC permission grant.
        WebView webView = getBridge().getWebView();
        WebChromeClient existingClient = webView.getWebChromeClient();

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Grant microphone and camera to WebView (JsSIP WebRTC needs this)
                request.grant(request.getResources());
            }

            @Override
            public boolean onShowFileChooser(
                android.webkit.WebView webView2,
                android.webkit.ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
                // Delegate file chooser to existing Capacitor client if available
                if (existingClient != null) {
                    return existingClient.onShowFileChooser(webView2, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(webView2, filePathCallback, fileChooserParams);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Restore communication mode when app comes to foreground
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Release audio resources when app is destroyed
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
    }

    /**
     * Create all notification channels required by the app.
     * Must be called before any notification is shown (Android 8+).
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // ── Incoming calls channel (max priority, ringtone) ───────────────
        if (nm.getNotificationChannel("incoming_calls") == null) {
            NotificationChannel callChannel = new NotificationChannel(
                "incoming_calls",
                "Appels entrants",
                NotificationManager.IMPORTANCE_HIGH
            );
            callChannel.setDescription("Notifications pour les appels téléphoniques entrants");
            callChannel.enableVibration(true);
            callChannel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
            callChannel.enableLights(true);
            callChannel.setLightColor(0xFF0A84FF);
            callChannel.setShowBadge(true);
            // Use system ringtone for incoming calls
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtoneUri != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                callChannel.setSound(ringtoneUri, audioAttributes);
            }
            nm.createNotificationChannel(callChannel);
        }

        // ── General push notifications channel ────────────────────────────
        if (nm.getNotificationChannel("default") == null) {
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "Notifications générales",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("Notifications générales de l'application");
            nm.createNotificationChannel(defaultChannel);
        }

        // ── Missed calls / voicemail channel ──────────────────────────────
        if (nm.getNotificationChannel("missed_calls") == null) {
            NotificationChannel missedChannel = new NotificationChannel(
                "missed_calls",
                "Appels manqués",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            missedChannel.setDescription("Notifications pour les appels manqués et la messagerie vocale");
            nm.createNotificationChannel(missedChannel);
        }
    }
}
