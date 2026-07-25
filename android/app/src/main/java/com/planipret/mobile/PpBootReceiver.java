package com.planipret.mobile;
// Planiprêt-only. DO NOT reuse in Lemtel.
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Redémarre le service SIP foreground après un reboot du téléphone,
 * afin que l'app reste enregistrée et puisse recevoir les appels entrants
 * même si l'utilisateur n'a pas rouvert l'app depuis le dernier démarrage.
 *
 * Requiert la permission RECEIVE_BOOT_COMPLETED (déclarée dans AndroidManifest.xml)
 * et l'enregistrement du receiver dans le manifest.
 */
public class PpBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            // Redémarre le service foreground pour que le WebSocket SIP se reconnecte
            // automatiquement. La couche JS re-enregistrera via JsSIP dès que la WebView
            // sera prête.
            PpSipKeepAliveService.start(context);
        }
    }
}
