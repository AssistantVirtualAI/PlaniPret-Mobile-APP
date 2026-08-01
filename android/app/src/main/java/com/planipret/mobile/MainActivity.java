package com.planipret.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;
    private AudioManager audioManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PpSipKeepAlivePlugin.class);

        // ── Recommandation Google Play #1 : Edge-to-edge (API 35+) ───────────
        // EdgeToEdge.enable() remplace windowTranslucentStatus/Navigation (dépréciés).
        // WindowCompat.setDecorFitsSystemWindows(false) laisse le contenu passer
        // derrière les barres système — Capacitor WebView gère env(safe-area-inset-*).
        EdgeToEdge.enable(this);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        super.onCreate(savedInstanceState);

        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        // ── Configure audio mode for VoIP ──────────────────────────────────
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(false);

        // ── Create notification channels at startup (Android 8+) ──────────
        createNotificationChannels();

        // ── Request runtime permissions (Android 6+) ──────────────────────
        requestAppPermissions();

        // ── Allow WebView to request microphone/camera permissions ─────────
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
                if (existingClient != null) {
                    return existingClient.onShowFileChooser(webView2, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(webView2, filePathCallback, fileChooserParams);
            }
        });
    }

    // ── Recommandation Google Play #2 : Picture-in-Picture ───────────────────
    // Quand l'utilisateur appuie sur Home pendant un appel actif, l'app passe
    // automatiquement en mode PiP (fenêtre flottante 16:9).
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .build();
                enterPictureInPictureMode(params);
            } catch (Exception ignored) {
                // PiP non supporté sur cet appareil — on ignore silencieusement
            }
        }
    }

    /**
     * Request all runtime permissions needed by the app.
     * Android 6+ requires explicit user approval for dangerous permissions.
     */
    private void requestAppPermissions() {
        java.util.List<String> permissionsToRequest = new java.util.ArrayList<>();

        // Microphone — required for VoIP calls
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(android.Manifest.permission.RECORD_AUDIO);
        }

        // Camera — optional, for video calls
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(android.Manifest.permission.CAMERA);
        }

        // Contacts — optional, for contact lookup
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(android.Manifest.permission.READ_CONTACTS);
        }

        // Notifications — Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        // Bluetooth — Android 12+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(android.Manifest.permission.BLUETOOTH_CONNECT);
            }
        }

        if (!permissionsToRequest.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toArray(new String[0]),
                PERMISSION_REQUEST_CODE
            );
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
    }

    /**
     * Create all notification channels required by the app.
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel("incoming_calls") == null) {
            NotificationChannel callChannel = new NotificationChannel(
                "incoming_calls",
                "Appels entrants",
                NotificationManager.IMPORTANCE_HIGH
            );
            callChannel.setDescription("Notifications pour les appels telephoniques entrants");
            callChannel.enableVibration(true);
            callChannel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
            callChannel.enableLights(true);
            callChannel.setLightColor(0xFF0A84FF);
            callChannel.setShowBadge(true);
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

        if (nm.getNotificationChannel("default") == null) {
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "Notifications generales",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("Notifications generales de l'application");
            nm.createNotificationChannel(defaultChannel);
        }

        if (nm.getNotificationChannel("missed_calls") == null) {
            NotificationChannel missedChannel = new NotificationChannel(
                "missed_calls",
                "Appels manques",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            missedChannel.setDescription("Notifications pour les appels manques et la messagerie vocale");
            nm.createNotificationChannel(missedChannel);
        }
    }
}
