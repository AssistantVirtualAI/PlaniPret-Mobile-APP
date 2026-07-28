package com.lemtel.softphone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.app.NotificationManager

/**
 * Receives notification action button taps (Answer / Decline / Hold / Resume)
 * from both the incoming-call notification and the ongoing-call notification.
 *
 * In JsSIP mode (the only active mode on Android), ALL actions are relayed
 * immediately to JavaScript via ACTION_CALL_ACTION_EVENT so that JsSIP can
 * call session.answer() / session.terminate() directly.
 * The old Verto native answer/hangup path has been removed — it was the root
 * cause of the "Answer button does nothing" and "hangup sends caller to
 * voicemail" bugs.
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "CallActionReceiver"

        const val ACTION_ANSWER  = "com.lemtel.softphone.CALL_ANSWER"
        const val ACTION_DECLINE = "com.lemtel.softphone.CALL_DECLINE"
        const val ACTION_HANGUP  = "com.lemtel.softphone.CALL_HANGUP"
        const val ACTION_HOLD    = "com.lemtel.softphone.CALL_HOLD"
        const val ACTION_RESUME  = "com.lemtel.softphone.CALL_RESUME"
        const val ACTION_MUTE    = "com.lemtel.softphone.CALL_MUTE"

        const val ACTION_CALL_ACTION_EVENT = "com.lemtel.softphone.CALL_ACTION_EVENT"
        const val EXTRA_ACTION = "action"
        const val PREFS_NAME = "call_action_bridge"
        const val KEY_PENDING_ACTION = "pending_action"
        const val KEY_PENDING_ACTION_TS = "pending_action_ts"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = when (intent.action) {
            ACTION_ANSWER  -> "answer"
            ACTION_DECLINE -> "decline"
            ACTION_HANGUP  -> "hangup"
            ACTION_HOLD    -> "hold"
            ACTION_RESUME  -> "resume"
            ACTION_MUTE    -> "mute"
            else -> return
        }
        Log.i(TAG, "Notification action tapped: $action — relaying to JS immediately")

        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putString(KEY_PENDING_ACTION, action)
                .putLong(KEY_PENDING_ACTION_TS, System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}

        try {
            context.getSystemService(NotificationManager::class.java)
                ?.cancel(SipConnectionService.INCOMING_CALL_NOTIFICATION_ID)
        } catch (_: Exception) {}

        if (action == "answer" || action == "decline" || action == "hangup") {
            val launch = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("incoming_call_action", action)
            }
            try { context.startActivity(launch) } catch (_: Exception) {}
        }

        context.sendBroadcast(
            Intent(ACTION_CALL_ACTION_EVENT)
                .setPackage(context.packageName)
                .putExtra(EXTRA_ACTION, action)
        )
    }
}
