package com.lemtel.softphone

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.AudioTrack
import android.media.AudioFormat
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "CapacitorPjsip",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class CapacitorPjsip : Plugin() {

    companion object {
        const val TAG = "CapacitorPjsip"
    }

    private var audioManager: AudioManager? = null
    private var sipStatusReceiver: BroadcastReceiver? = null
    private var callActionReceiver: BroadcastReceiver? = null
    private var scoReceiver: BroadcastReceiver? = null
    private var vertoServerMessageReceiver: BroadcastReceiver? = null

    override fun load() {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        sipStatusReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != SipConnectionService.ACTION_STATUS) return
                notifyListeners("sipServiceStatus", statusFromIntent(intent), true)
            }
        }
        callActionReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != CallActionReceiver.ACTION_CALL_ACTION_EVENT) return
                val action = intent.getStringExtra(CallActionReceiver.EXTRA_ACTION) ?: return
                val payload = JSObject().put("action", action)
                notifyListeners("sipCallAction", payload, true)
            }
        }
        vertoServerMessageReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != SipConnectionService.ACTION_VERTO_SERVER_MESSAGE) return
                val raw = intent.getStringExtra("raw") ?: return
                val payload = JSObject().put("raw", raw)
                notifyListeners("vertoServerMessage", payload, true)
            }
        }
        scoReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED) return
                val state = intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
                if (state == AudioManager.SCO_AUDIO_STATE_CONNECTED) {
                    audioManager?.isBluetoothScoOn = true
                    notifyListeners("audioRouteChanged", JSObject().apply { put("route", "bluetooth") }, true)
                } else if (state == AudioManager.SCO_AUDIO_STATE_DISCONNECTED) {
                    audioManager?.isBluetoothScoOn = false
                    val r = if (audioManager?.isSpeakerphoneOn == true) "speaker" else "earpiece"
                    notifyListeners("audioRouteChanged", JSObject().apply { put("route", r) }, true)
                }
            }
        }
        try {
            val filter = IntentFilter(SipConnectionService.ACTION_STATUS)
            val callFilter = IntentFilter(CallActionReceiver.ACTION_CALL_ACTION_EVENT)
            val scoFilter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
            val vertoFilter = IntentFilter(SipConnectionService.ACTION_VERTO_SERVER_MESSAGE)
            val receiver = sipStatusReceiver ?: return
            val callRecv = callActionReceiver ?: return
            val scoRecv = scoReceiver ?: return
            val vertoRecv = vertoServerMessageReceiver ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
                context.registerReceiver(callRecv, callFilter, Context.RECEIVER_NOT_EXPORTED)
                context.registerReceiver(scoRecv, scoFilter, Context.RECEIVER_NOT_EXPORTED)
                context.registerReceiver(vertoRecv, vertoFilter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                context.registerReceiver(receiver, filter)
                @Suppress("DEPRECATION")
                context.registerReceiver(callRecv, callFilter)
                @Suppress("DEPRECATION")
                context.registerReceiver(scoRecv, scoFilter)
                @Suppress("DEPRECATION")
                context.registerReceiver(vertoRecv, vertoFilter)
            }
            flushPendingCallAction()
        } catch (_: Exception) {}
    }

    private fun flushPendingCallAction() {
        try {
            val prefs = context.getSharedPreferences(CallActionReceiver.PREFS_NAME, Context.MODE_PRIVATE)
            val action = prefs.getString(CallActionReceiver.KEY_PENDING_ACTION, "") ?: ""
            val ts = prefs.getLong(CallActionReceiver.KEY_PENDING_ACTION_TS, 0L)
            if (action.isEmpty()) return
            prefs.edit()
                .remove(CallActionReceiver.KEY_PENDING_ACTION)
                .remove(CallActionReceiver.KEY_PENDING_ACTION_TS)
                .apply()
            if (System.currentTimeMillis() - ts > 15_000L) return
            Log.i(TAG, "Flushing pending notification action to JS: $action")
            notifyListeners("sipCallAction", JSObject().put("action", action), true)
        } catch (_: Exception) {}
    }

    override fun handleOnDestroy() {
        try { sipStatusReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        try { callActionReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        try { scoReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        try { vertoServerMessageReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        sipStatusReceiver = null
        callActionReceiver = null
        scoReceiver = null
        vertoServerMessageReceiver = null
        try { AudioFocusHelper.releaseCallAudioFocus(context) } catch (_: Exception) {}
        super.handleOnDestroy()
    }

    @PluginMethod
    fun initAccount(call: PluginCall) {
        // server and domain MUST be provided by the JS layer — no hardcoded fallbacks
        // so the plugin works on any PBX/domain.
        val server = call.getString("server") ?: ""
        val port = call.getInt("port") ?: 5060
        val username = call.getString("username") ?: call.getString("extension") ?: ""
        val password = call.getString("password") ?: ""
        val domain = call.getString("domain") ?: ""
        val transport = call.getString("transport") ?: "TCP"

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback")
            return
        }
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
        call.resolve(JSObject().apply {
            put("ok", true)
            put("status", "ok")
            put("server", server)
            put("port", port)
            put("username", username)
            put("domain", domain)
            put("transport", transport)
        })
    }

    @PermissionCallback
    fun microphonePermissionCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            call.resolve(JSObject().apply { put("ok", true); put("status", "ok") })
        } else {
            call.reject("Microphone permission denied")
        }
    }

    @PluginMethod fun makeCall(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true); put("status", "calling") }) }
    @PluginMethod
    fun startCall(call: PluginCall) {
        AudioFocusHelper.requestCallAudioFocus(context)
        call.resolve(JSObject().apply { put("ok", true) })
    }
    @PluginMethod fun hangup(call: PluginCall) {
        AudioFocusHelper.releaseCallAudioFocus(context)
        try { if (audioManager?.isBluetoothScoOn == true) { audioManager?.isBluetoothScoOn = false; audioManager?.stopBluetoothSco() } } catch (_: Exception) {}
        call.resolve(JSObject().apply { put("ok", true) })
    }
    @PluginMethod fun answer(call: PluginCall) {
        AudioFocusHelper.requestCallAudioFocus(context)
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun answerNativeCall(call: PluginCall) {
        Log.i(TAG, "answerNativeCall ignored in JsSIP mode — JS owns session.answer()")
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun hangupNativeCall(call: PluginCall) {
        Log.i(TAG, "hangupNativeCall ignored in JsSIP mode — JS owns session.terminate()")
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun registerOutboundCall(call: PluginCall) {
        val callID = call.getString("callID") ?: ""
        val destination = call.getString("destination") ?: ""
        context.sendBroadcast(Intent(SipConnectionService.ACTION_REGISTER_OUTBOUND_CALL).apply {
            setPackage(context.packageName)
            putExtra("callID", callID)
            putExtra("destination", destination)
        })
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod fun setMute(call: PluginCall) { val m = call.getBoolean("muted", false) ?: false; audioManager?.isMicrophoneMute = m; call.resolve(JSObject().apply { put("ok", true); put("muted", m) }) }
    @PluginMethod fun setHold(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun sendDTMF(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun disconnect(call: PluginCall) {
        AudioFocusHelper.releaseCallAudioFocus(context)
        try { if (audioManager?.isBluetoothScoOn == true) { audioManager?.isBluetoothScoOn = false; audioManager?.stopBluetoothSco() } } catch (_: Exception) {}
        call.resolve(JSObject().apply { put("ok", true) })
    }
    @PluginMethod fun setLogLevel(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun getSnapshot(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun setHeld(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun startRecord(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun stopRecord(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun startRecording(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun stopRecording(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun snapshot(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun transfer(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun park(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun addCall(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }
    @PluginMethod fun setLiveTranscriptionEnabled(call: PluginCall) { call.resolve(JSObject().apply { put("ok", true) }) }

    @PluginMethod
    fun startSipService(call: PluginCall) {
        try {
            // Save credentials so the native Verto WebSocket can re-register
            // independently of the WebView when the screen is locked.
            // host, port, domain MUST be provided by the JS layer (derived from
            // SIPConfig.wssUrl / SIPConfig.vertoHost). No hardcoded fallbacks so
            // the service works on any PBX/domain.
            val host = call.getString("host") ?: ""
            val port = call.getInt("port") ?: 8082
            val login = call.getString("login") ?: call.getString("extension") ?: ""
            val password = call.getString("password") ?: ""
            val domain = call.getString("domain") ?: ""
            val displayName = call.getString("displayName") ?: login
            if (login.isNotEmpty() && password.isNotEmpty()) {
                SipConnectionService.saveCredentials(context, host, port, login, password, domain, displayName)
            }
            // Start in JsSIP mode: WakeLock + WifiLock only, no native Verto WebSocket.
            // The WebView handles SIP over WSS 7443 via JsSIP directly.
            SipConnectionService.start(context, mode = "jssip")
            call.resolve(readSipServiceStatus().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject(e.message ?: "startSipService failed")
        }
    }

    @PluginMethod
    fun getSipServiceStatus(call: PluginCall) {
        call.resolve(readSipServiceStatus().apply { put("ok", true) })
    }

    @PluginMethod
    fun requestBatteryOptimizationExemption(call: PluginCall) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                call.resolve(JSObject().apply { put("ok", true); put("ignored", true); put("requested", false) })
                return
            }
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = context.packageName
            val alreadyIgnored = pm.isIgnoringBatteryOptimizations(packageName)
            if (!alreadyIgnored) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
            call.resolve(JSObject().apply {
                put("ok", true)
                put("ignored", alreadyIgnored)
                put("requested", !alreadyIgnored)
            })
        } catch (e: Exception) {
            call.reject(e.message ?: "battery optimization request failed")
        }
    }

    @PluginMethod
    fun stopSipService(call: PluginCall) {
        try {
            SipConnectionService.stop(context)
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject(e.message ?: "stopSipService failed")
        }
    }

    @PluginMethod
    fun setAudioRoute(call: PluginCall) {
        // MODE_IN_COMMUNICATION MUST be set before flipping speakerphone /
        // bluetooth, otherwise Android routes through the media stream.
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
        when (call.getString("route", "earpiece")) {
            "speaker" -> {
                try { audioManager?.stopBluetoothSco() } catch (_: Exception) {}
                audioManager?.isBluetoothScoOn = false
                audioManager?.isSpeakerphoneOn = true
            }
            "earpiece" -> {
                try { audioManager?.stopBluetoothSco() } catch (_: Exception) {}
                audioManager?.isBluetoothScoOn = false
                audioManager?.isSpeakerphoneOn = false
            }
            "bluetooth" -> {
                audioManager?.isSpeakerphoneOn = false
                try { audioManager?.startBluetoothSco() } catch (_: Exception) {}
                // isBluetoothScoOn is flipped to true by the SCO_AUDIO_STATE
                // broadcast receiver once the SCO link is actually connected.
            }
        }
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun getAudioRoute(call: PluginCall) {
        val route = when {
            audioManager?.isSpeakerphoneOn == true -> "speaker"
            audioManager?.isBluetoothScoOn == true -> "bluetooth"
            else -> "earpiece"
        }
        val outputs = JSArray()
        outputs.put(JSObject().apply { put("portType", route); put("portName", route) })
        val inputs = JSArray()
        inputs.put(JSObject().apply { put("portType", "builtin_mic"); put("portName", "Microphone") })
        call.resolve(JSObject().apply {
            put("route", route)
            put("ok", true)
            put("outputs", outputs)
            put("inputs", inputs)
        })
    }

    @PluginMethod
    fun getRtpStats(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("running", false)
            put("audioBackend", "jssip-webrtc")
            put("ok", true)
        })
    }

    @PluginMethod
    fun playTestTone(call: PluginCall) {
        try {
            val sampleRate = 44100
            val numSamples = sampleRate * 2
            val buffer = ShortArray(numSamples)
            for (i in 0 until numSamples) {
                buffer[i] = (Math.sin(2.0 * Math.PI * 440.0 * i / sampleRate) * 32767).toInt().toShort()
            }
            val audioTrack = AudioTrack(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
                buffer.size * 2,
                AudioTrack.MODE_STATIC,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            )
            audioTrack.write(buffer, 0, buffer.size)
            audioTrack.play()
            Handler(Looper.getMainLooper()).postDelayed({ audioTrack.release() }, 2500)
        } catch (e: Exception) {
            android.util.Log.e("CapacitorPjsip", "playTestTone error: ${e.message}")
        }
        call.resolve(JSObject().apply { put("ok", true); put("micPeak", 0.0); put("route", "speaker") })
    }

    @PluginMethod
    fun requestMicrophonePermission(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            call.resolve(JSObject().apply { put("granted", true) })
        } else {
            requestPermissionForAlias("microphone", call, "micPermCallback")
        }
    }

    @PermissionCallback
    fun micPermCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().apply { put("granted", granted) })
    }

    private fun statusFromIntent(intent: Intent): JSObject {
        return JSObject().apply {
            put("status", intent.getStringExtra("status") ?: "unknown")
            put("reason", intent.getStringExtra("reason") ?: "")
            put("callId", intent.getStringExtra("callId") ?: "")
            put("callerName", intent.getStringExtra("callerName") ?: "")
            put("callerNumber", intent.getStringExtra("callerNumber") ?: "")
            put("inviteParams", intent.getStringExtra("inviteParams") ?: "")
            put("updatedAt", intent.getLongExtra("updatedAt", 0L))
            put("lastLoginAt", intent.getLongExtra("lastLoginAt", 0L))
            put("lastPingAt", intent.getLongExtra("lastPingAt", 0L))
            put("lastFrameAt", intent.getLongExtra("lastFrameAt", 0L))
            put("reconnectAttempt", intent.getIntExtra("reconnectAttempt", 0))
            put("connecting", intent.getBooleanExtra("connecting", false))
            put("loggedIn", intent.getBooleanExtra("loggedIn", false))
            put("wakeLockHeld", intent.getBooleanExtra("wakeLockHeld", false))
            put("wifiLockHeld", intent.getBooleanExtra("wifiLockHeld", false))
        }
    }

    @PluginMethod
    fun showIncomingCallNotif(call: PluginCall) {
        try {
            val callerNumber = call.getString("callerNumber", "") ?: ""
            val callerName   = call.getString("callerName", "") ?: ""
            val svc = SipConnectionService.instance
            if (svc != null) {
                svc.showIncomingCallNotification(callerName, callerNumber)
            } else {
                // Service not running yet — start it in jssip mode then ring
                SipConnectionService.start(context, mode = "jssip")
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    SipConnectionService.instance?.showIncomingCallNotification(callerName, callerNumber)
                }, 500)
            }
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject(e.message ?: "showIncomingCallNotif failed")
        }
    }

    @PluginMethod
    fun dismissIncomingCallNotif(call: PluginCall) {
        try {
            SipConnectionService.instance?.dismissIncomingCallNotification()
            call.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            call.reject(e.message ?: "dismissIncomingCallNotif failed")
        }
    }

    private fun readSipServiceStatus(): JSObject {
        val p = context.getSharedPreferences(SipConnectionService.PREFS_NAME, Context.MODE_PRIVATE)
        return JSObject().apply {
            put("status", p.getString(SipConnectionService.KEY_STATUS, "unknown") ?: "unknown")
            put("reason", p.getString(SipConnectionService.KEY_REASON, "") ?: "")
            put("callId", p.getString("verto_current_call_id", "") ?: "")
            put("callerName", p.getString("verto_current_caller_name", "") ?: "")
            put("callerNumber", p.getString("verto_current_caller_number", "") ?: "")
            put("inviteParams", p.getString("verto_current_invite_params", "") ?: "")
            put("updatedAt", p.getLong(SipConnectionService.KEY_UPDATED_AT, 0L))
            put("lastLoginAt", p.getLong(SipConnectionService.KEY_LAST_LOGIN_AT, 0L))
            put("lastPingAt", p.getLong(SipConnectionService.KEY_LAST_PING_AT, 0L))
            put("lastFrameAt", p.getLong(SipConnectionService.KEY_LAST_FRAME_AT, 0L))
            put("reconnectAttempt", p.getInt(SipConnectionService.KEY_RECONNECT_ATTEMPT, 0))
            put("connecting", p.getBoolean(SipConnectionService.KEY_CONNECTING, false))
            put("loggedIn", p.getBoolean(SipConnectionService.KEY_LOGGED_IN, false))
            put("wakeLockHeld", p.getBoolean(SipConnectionService.KEY_WAKE_HELD, false))
            put("wifiLockHeld", p.getBoolean(SipConnectionService.KEY_WIFI_HELD, false))
        }
    }
}
