package com.lemtel.softphone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.SocketTimeoutException
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * Foreground service that maintains a native Kotlin WebSocket connection to
 * FreeSWITCH Verto (port 8082) independently of the WebView / JavaScript layer.
 *
 * Uses only Android-native APIs (javax.net.ssl.SSLSocket) — no OkHttp dependency.
 * This ensures the extension stays REGISTERED even when:
 *  - The screen is locked
 *  - The app is in the background
 *  - Android throttles JS timers in the WebView
 */
class SipConnectionService : Service() {

    companion object {
        const val TAG = "SipConnectionService"
        const val CHANNEL_ID = "sip_connection_channel"
        const val CALL_CHANNEL_ID = "sip_incoming_call_channel"
        const val NOTIFICATION_ID = 1001
        const val INCOMING_CALL_NOTIFICATION_ID = 1002
        const val PREFS_NAME = "verto_creds"

        // Weak-ish singleton so MainActivity can re-broadcast the current
        // incoming-call state after Android relaunches the UI from a
        // full-screen notification tap.
        @Volatile var instance: SipConnectionService? = null

        const val KEY_HOST = "verto_host"
        const val KEY_PORT = "verto_port"
        const val KEY_LOGIN = "verto_login"
        const val KEY_PASSWORD = "verto_password"
        const val KEY_DOMAIN = "verto_domain"
        const val KEY_DISPLAY_NAME = "verto_display_name"

        const val ACTION_STATUS = "com.lemtel.softphone.SIP_SERVICE_STATUS"
        const val ACTION_VERTO_SERVER_MESSAGE = "com.lemtel.softphone.VERTO_SERVER_MESSAGE"
        const val ACTION_REGISTER_OUTBOUND_CALL = "com.lemtel.softphone.REGISTER_OUTBOUND_CALL"
        const val KEY_STATUS = "verto_native_status"
        const val KEY_REASON = "verto_native_reason"
        const val KEY_UPDATED_AT = "verto_native_updated_at"
        const val KEY_LAST_LOGIN_AT = "verto_native_last_login_at"
        const val KEY_LAST_PING_AT = "verto_native_last_ping_at"
        const val KEY_LAST_FRAME_AT = "verto_native_last_frame_at"
        const val KEY_RECONNECT_ATTEMPT = "verto_native_reconnect_attempt"
        const val KEY_CONNECTING = "verto_native_connecting"
        const val KEY_LOGGED_IN = "verto_native_logged_in"
        const val KEY_WAKE_HELD = "verto_native_wake_held"
        const val KEY_WIFI_HELD = "verto_native_wifi_held"
        const val KEY_MODE = "sip_service_mode"  // "verto" (default) or "jssip"

        fun start(context: Context, mode: String = "verto") {
            val intent = Intent(context, SipConnectionService::class.java).apply {
                putExtra("mode", mode)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SipConnectionService::class.java))
        }

        fun saveCredentials(
            context: Context,
            host: String, port: Int, login: String,
            password: String, domain: String, displayName: String
        ) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
                putString(KEY_HOST, host)
                putInt(KEY_PORT, port)
                putString(KEY_LOGIN, login)
                putString(KEY_PASSWORD, password)
                putString(KEY_DOMAIN, domain)
                putString(KEY_DISPLAY_NAME, displayName)
                apply()
            }
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val executor: ScheduledExecutorService = Executors.newScheduledThreadPool(2)
    private val handler = Handler(Looper.getMainLooper())
    private var isDestroyed = false

    // WebSocket state
    private var sslSocket: SSLSocket? = null
    private var outputStream: OutputStream? = null
    private var sessionUUID: String = UUID.randomUUID().toString()
    private var isLoggedIn = false
    private var reconnectAttempt = 0
    private var pingFuture: ScheduledFuture<*>? = null
    private var reLoginFuture: ScheduledFuture<*>? = null
    private var reconnectFuture: ScheduledFuture<*>? = null
    @Volatile private var connecting = false
    @Volatile private var lastFrameAt = 0L
    @Volatile private var lastLoginAt = 0L
    @Volatile private var lastPingAt = 0L
    @Volatile private var lastReason = ""
    @Volatile private var currentCallId: String? = null
    @Volatile private var currentCallerName: String? = null
    @Volatile private var currentCallerNumber: String? = null
    @Volatile private var currentInviteParams: String? = null
    @Volatile private var currentCallActive = false
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var callActionReceiver: android.content.BroadcastReceiver? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannels()

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LemtelSoftphone::SipWakeLock").apply {
            setReferenceCounted(false)
            acquire()
        }

        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "LemtelSoftphone::SipWifiLock").apply {
            setReferenceCounted(false)
            acquire()
        }
        emitStatus("idle", "service_created")
        registerNetworkWatchdog()
        registerCallActionReceiver()
    }

    /**
     * Re-broadcasts the last incoming-INVITE state so the freshly-launched
     * UI (opened via full-screen notification) can render the Answer button
     * even if it missed the original `emitStatus("incoming", ...)` broadcast.
     */
    fun reEmitIncomingStatus() {
        val invite = currentInviteParams ?: return
        if (invite.isEmpty()) return
        handler.post {
            Log.i(TAG, "reEmitIncomingStatus: caller=${currentCallerNumber} inviteLen=${invite.length}")
            emitStatus("incoming", "${currentCallerName ?: ""} <${currentCallerNumber ?: ""}>")
        }
    }


    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val mode = intent?.getStringExtra("mode") ?: prefs.getString(KEY_MODE, "jssip") ?: "jssip"
        // Persist mode so sticky restarts preserve the correct behaviour.
        prefs.edit().putString(KEY_MODE, mode).apply()

        val notification = buildNotification("Connecté · Prêt à recevoir des appels")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        if (mode == "jssip") {
            // JsSIP mode: the WebView handles SIP over WSS itself.
            // This service only provides WakeLock + WifiLock + foreground notification
            // so Android does not throttle the WebView WebSocket in background.
            Log.i(TAG, "SipConnectionService started in JsSIP keepalive mode (no native Verto WS)")
            emitStatus("registered", "jssip_keepalive")
        } else {
            // Verto mode: native Kotlin WebSocket to FreeSWITCH port 8082.
            emitStatus(if (isLoggedIn) "registered" else "connecting", "service_start")
            if (!isLoggedIn && !connecting) executor.submit { connectVerto() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isDestroyed = true
        pingFuture?.cancel(true)
        reLoginFuture?.cancel(true)
        reconnectFuture?.cancel(true)
        unregisterNetworkWatchdog()
        unregisterCallActionReceiver()
        try { AudioFocusHelper.releaseCallAudioFocus(this) } catch (_: Exception) {}
        closeSocket()
        executor.shutdownNow()
        wakeLock?.let { if (it.isHeld) it.release() }
        wifiLock?.let { if (it.isHeld) it.release() }
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (isJsSipMode()) {
            // In JsSIP mode, the WebView owns the SIP stack. When the task is removed
            // the WebView is gone too, so there is nothing to reconnect natively.
            // The service stays alive to hold WakeLock/WifiLock for the next launch.
            Log.i(TAG, "onTaskRemoved: JsSIP mode — keeping WakeLock, no Verto reconnect")
            emitStatus("idle", "task_removed_jssip")
        } else {
            // Verto mode: keep the native WebSocket alive across task removal.
            emitStatus("reconnecting", "task_removed")
            scheduleReconnect(1_000L)
        }
        super.onTaskRemoved(rootIntent)
    }

    // ── WebSocket (RFC 6455) over TLS ────────────────────────────────────────

    private fun connectVerto() {
        if (isDestroyed) return
        if (connecting) return
        connecting = true
        reconnectFuture?.cancel(false)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // host and domain are always written by the JS layer via saveCredentials().
        // No hardcoded fallbacks — if they are empty the guard below will abort.
        val host = prefs.getString(KEY_HOST, "") ?: ""
        val port = prefs.getInt(KEY_PORT, 8082)
        val login = prefs.getString(KEY_LOGIN, "") ?: ""
        val password = prefs.getString(KEY_PASSWORD, "") ?: ""
        val domain = prefs.getString(KEY_DOMAIN, "") ?: ""
        val displayName = prefs.getString(KEY_DISPLAY_NAME, login) ?: login

        if (login.isEmpty() || password.isEmpty() || host.isEmpty()) {
            Log.w(TAG, "No credentials stored — skipping native Verto connect")
            connecting = false
            emitStatus("error", "missing_credentials")
            return
        }

        try {
            Log.i(TAG, "Connecting native Verto WS to wss://$host:$port ext=$login")
            updateNotification("Connexion en cours...")
            emitStatus("connecting", "open_socket")

            val factory = SSLSocketFactory.getDefault() as SSLSocketFactory
            val socket = factory.createSocket(host, port) as SSLSocket
            socket.keepAlive = true
            // Detect dead sockets faster: 30s read timeout + ping every 15s so
            // Doze/network-drop induced silence is caught within ~45s instead of ~95s.
            socket.soTimeout = 90_000
            socket.startHandshake()

            // WebSocket HTTP Upgrade handshake
            val wsKey = Base64.encodeToString(ByteArray(16).also { SecureRandom().nextBytes(it) }, Base64.NO_WRAP)
            val handshake = buildString {
                append("GET / HTTP/1.1\r\n")
                append("Host: $host:$port\r\n")
                append("Upgrade: websocket\r\n")
                append("Connection: Upgrade\r\n")
                append("Sec-WebSocket-Key: $wsKey\r\n")
                append("Sec-WebSocket-Version: 13\r\n")
                append("Sec-WebSocket-Protocol: json\r\n")
                append("\r\n")
            }
            socket.outputStream.write(handshake.toByteArray(Charsets.US_ASCII))
            socket.outputStream.flush()

            // Read HTTP response without BufferedReader so it cannot pre-buffer
            // the first WebSocket frame after \r\n\r\n. Losing that frame can
            // make the native background service think it never registered.
            val responseHeader = readHttpHeader(socket)
            val statusLine = responseHeader.lineSequence().firstOrNull() ?: throw Exception("No HTTP response")
            if (!statusLine.contains("101")) throw Exception("WS upgrade failed: $statusLine")

            sslSocket = socket
            outputStream = socket.outputStream
            if (currentCallId.isNullOrEmpty() && pendingAnswerSdp == null && pendingByeCallId == null) {
                sessionUUID = UUID.randomUUID().toString()
            } else {
                Log.i(TAG, "Preserving Verto sessid during active call recovery: callId=$currentCallId")
            }
            isLoggedIn = false
            lastFrameAt = System.currentTimeMillis()
            connecting = false
            emitStatus("connecting", "ws_upgraded")

            // Send verto.login
            sendVertoLogin(login, password, domain, displayName)

            // WebSocket keepalive every 30s: keeps NAT/carrier firewall bindings
            // open while the app is backgrounded so the socket never has to be
            // re-established on an incoming call.
            pingFuture?.cancel(false)
            pingFuture = executor.scheduleAtFixedRate({
                if (isLoggedIn && !isDestroyed) sendPing()
            }, 30, 30, TimeUnit.SECONDS)

            // Re-login just before the 1800s expiry so the FS-side registration
            // never lapses (was every 4 min). Cancel any previous timer to avoid orphaned timers.
            reLoginFuture?.cancel(false)
            reLoginFuture = executor.scheduleAtFixedRate({
                if (isLoggedIn && !isDestroyed) {
                    Log.i(TAG, "Re-login: refreshing Verto registration before 1800s expiry")
                    try { sendVertoLogin(login, password, domain, displayName) } catch (_: Exception) {}
                }
            }, 1_700, 1_700, TimeUnit.SECONDS)


            // Read loop
            readLoop(socket)

        } catch (e: Exception) {
            Log.e(TAG, "Verto WS error: ${e.message}")
            isLoggedIn = false
            connecting = false
            emitStatus("disconnected", e.message ?: "verto_ws_error")
            closeSocket()
            scheduleReconnect()
        }
    }

    private fun readLoop(socket: SSLSocket) {
        try {
            val input = socket.inputStream
            while (!isDestroyed && !socket.isClosed) {
                // Read WebSocket frame header (2 bytes minimum)
                val b0: Int
                val b1: Int
                try {
                    b0 = input.read()
                    b1 = input.read()
                } catch (_: SocketTimeoutException) {
                    // Any silence longer than 45s while logged in = force reconnect.
                    if (isLoggedIn && System.currentTimeMillis() - lastFrameAt < 45_000L) continue
                    if (isLoggedIn) throw Exception("Verto socket stale in background")
                    throw Exception("Verto read timeout before login")
                }
                if (b0 < 0 || b1 < 0) break
                lastFrameAt = System.currentTimeMillis()

                val isMasked = (b1 and 0x80) != 0
                var payloadLen = (b1 and 0x7F).toLong()

                payloadLen = when (payloadLen.toInt()) {
                    126 -> {
                        val ext = input.readExact(2)
                        ((ext[0].toInt() and 0xFF) shl 8 or (ext[1].toInt() and 0xFF)).toLong()
                    }
                    127 -> {
                        val ext = input.readExact(8)
                        var len = 0L
                        for (i in 0..7) len = (len shl 8) or (ext[i].toLong() and 0xFF)
                        len
                    }
                    else -> payloadLen
                }

                val maskKey = if (isMasked) input.readExact(4) else null
                val payload = input.readExact(payloadLen.toInt())
                if (maskKey != null) {
                    for (i in payload.indices) payload[i] = (payload[i].toInt() xor maskKey[i % 4].toInt()).toByte()
                }

                val opcode = b0 and 0x0F
                when (opcode) {
                    0x1 -> handleVertoMessage(String(payload, Charsets.UTF_8)) // text
                    0x8 -> { Log.i(TAG, "Verto WS close frame"); break }        // close
                    0x9 -> sendPong(payload)                                     // ping
                    0xA -> { /* pong */ }
                }
            }
        } catch (e: Exception) {
            if (!isDestroyed) Log.w(TAG, "Read loop ended: ${e.message}")
        }
        isLoggedIn = false
        connecting = false
        emitStatus("disconnected", "read_loop_ended")
        closeSocket()
        if (!isDestroyed) scheduleReconnect()
    }

    private fun readHttpHeader(socket: SSLSocket): String {
        val input = socket.inputStream
        val buffer = ByteArrayOutputStream()
        var previous3 = -1
        var previous2 = -1
        var previous1 = -1
        while (buffer.size() < 16_384) {
            val b = input.read()
            if (b < 0) break
            buffer.write(b)
            if (previous3 == '\r'.code && previous2 == '\n'.code && previous1 == '\r'.code && b == '\n'.code) break
            previous3 = previous2
            previous2 = previous1
            previous1 = b
        }
        return buffer.toString(Charsets.US_ASCII.name())
    }

    @Synchronized
    private fun sendFrame(text: String): Boolean {
        // @Synchronized (on `this`) prevents the race condition where outputStream
        // is set to null by closeSocket() between the null-check and the write.
        // closeSocket() is also @Synchronized so both operations are serialized.
        try {
            val payload = text.toByteArray(Charsets.UTF_8)
            val out = outputStream ?: return false
            // Client frames must be masked
            val mask = ByteArray(4).also { SecureRandom().nextBytes(it) }
            val masked = ByteArray(payload.size) { i -> (payload[i].toInt() xor mask[i % 4].toInt()).toByte() }

            val header = mutableListOf<Byte>()
            header.add(0x81.toByte()) // FIN + text opcode
            when {
                payload.size <= 125 -> header.add((0x80 or payload.size).toByte())
                payload.size <= 65535 -> {
                    header.add((0x80 or 126).toByte())
                    header.add((payload.size shr 8).toByte())
                    header.add((payload.size and 0xFF).toByte())
                }
                else -> {
                    header.add((0x80 or 127).toByte())
                    for (i in 7 downTo 0) header.add(((payload.size.toLong() shr (i * 8)) and 0xFF).toByte())
                }
            }
            header.addAll(mask.toList())
            out.write(header.toByteArray())
            out.write(masked)
            out.flush()
            return true
        } catch (e: Exception) {
            Log.w(TAG, "sendFrame failed: ${e.message} — closing socket to force reconnect")
            // Write half-close: mark logged out and close so readLoop dies and
            // a new WS is established before FreeSWITCH times out the invite.
            isLoggedIn = false
            try { sslSocket?.close() } catch (_: Exception) {}
            outputStream = null
            return false
        }
    }

    private fun sendPong(payload: ByteArray) {
        try {
            val out = outputStream ?: return
            val mask = ByteArray(4).also { SecureRandom().nextBytes(it) }
            val masked = ByteArray(payload.size) { i -> (payload[i].toInt() xor mask[i % 4].toInt()).toByte() }
            out.write(byteArrayOf(0x8A.toByte(), (0x80 or payload.size).toByte()))
            out.write(mask)
            out.write(masked)
            out.flush()
        } catch (e: Exception) { /* ignore */ }
    }

    @Synchronized
    private fun closeSocket() {
        // @Synchronized matches sendFrame's lock so closeSocket() cannot null
        // out outputStream while sendFrame is mid-write on another thread.
        try { sslSocket?.close() } catch (e: Exception) { /* ignore */ }
        sslSocket = null
        outputStream = null
    }

    private fun InputStream.readExact(size: Int): ByteArray {
        val buffer = ByteArray(size)
        var offset = 0
        while (offset < size) {
            val n = read(buffer, offset, size - offset)
            if (n < 0) throw Exception("WebSocket frame ended early")
            offset += n
        }
        return buffer
    }

    // ── Verto protocol ───────────────────────────────────────────────────────

    private fun sendVertoLogin(login: String, password: String, domain: String, displayName: String) {
        val msg = JSONObject().apply {
            put("jsonrpc", "2.0")
            put("id", 1)
            put("method", "login")
            put("params", JSONObject().apply {
                put("login", "$login@$domain")
                put("passwd", password)
                put("sessid", sessionUUID)
                // 30 min registration expiry (was 120s) → far fewer re-REGISTERs
                put("expires", 1800)
                put("loginParams", JSONObject().apply {
                    put("expires", 1800)
                })
                put("userVariables", JSONObject().apply {
                    put("email", login)
                    put("display_name", displayName)
                    put("expires", 1800)
                    put("sip-expires", 1800)
                })
            })

        }
        if (!sendFrame(msg.toString())) scheduleReconnect()
    }

    private fun sendPing() {
        if (!isLoggedIn) return
        try {
            lastPingAt = System.currentTimeMillis()
            val ping = JSONObject().apply {
                put("jsonrpc", "2.0")
                put("id", System.currentTimeMillis().toInt())
                put("method", "echo")
                put("params", JSONObject().apply {
                    put("sessid", sessionUUID)
                    put("keepalive", System.currentTimeMillis())
                })
            }
            if (!sendFrame(ping.toString())) {
                isLoggedIn = false
                emitStatus("disconnected", "ping_send_failed")
                closeSocket()
                scheduleReconnect()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Ping failed: ${e.message}")
            isLoggedIn = false
            emitStatus("disconnected", e.message ?: "ping_failed")
            closeSocket()
            scheduleReconnect()
        }
    }

    private fun handleVertoMessage(text: String) {
        try {
            val json = JSONObject(text)
            val method = json.optString("method")
            val result = json.optJSONObject("result")
            val id = if (json.has("id")) json.opt("id") else null

            if (method.isNotEmpty() && id != null) {
                sendFrame(JSONObject().apply {
                    put("jsonrpc", "2.0")
                    put("id", id)
                    put("result", JSONObject().apply { put("method", method) })
                }.toString())
            }

            // If this is a JSON-RPC result (not a notification) that carries a
            // SDP — which is how FreeSWITCH acknowledges our verto.answer on the
            // same Kotlin socket — relay it to the JS layer so the RTCPeerConnection
            // can call setRemoteDescription.
            if (result != null && result.has("sdp")) {
                Log.i(TAG, "Relaying JSON-RPC result with SDP to JS layer (sdpLen=${result.optString("sdp").length})")
                sendBroadcast(Intent(ACTION_VERTO_SERVER_MESSAGE).apply {
                    setPackage(packageName)
                    putExtra("raw", text)
                })
            }
            when {
                result != null && json.optInt("id") == 1 -> {
                    val sessid = result.optString("sessid")
                    val message = result.optString("message")
                    val loginOk = sessid.isNotEmpty() || message.lowercase().contains("logged in")
                    if (loginOk) {
                        isLoggedIn = true
                        connecting = false
                        lastLoginAt = System.currentTimeMillis()
                        reconnectAttempt = 0
                        reconnectFuture?.cancel(false)
                        Log.i(TAG, "Verto login SUCCESS — extension registered ✅")
                        emitStatus("registered", "login_ok")
                        handler.post { updateNotification("Connecté · Prêt à recevoir des appels") }
                        // Flush pending answer if user tapped Answer while WS was reconnecting
                        val pSdp = pendingAnswerSdp
                        val pParams = pendingAnswerParams ?: ""
                        if (pSdp != null && currentCallId != null) {
                            val sdpAgeMs = System.currentTimeMillis() - pendingAnswerSdpTs
                            Log.i(TAG, "Flushing queued verto.answer after login — SDP age: ${sdpAgeMs}ms")
                            // If SDP is older than 3s, notify JS to regenerate fresh ICE candidates
                            // before sending. The JS vertoProvider.answerInbound() will detect
                            // the stale SDP via __pendingAnswerTs and regenerate automatically.
                            if (sdpAgeMs > 3000) {
                                Log.w(TAG, "SDP is stale (${sdpAgeMs}ms) — JS will regenerate fresh ICE candidates")
                                // Emit a special status to trigger JS SDP refresh
                                emitStatus("sdp_refresh_needed", currentCallId ?: "")
                                // Give JS 800ms to regenerate SDP before sending verto.answer
                                Thread.sleep(800)
                            }
                            handleNativeAnswer(pSdp, pParams)
                        }
                        // Flush pending bye if user tapped Hangup while WS was reconnecting
                        val pBye = pendingByeCallId
                        if (pBye != null) {
                            Log.i(TAG, "Flushing queued verto.bye after login for callId=$pBye")
                            pendingByeCallId = null
                            try { sendFrame(buildVertoByeMessage(pBye)) } catch (_: Exception) {}
                            // If the bye is for the current call, clear call state now.
                            // If the service was restarted between hangup and reconnect,
                            // re-clear here.
                            if (pBye == currentCallId) {
                                currentCallId = null
                                currentCallerName = null
                                currentCallerNumber = null
                                currentInviteParams = null
                                currentCallActive = false
                                handler.post { stopRingtone() }
                                handler.post { clearCallNotifications() }
                                emitStatus("idle", "bye_flushed")
                            }
                        }
                    } else {
                        Log.e(TAG, "Verto login FAILED: $text")
                        isLoggedIn = false
                        connecting = false
                        emitStatus("error", "login_failed")
                        closeSocket()
                        scheduleReconnect()
                    }
                }
                method == "verto.invite" -> {
                    val params = json.optJSONObject("params")
                    // Use the raw number as display name when the PBX sends a generic
                    // name (empty, "unknown", or same as the number). This ensures the
                    // caller ID shows the actual extension/number in the UI.
                    val rawName = params?.optString("caller_id_name") ?: ""
                    val callerNumber = params?.optString("caller_id_number") ?: ""
                    val callerName = when {
                        rawName.isBlank() -> callerNumber.ifEmpty { "Appel entrant" }
                        rawName.equals("unknown", ignoreCase = true) -> callerNumber.ifEmpty { rawName }
                        rawName == callerNumber -> callerNumber
                        else -> rawName
                    }
                    val callId = params?.optString("callID") ?: ""
                    if (callId.isNotEmpty()) currentCallId = callId
                    currentCallActive = false
                    currentCallerName = callerName
                    currentCallerNumber = callerNumber
                    currentInviteParams = params?.toString()
                    Log.i(TAG, "Incoming call: $callerName <$callerNumber> callID=$callId")
                    try { AudioFocusHelper.requestCallAudioFocus(this) } catch (_: Exception) {}
                    emitStatus("incoming", "${callerName} <${callerNumber}>")
                    handler.post { showIncomingCallNotification(callerName, callerNumber) }
                    // The WS is currently alive (we just received this frame), so no
                    // reconnect is needed here. But reset the attempt counter so that
                    // if the socket dies between now and when the user taps Answer,
                    // the next scheduleReconnect() will use 0ms delay.
                    reconnectAttempt = 0
                }
                method == "verto.answer" || method == "verto.media" -> {
                    // Remote party answered an outbound call (or early media).
                    val params = json.optJSONObject("params")
                    val callId = extractCallId(params)
                    if (callId.isNotEmpty() && currentCallId == null) {
                        currentCallId = callId
                    }
                    currentCallActive = true
                    Log.i(TAG, "Outbound call answered: method=$method callID=$callId")
                    handler.post { stopRingtone() }
                    handler.post { showOngoingCallNotification(currentCallerNumber ?: currentCallerName ?: "Lemtel", false) }
                    emitStatus("active", "remote_${method.replace("verto.", "")}")
                    // Relay the raw JSON to the JS layer so the WebRTC PeerConnection
                    // receives the answer SDP and can complete media negotiation.
                    // This bridges the dual-WebSocket gap: the Kotlin WS receives the
                    // server response but the JS RTCPeerConnection lives in the WebView.
                    Log.i(TAG, "Relaying $method to JS layer (sdpLen=${params?.optString("sdp")?.length ?: 0})")
                    sendBroadcast(Intent(ACTION_VERTO_SERVER_MESSAGE).apply {
                        setPackage(packageName)
                        putExtra("raw", text)
                    })
                }
                method == "verto.bye" -> {
                    val byeCallId = extractCallId(json.optJSONObject("params"))
                    Log.i(TAG, "Remote hangup (verto.bye) callID=$byeCallId currentCallId=$currentCallId active=$currentCallActive")
                    // Relay verto.bye to JS so the UI hangup event fires even when
                    // the JS WebSocket is disconnected or on a different session.
                    Log.i(TAG, "Relaying verto.bye to JS layer for callID=$byeCallId")
                    sendBroadcast(Intent(ACTION_VERTO_SERVER_MESSAGE).apply {
                        setPackage(packageName)
                        putExtra("raw", text)
                    })
                    // Only reset state if this bye matches the current call (or is unscoped).
                    // Avoids a stale bye from a previous call clearing an active new call.
                    // If the app believes a call is active, also clear on an unmatched BYE:
                    // forked/sim-ring legs can arrive with a nested or sibling callID and the
                    // UI must not stay stuck when the PBX tears down the call.
                    if (byeCallId.isEmpty() || byeCallId == currentCallId || currentCallActive) {
                        currentCallId = null
                        currentCallerName = null
                        currentCallerNumber = null
                        currentInviteParams = null
                        currentCallActive = false
                        pendingAnswerSdp = null
                        pendingAnswerParams = null
                        pendingByeCallId = null
                        reconnectAttempt = 0
                        handler.post { stopRingtone() }
                        try { AudioFocusHelper.releaseCallAudioFocus(this) } catch (_: Exception) {}
                        handler.post { clearCallNotifications() }
                        emitStatus("idle", "remote_bye")
                    } else {
                        Log.w(TAG, "verto.bye ignored: byeCallId=$byeCallId != currentCallId=$currentCallId")
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse Verto message: ${e.message}")
        }
    }

    private fun scheduleReconnect() {
        scheduleReconnect(null)
    }

    /** Returns true when the service was started in JsSIP keepalive mode. */
    private fun isJsSipMode(): Boolean =
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_MODE, "verto") == "jssip"

    private fun scheduleReconnect(forcedDelayMs: Long?) {
        if (isDestroyed) return
        // In JsSIP mode the WebView owns the SIP connection — no native reconnect needed.
        if (isJsSipMode()) {
            Log.d(TAG, "scheduleReconnect: skipped (JsSIP mode)")
            return
        }
        // A forced 0ms reconnect (e.g. answer failure) must supersede any
        // pending back-off. Cancel first, then re-schedule.
        // For any other forced delay or null (exponential back-off), if a
        // reconnect is already scheduled, don't stack another one.
        if (forcedDelayMs != null && forcedDelayMs <= 0L) {
            reconnectFuture?.cancel(false)
        } else if (reconnectFuture?.isDone == false) return
        reconnectAttempt++
        val delay = forcedDelayMs ?: minOf(5_000L * reconnectAttempt, 30_000L)
        Log.i(TAG, "scheduleReconnect: delay=${delay}ms attempt=$reconnectAttempt forcedDelay=$forcedDelayMs")
        emitStatus("reconnecting", "delay=${delay}ms attempt=$reconnectAttempt")
        handler.post { updateNotification("Reconnexion en cours...") }
        reconnectFuture = executor.schedule({ if (!isDestroyed) connectVerto() }, delay, TimeUnit.MILLISECONDS)
    }

    private fun registerNetworkWatchdog() {
        try {
            connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (isJsSipMode()) {
                        Log.i(TAG, "Network available — JsSIP mode, no native Verto reconnect")
                        emitStatus("registered", "jssip_keepalive")
                        return
                    }
                    Log.i(TAG, "Network available — refreshing Verto registration")
                    if (!isDestroyed) {
                        if (!isLoggedIn && connecting) return
                        if (!isLoggedIn && sslSocket == null) {
                            emitStatus("reconnecting", "network_available_no_socket")
                            scheduleReconnect(1_000L)
                            return
                        }
                        isLoggedIn = false
                        emitStatus("reconnecting", "network_available_refresh")
                        closeSocket()
                        scheduleReconnect(1_000L)
                    }
                }

                override fun onLost(network: Network) {
                    if (isJsSipMode()) {
                        Log.i(TAG, "Network lost — JsSIP mode, keeping service alive")
                        emitStatus("disconnected", "network_lost_jssip")
                        return
                    }
                    Log.i(TAG, "Network lost — marking Verto offline")
                    isLoggedIn = false
                    emitStatus("disconnected", "network_lost")
                    closeSocket()
                    if (!isDestroyed) scheduleReconnect(5_000L)
                }
            }
            connectivityManager?.registerNetworkCallback(request, callback)
            networkCallback = callback
        } catch (e: Exception) {
            Log.w(TAG, "Network watchdog unavailable: ${e.message}")
        }
    }

    private fun unregisterNetworkWatchdog() {
        try {
            val cb = networkCallback ?: return
            connectivityManager?.unregisterNetworkCallback(cb)
        } catch (_: Exception) {
        } finally {
            networkCallback = null
        }
    }

    private fun emitStatus(status: String, reason: String? = null) {
        val now = System.currentTimeMillis()
        lastReason = reason ?: lastReason
        try {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
                putString(KEY_STATUS, status)
                putString(KEY_REASON, lastReason)
                putString("verto_current_call_id", currentCallId ?: "")
                putString("verto_current_caller_name", currentCallerName ?: "")
                putString("verto_current_caller_number", currentCallerNumber ?: "")
                putString("verto_current_invite_params", currentInviteParams ?: "")
                putLong(KEY_UPDATED_AT, now)
                putLong(KEY_LAST_LOGIN_AT, lastLoginAt)
                putLong(KEY_LAST_PING_AT, lastPingAt)
                putLong(KEY_LAST_FRAME_AT, lastFrameAt)
                putInt(KEY_RECONNECT_ATTEMPT, reconnectAttempt)
                putBoolean(KEY_CONNECTING, connecting)
                putBoolean(KEY_LOGGED_IN, isLoggedIn)
                putBoolean(KEY_WAKE_HELD, wakeLock?.isHeld == true)
                putBoolean(KEY_WIFI_HELD, wifiLock?.isHeld == true)
                apply()
            }
        } catch (_: Exception) {}

        try {
            sendBroadcast(Intent(ACTION_STATUS).apply {
                setPackage(packageName)
                putExtra("status", status)
                putExtra("reason", lastReason)
                putExtra("callId", currentCallId ?: "")
                putExtra("callerName", currentCallerName ?: "")
                putExtra("callerNumber", currentCallerNumber ?: "")
                putExtra("inviteParams", currentInviteParams ?: "")
                putExtra("updatedAt", now)
                putExtra("lastLoginAt", lastLoginAt)
                putExtra("lastPingAt", lastPingAt)
                putExtra("lastFrameAt", lastFrameAt)
                putExtra("reconnectAttempt", reconnectAttempt)
                putExtra("connecting", connecting)
                putExtra("loggedIn", isLoggedIn)
                putExtra("wakeLockHeld", wakeLock?.isHeld == true)
                putExtra("wifiLockHeld", wifiLock?.isHeld == true)
            })
        } catch (_: Exception) {}
    }

    // ── Notifications ────────────────────────────────────────────────────────

    private fun actionPendingIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(action).setPackage(packageName).setClass(this, CallActionReceiver::class.java)
        return PendingIntent.getBroadcast(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private var activeRingtone: android.media.Ringtone? = null

    private fun stopRingtone() {
        try { activeRingtone?.stop() } catch (_: Exception) {}
        activeRingtone = null
    }

    fun showIncomingCallNotification(callerName: String, callerNumber: String) {
        stopRingtone()
        try {
            val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
            val ringtone = android.media.RingtoneManager.getRingtone(applicationContext, uri)
            if (ringtone != null) {
                activeRingtone = ringtone
                ringtone.play()
                handler.postDelayed({ stopRingtone() }, 30_000)
            }
        } catch (_: Exception) {}
        val nm = getSystemService(NotificationManager::class.java)
        val fullScreen = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("incoming_call", true)
            putExtra("caller_number", callerNumber)
        }
        val fullScreenPI = PendingIntent.getActivity(
            this, INCOMING_CALL_NOTIFICATION_ID, fullScreen,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val answerPI  = actionPendingIntent(CallActionReceiver.ACTION_ANSWER,  110)
        val declinePI = actionPendingIntent(CallActionReceiver.ACTION_DECLINE, 111)

        val displayName = when {
            callerName.isNotEmpty() && callerNumber.isNotEmpty() && callerName != callerNumber -> "$callerName ($callerNumber)"
            callerNumber.isNotEmpty() -> callerNumber
            callerName.isNotEmpty() -> callerName
            else -> "Numéro inconnu"
        }
        val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setContentTitle("Appel entrant — $displayName")
            .setContentText("Appuyez pour répondre")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(fullScreenPI)
            .setFullScreenIntent(fullScreenPI, true)
            .setAutoCancel(true)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", declinePI)
            .addAction(android.R.drawable.ic_menu_call, "Répondre", answerPI)
            .build()
        nm.notify(INCOMING_CALL_NOTIFICATION_ID, notification)
    }

    fun dismissIncomingCallNotification() {
        stopRingtone()
        try { getSystemService(NotificationManager::class.java).cancel(INCOMING_CALL_NOTIFICATION_ID) } catch (_: Exception) {}
    }

    /**
     * Ongoing-call notification with Hangup / Hold / Resume actions so the user
     * can control an active call from the lockscreen or notification drawer.
     */
    fun showOngoingCallNotification(peerLabel: String, onHold: Boolean) {
        val nm = getSystemService(NotificationManager::class.java)
        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openPI = PendingIntent.getActivity(
            this, 120, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val hangupPI = actionPendingIntent(CallActionReceiver.ACTION_HANGUP, 121)
        val holdPI   = actionPendingIntent(
            if (onHold) CallActionReceiver.ACTION_RESUME else CallActionReceiver.ACTION_HOLD,
            122,
        )
        val builder = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setContentTitle(if (onHold) "En attente — Lemtel" else "Appel en cours — Lemtel")
            .setContentText(peerLabel)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(openPI)
            .setOngoing(true)
            .setSilent(true)
            .addAction(
                if (onHold) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause,
                if (onHold) "Reprendre" else "En attente",
                holdPI,
            )
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Raccrocher", hangupPI)
        nm.notify(INCOMING_CALL_NOTIFICATION_ID, builder.build())
    }

    fun clearCallNotifications() {
        try { getSystemService(NotificationManager::class.java).cancel(INCOMING_CALL_NOTIFICATION_ID) } catch (_: Exception) {}
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Lemtel Softphone")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Connexion SIP", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Maintien de la connexion téléphonique"
                    setShowBadge(false)
                }
            )
            nm.createNotificationChannel(
                NotificationChannel(CALL_CHANNEL_ID, "Appels entrants", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Notifications d'appels entrants"
                    setShowBadge(true)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 200, 500)
                    setSound(
                        android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE),
                        android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                }
            )
        }
    }

    // ── Notification-action → JsSIP relay ────────────────────────────────────
    // Android notification actions must never answer/hang up through the old
    // native Verto path. JsSIP owns all SIP signalling.

    private fun registerCallActionReceiver() {
        try {
            val filter = android.content.IntentFilter(CallActionReceiver.ACTION_CALL_ACTION_EVENT)
            filter.addAction(ACTION_REGISTER_OUTBOUND_CALL)
            val recv = object : android.content.BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    // All call control (answer / decline / hangup) is handled
                    // exclusively by JsSIP in JavaScript. The native layer only
                    // keeps the WakeLock, plays the ringtone, shows notifications
                    // and relays button taps to JS.
                    when (intent?.action) {
                        ACTION_REGISTER_OUTBOUND_CALL -> {
                            val callID = intent.getStringExtra("callID") ?: ""
                            val destination = intent.getStringExtra("destination") ?: ""
                            if (callID.isNotEmpty()) {
                                currentCallId = callID
                                currentCallerNumber = destination
                                currentCallerName = destination
                                Log.i(TAG, "Registered outbound call: callID=$callID dest=$destination")
                            }
                            return
                        }
                    }

                    // ACTION_CALL_ACTION_EVENT: notification button taps. JS owns
                    // the SIP signalling; natively we only stop the ringtone so the
                    // device goes quiet as soon as the user taps a button.
                    val action = intent?.getStringExtra(CallActionReceiver.EXTRA_ACTION) ?: return
                    Log.i(TAG, "Call action relayed to JS (no native signalling): $action")
                    if (action == "answer" || action == "decline" || action == "hangup") {
                        handler.post { stopRingtone() }
                    }
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(recv, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(recv, filter)
            }
            callActionReceiver = recv
        } catch (e: Exception) {
            Log.w(TAG, "registerCallActionReceiver failed: ${e.message}")
        }
    }

    private fun unregisterCallActionReceiver() {
        try { callActionReceiver?.let { unregisterReceiver(it) } } catch (_: Exception) {}
        callActionReceiver = null
    }


    @Volatile private var pendingAnswerSdp: String? = null
    @Volatile private var pendingAnswerParams: String? = null
    @Volatile private var pendingAnswerSdpTs: Long = 0L
    @Volatile private var pendingByeCallId: String? = null

    private fun handleNativeAnswer(sdp: String, dialogParamsJson: String) {
        val callId = currentCallId
        Log.i(TAG, "handleNativeAnswer: callId=$callId sdpLen=${sdp.length} isLoggedIn=$isLoggedIn hasOutputStream=${outputStream != null}")
        if (callId.isNullOrEmpty() || sdp.isEmpty()) {
            Log.w(TAG, "handleNativeAnswer: skipped — callId=$callId sdpEmpty=${sdp.isEmpty()}")
            return
        }
        handler.post { stopRingtone() }

        if (!isLoggedIn || outputStream == null) {
            Log.w(TAG, "verto.answer queued: isLoggedIn=$isLoggedIn outputStream=${outputStream != null}")
            pendingAnswerSdp = sdp
            pendingAnswerParams = dialogParamsJson
            pendingAnswerSdpTs = System.currentTimeMillis()
            // Reset attempt counter so reconnect fires with 0ms delay (not 5s).
            // FreeSWITCH only waits ~15s for verto.answer before hanging up.
            reconnectAttempt = 0
            if (!connecting) executor.submit { connectVerto() }
            return
        }

        try {
            val dialogParams = normalizedDialogParams(dialogParamsJson, callId)
            val params = JSONObject().apply {
                // FreeSWITCH Verto accepts callID in dialogParams, but forked
                // inbound calls are much more reliable when callID is also at
                // params.callID. Without it the write can succeed while the PBX
                // keeps ringing the other legs because the answer is not bound
                // to the original dialog.
                put("callID", callId)
                put("sessid", sessionUUID)
                put("sdp", sdp)
                put("dialogParams", dialogParams)
            }
            val msg = JSONObject().apply {
                put("jsonrpc", "2.0")
                put("id", System.currentTimeMillis().toInt())
                put("method", "verto.answer")
                put("params", params)
            }
            if (sendFrame(msg.toString())) {
                Log.i(TAG, "verto.answer sent successfully for callId=$callId")
                pendingAnswerSdp = null
                pendingAnswerParams = null
                currentCallActive = true
                handler.post { showOngoingCallNotification(currentCallerNumber ?: currentCallerName ?: "Lemtel", false) }
                emitStatus("active", "native_answer_sent")
            } else {
                Log.w(TAG, "sendFrame failed for verto.answer — queuing for reconnect")
                pendingAnswerSdp = sdp
                pendingAnswerParams = dialogParamsJson
                pendingAnswerSdpTs = System.currentTimeMillis()
                // Reconnect immediately (0ms) — do not use exponential back-off
                reconnectAttempt = 0
                scheduleReconnect(0L)
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleNativeAnswer failed: ${e.message}")
            emitStatus("error", e.message ?: "native_answer_failed")
        }
    }

    private fun buildVertoByeMessage(callId: String): String {
        val msg = JSONObject().apply {
            put("jsonrpc", "2.0")
            put("id", System.currentTimeMillis().toInt())
            put("method", "verto.bye")
            put("params", JSONObject().apply {
                put("callID", callId)
                put("sessid", sessionUUID)
                put("dialogParams", JSONObject().apply {
                    put("callID", callId)
                })
                put("cause", "NORMAL_CLEARING")
                put("causeCode", 16)
            })
        }
        return msg.toString()
    }

    private fun extractCallId(params: JSONObject?): String {
        if (params == null) return ""
        val direct = params.optString("callID", "")
        if (direct.isNotEmpty()) return direct
        val dialog = params.optJSONObject("dialogParams")
        val nested = dialog?.optString("callID", "") ?: ""
        if (nested.isNotEmpty()) return nested
        return ""
    }

    private fun normalizedDialogParams(dialogParamsJson: String, callId: String): JSONObject {
        val dialogParams = try {
            if (dialogParamsJson.isNotEmpty()) JSONObject(dialogParamsJson) else JSONObject()
        } catch (_: Exception) {
            JSONObject()
        }
        dialogParams.put("callID", dialogParams.optString("callID", callId).ifEmpty { callId })
        if (!dialogParams.has("caller_id_name")) dialogParams.put("caller_id_name", currentCallerName ?: currentCallerNumber ?: "")
        if (!dialogParams.has("caller_id_number")) dialogParams.put("caller_id_number", currentCallerNumber ?: currentCallerName ?: "")
        if (!dialogParams.has("destination_number")) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_LOGIN, "")
                ?.takeIf { it.isNotEmpty() }
                ?.let { dialogParams.put("destination_number", it) }
        }
        return dialogParams
    }
}
