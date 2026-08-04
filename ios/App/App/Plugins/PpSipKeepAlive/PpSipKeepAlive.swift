import Foundation
import Capacitor
import UIKit
import AVFoundation
import CryptoKit
import UserNotifications
import Network
import Security

/// Vrai lorsque le moteur PJSIP natif est linké : dans ce cas il détient
/// l'AOR `<ext>M` en TLS 5061 et la pile WSS de secours ne doit jamais
/// ré-enregistrer par-dessus (sinon le Contact TLS est remplacé côté NetSapiens).
var nativeEngineOwnsAor: Bool {
  #if canImport(pjsua)
  return true
  #else
  return false
  #endif
}

// Planiprêt-only. DO NOT reuse in Lemtel (Verto stack).
@objc(PpSipKeepAlive)
public class PpSipKeepAlive: CAPPlugin, CAPBridgedPlugin, URLSessionWebSocketDelegate {
    public let identifier = "PpSipKeepAlive"; public let jsName = "PpSipKeepAlive"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "startSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "stopSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "getSipServiceStatus", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "triggerReregister", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "acknowledgeIncoming", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "wakeForIncomingCall", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "setCallActive", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "declareJsOwnsAor", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "setAudioRoute", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "getAudioRoute", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]
    private var status = "idle"; private var reason = "plugin_loaded"; private var updatedAt = Date().timeIntervalSince1970 * 1000
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var host = ""; private var port = 443; private var path = "/"; private var login = ""; private var domain = ""; private var displayName = ""; private var password = ""
    private var socket: URLSessionWebSocketTask?
    /// Only true once the WSS handshake completed. Sending a REGISTER before
    /// that fails with POSIX 57 "Socket is not connected".
    private var socketOpen = false
    private var registerOnOpen = false
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    private var timer: Timer?
    private var cseq = 1
    private let callIdReg = UUID().uuidString + "@planipret-ios"
    private let fromTag = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)
    private var appActive = true
    private var reconnectAttempts = 0
    // Reconnection strategy pushed from JS (src/config/ppSipReconnect.json + VITE_PP_SIP_* env).
    private var backoffMinMs: Double = 4000
    private var backoffMaxMs: Double = 60000
    private var backoffMaxAttempts: Int = 5
    private var verifyDelayMs: Double = 8000
    private var registerExpires: Int = 1800
    // NetSapiens closes the socket when it sees two REGISTERs for the same AoR
    // back-to-back. Debounce every REGISTER for 2s after a 200 OK.
    private var lastRegisterOkTime: Date?
    private var lastRegisterSentTime: Date?
    private let registerDebounceSec: TimeInterval = 2.0
    private var reconnectPending = false
    private var backgroundHandoffWorkItem: DispatchWorkItem?
    private var pathMonitor: NWPathMonitor?
    private var networkUp = true
    private var lastPathChangeAt: Date?
    /// True while the WebView (JsSIP) has a live call. During a call the native
    /// stack must NEVER take the AOR over: doing so closes the JsSIP transport
    /// (WSS 1001) and kills the audio. We only keep the audio session alive.
    private var callActive = false
    /// True only while CallKit owns the activated AVAudioSession.
    private var callKitAudioActive = false
    /// Set on VoIP push wake: while an inbound call is pending we must never
    /// release the SIP registration (that sent the caller to voicemail).
    private var incomingPendingUntil: Date? = nil
    /// R3 (ring9): JsSIP (WebView) explicitly claimed the shared 113M AOR. The
    /// native stack must then stay off it — it can ring but has no media plan.
    private var jsOwnsAor = false
    private var pushGraceWorkItem: DispatchWorkItem? = nil
    /// "earpiece" | "speaker" | "bluetooth" — chosen by the user in the in-call UI.
    /// A phone call MUST start on the earpiece: WebKit WebRTC otherwise defaults
    /// to the loudspeaker as soon as the remote party answers.
    private var preferredRoute = "earpiece"
    private var audioKeepAliveTimer: Timer?
    private let configDefaultsKey = "pp_sip_native_config_v1"
    private let passwordService = "com.planipret.mobile.sip"
    private let passwordAccount = "background-register"
    private var lastPushWakeAt: Date?


    public override func load() {
      restoreConfig()
      DispatchQueue.main.async { [weak self] in self?.appActive = UIApplication.shared.applicationState != .background }
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
      // UIScene lifecycle (iOS 13+) — the app adopts scenes, so the legacy
      // UIApplication notifications are not always delivered. Only the actual
      // didEnterBackground transition may transfer SIP ownership. The transient
      // willDeactivate/willResignActive events also fire for CallKit, Control
      // Center and notification interruptions and previously caused handoff loops.
      if #available(iOS 13.0, *) {
        NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIScene.didActivateNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onSceneWillEnterForeground), name: UIScene.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
      }
      // Ask for notification permission so the incoming-call banner can ring.
      // PushKit (PpVoipCall) posts this when an incoming-call VoIP push lands:
      // this is the ONLY reliable iOS background wake, so re-REGISTER immediately
      // instead of relying on a long-lived WSS socket.
      NotificationCenter.default.addObserver(self, selector: #selector(onVoipPushWake(_:)), name: Notification.Name("PpVoipIncomingPush"), object: nil)
      // CallKit Answer tapped: hold the transport + audio session up so the
      // WebView can complete the SIP 200 OK while still in the background.
      NotificationCenter.default.addObserver(forName: Notification.Name("PpVoipCallAnswered"), object: nil, queue: .main) { [weak self] _ in
        guard let self = self else { return }
        self.beginBackgroundTask()
      }
      NotificationCenter.default.addObserver(forName: Notification.Name("PpCallKitAudioActivated"), object: nil, queue: .main) { [weak self] _ in
        self?.callKitAudioActive = true
        self?.applyAudioRoute()
      }
      NotificationCenter.default.addObserver(forName: Notification.Name("PpCallKitAudioDeactivated"), object: nil, queue: .main) { [weak self] _ in
        self?.callKitAudioActive = false
      }
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil) }

    @objc func startSipService(_ call: CAPPluginCall) {
      if nativeEngineOwnsAor {
        NSLog("[PpSipKeepAlive] startSipService skipped — PJSIP owns the AOR")
        releaseRegistration("pjsip_owns_aor")
        call.resolve(["ok": true, "status": "protected", "reason": "pjsip_owns_aor"])
        return
      }
      host = call.getString("host") ?? call.getString("domain") ?? ""; port = call.getInt("port") ?? 443; path = call.getString("path") ?? "/"

      login = call.getString("login") ?? call.getString("username") ?? call.getString("extension") ?? ""
      domain = call.getString("domain") ?? ""; displayName = call.getString("displayName") ?? login; password = call.getString("password") ?? ""
      backoffMinMs = max(4000, Double(call.getInt("backoffMinMs") ?? 4000))
      backoffMaxMs = Double(call.getInt("backoffMaxMs") ?? 60000)
      backoffMaxAttempts = call.getInt("backoffMaxAttempts") ?? 5
      verifyDelayMs = Double(call.getInt("verifyDelayMs") ?? 8000)
      registerExpires = call.getInt("registerExpiresSec") ?? 1800
      persistConfig()
      NSLog("[PpSipKeepAlive] reconnect strategy min=%.0fms max=%.0fms attempts=%d verify=%.0fms expires=%ds", backoffMinMs, backoffMaxMs, backoffMaxAttempts, verifyDelayMs, registerExpires)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false, "status": "error", "reason": "plugin_released"]); return }
        self.activateAudioSession()
        // Only ONE SIP registration per AOR: while the app is in the foreground the
        // JsSIP web layer owns the registration. Registering natively at the same
        // time made NetSapiens close the JsSIP socket (1001), producing an endless
        // disconnect/reconnect loop. Store the credentials and stay idle instead.
        // Same rule during an ACTIVE call: the WebView owns the media + transport.
        if self.callActive { self.setStatus("protected", "call_active_js_owns"); call.resolve(self.snapshot(ok: true)); return }
        if self.isForeground() { self.releaseRegistration("foreground_js_owns") } else { self.beginNativeOwnership("service_start") }
        call.resolve(self.snapshot(ok: true))
      }
    }
    /// JS marks the call lifecycle. While a call is up we keep the audio session
    /// active in background (WebKit otherwise interrupts it => one-way / no audio)
    /// and never take the SIP AOR over.
    @objc func setCallActive(_ call: CAPPluginCall) {
      let active = call.getBool("active") ?? false
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.callActive = active
        if active {
          self.beginBackgroundTask()
          self.activateAudioSession()
          self.startAudioKeepAlive()
          // Never hold a second transport while the WebView carries the call.
          self.backgroundHandoffWorkItem?.cancel(); self.backgroundHandoffWorkItem = nil
          if self.socket != nil { self.releaseRegistration("call_active_js_owns") }
        } else {
          self.incomingPendingUntil = nil
          self.stopAudioKeepAlive()
        }
        call.resolve(self.snapshot(ok: true))
      }
    }
    private func startAudioKeepAlive() {
      audioKeepAliveTimer?.invalidate()
      audioKeepAliveTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
        guard let self = self, self.callActive else { return }
        // Never touch a CallKit-owned session from a timer.
        if self.callKitAudioActive { return }
        self.activateAudioSession()
      }
    }
    private func stopAudioKeepAlive() { audioKeepAliveTimer?.invalidate(); audioKeepAliveTimer = nil }

    @objc func setAudioRoute(_ call: CAPPluginCall) {
      let route = call.getString("route") ?? "earpiece"
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.preferredRoute = route
        self.activateAudioSession()
        self.applyAudioRoute()
        call.resolve(["ok": true, "route": self.preferredRoute])
      }
    }

    @objc func getAudioRoute(_ call: CAPPluginCall) {
      DispatchQueue.main.async { [weak self] in
        call.resolve(["ok": true, "route": self?.currentAudioRoute() ?? "earpiece"])
      }
    }

    private func currentAudioRoute() -> String {
      let outs = AVAudioSession.sharedInstance().currentRoute.outputs
      if outs.contains(where: { $0.portType == .bluetoothHFP || $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE }) { return "bluetooth" }
      if outs.contains(where: { $0.portType == .builtInSpeaker }) { return "speaker" }
      return "earpiece"
    }

    private func applyAudioRoute() {
      let s = AVAudioSession.sharedInstance()
      switch preferredRoute {
      case "speaker":
        try? s.overrideOutputAudioPort(.speaker)
      case "bluetooth":
        try? s.overrideOutputAudioPort(.none)
        if let bt = s.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) { try? s.setPreferredInput(bt) }
      default:
        try? s.overrideOutputAudioPort(.none)
      }
    }

    @objc func stopSipService(_ call: CAPPluginCall) {
      DispatchQueue.main.async {
        if let until = self.incomingPendingUntil, until > Date() {
          NSLog("[PpSipKeepAlive] stopSipService ignored: inbound call pending")
          self.setStatus("protected", "incoming_pending")
          call.resolve(self.snapshot(ok: true)); return
        }
        self.releaseRegistration("stopped"); call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func getSipServiceStatus(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.snapshot(ok: true)) } }
    @objc func triggerReregister(_ call: CAPPluginCall) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false, "status": "error", "reason": "plugin_released"]); return }
        if self.isForeground() { self.releaseRegistration("foreground_js_owns") } else { self.sendRegister(challenge: nil); self.notifyListeners("sipReregisterRequested", data: ["reason": "manual"]) }
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func acknowledgeIncoming(_ call: CAPPluginCall) {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["pp_incoming_call"])
      call.resolve(["ok": true])
    }
    /// R3 (ring9): explicit JS ownership signal for the shared AOR. Unlike
    /// releaseRegistration("..._js_owns") this is never refused while ringing.
    @objc func declareJsOwnsAor(_ call: CAPPluginCall) {
      let owns = call.getBool("owns") ?? true
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.jsOwnsAor = owns
        NSLog("[PpSipKeepAlive] jsOwnsAor=%@", owns ? "true" : "false")
        if owns {
          // JsSIP holds the 113M binding: cancel our fallback REGISTER and drop
          // our own socket so NetSapiens never sees two transports on one AOR.
          self.pushGraceWorkItem?.cancel(); self.pushGraceWorkItem = nil
          self.timer?.invalidate(); self.timer = nil
          self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil
          self.setStatus("protected", "js_owns_aor")
        }
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func wakeForIncomingCall(_ call: CAPPluginCall) {
      let why = call.getString("reason") ?? "js"
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false]); return }
        self.wakeForPush(why)
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc private func onVoipPushWake(_ note: Notification) {
      DispatchQueue.main.async { [weak self] in
        self?.incomingPendingUntil = Date().addingTimeInterval(45)
        self?.wakeForPush("voip_push")
      }
    }
    /// Immediate, debounce-free REGISTER triggered by a VoIP push. Apple only
    /// guarantees background execution through PushKit, so this is the path that
    /// must bring the AOR back before the PBX times out to voicemail.
    private func wakeForPush(_ why: String) {
      if nativeEngineOwnsAor {
        NSLog("[PpSipKeepAlive] VoIP push wake skipped — PJSIP owns the AOR")
        releaseRegistration("pjsip_owns_aor")
        return
      }
      // PushKit can wake iOS before the WebView has loaded. Restore the last
      // confirmed SIP configuration so REGISTER never depends on JS startup.
      if host.isEmpty || login.isEmpty || domain.isEmpty { restoreConfig() }
      guard !host.isEmpty, !login.isEmpty, !domain.isEmpty, !password.isEmpty else {
        setStatus("error", "missing_persisted_sip_config")
        notifyListeners("sipReregisterRequested", data: ["reason": "missing_persisted_sip_config"])
        return
      }
      if let previous = lastPushWakeAt, Date().timeIntervalSince(previous) < 1.0 { return }
      lastPushWakeAt = Date()
      NSLog("[PpSipKeepAlive] VoIP push wake (%@)", why)
      beginBackgroundTask()
      activateAudioSession()
      lastRegisterOkTime = nil
      lastRegisterSentTime = nil
      if isForeground() {
        notifyListeners("sipReregisterRequested", data: ["reason": "voip_push"])
        return
      }
      // R4 (ring9): give JsSIP a 1.5s grace window to claim the AOR before we
      // fall back to a native REGISTER. Do NOT lengthen it: NetSapiens only forks
      // the INVITE to devices already registered at fork time.
      jsOwnsAor = false
      setStatus(status == "registered" ? "registered" : "protected", "voip_push_wake")
      pushGraceWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        if self.jsOwnsAor { NSLog("[PpSipKeepAlive] push grace: JS owns AOR - skipping native REGISTER"); return }
        if self.isForeground() || self.callActive { return }
        if self.socket == nil { self.connect() } else { self.sendRegister(challenge: nil, force: true) }
      }
      pushGraceWorkItem = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    private func persistConfig() {
      UserDefaults.standard.set([
        "host": host, "port": port, "path": path, "login": login,
        "domain": domain, "displayName": displayName,
        "backoffMinMs": backoffMinMs, "backoffMaxMs": backoffMaxMs,
        "backoffMaxAttempts": backoffMaxAttempts, "verifyDelayMs": verifyDelayMs,
        "registerExpires": registerExpires,
      ], forKey: configDefaultsKey)
      let data = Data(password.utf8)
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: passwordService,
        kSecAttrAccount as String: passwordAccount,
      ]
      SecItemDelete(query as CFDictionary)
      var add = query
      add[kSecValueData as String] = data
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      SecItemAdd(add as CFDictionary, nil)
    }

    private func restoreConfig() {
      if let saved = UserDefaults.standard.dictionary(forKey: configDefaultsKey) {
        host = saved["host"] as? String ?? host
        port = saved["port"] as? Int ?? port
        path = saved["path"] as? String ?? path
        login = saved["login"] as? String ?? login
        domain = saved["domain"] as? String ?? domain
        displayName = saved["displayName"] as? String ?? displayName
        backoffMinMs = saved["backoffMinMs"] as? Double ?? backoffMinMs
        backoffMaxMs = saved["backoffMaxMs"] as? Double ?? backoffMaxMs
        backoffMaxAttempts = saved["backoffMaxAttempts"] as? Int ?? backoffMaxAttempts
        verifyDelayMs = saved["verifyDelayMs"] as? Double ?? verifyDelayMs
        registerExpires = saved["registerExpires"] as? Int ?? registerExpires
      }
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: passwordService,
        kSecAttrAccount as String: passwordAccount,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var item: CFTypeRef?
      if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
         let data = item as? Data,
         let savedPassword = String(data: data, encoding: .utf8) {
        password = savedPassword
      }
    }

    // NEVER touch UIApplication/UIScene off the main thread: it triggers
    // "UI API called on a background thread" and can deadlock (DispatchQueue.main.sync).
    // The cached appActive flag is refreshed only from main-thread notifications.
    private func isForeground() -> Bool {
      if Thread.isMainThread {
        appActive = UIApplication.shared.applicationState != .background
        return appActive
      }
      return appActive
    }
    @objc private func onSceneWillEnterForeground() { onForeground() }
    private func releaseRegistration(_ why: String) {
      if !Thread.isMainThread { DispatchQueue.main.async { [weak self] in self?.releaseRegistration(why) }; return }
      // Arm the ownership flag BEFORE the refusal point: during a ringing call we
      // must still record that JS owns the AOR, even though we refuse to tear the
      // socket down (ringlock1 guard — never remove it).
      if why.hasSuffix("js_owns") { jsOwnsAor = true }
      if let until = incomingPendingUntil, until > Date() {
        NSLog("[PpSipKeepAlive] releaseRegistration refused (%@): inbound call pending", why)
        setStatus("protected", "incoming_pending")
        return
      }
      pushGraceWorkItem?.cancel(); pushGraceWorkItem = nil
      backgroundHandoffWorkItem?.cancel(); backgroundHandoffWorkItem = nil
      timer?.invalidate(); timer = nil
      socket?.cancel(with: .goingAway, reason: nil); socket = nil
      endBackgroundTask(); setStatus("idle", why)
    }

    @objc private func onBackground() {
      appActive = false
      beginBackgroundTask()
      activateAudioSession()
      // During an active call the WebView keeps the media: only keep the audio
      // session alive, never flip to native ownership (that closed the JsSIP
      // transport with WSS 1001 and killed the audio).
      if callActive {
        startAudioKeepAlive()
        setStatus("protected", "call_active_audio_kept")
        backgroundHandoffWorkItem?.cancel(); backgroundHandoffWorkItem = nil
        return
      }
      setStatus("protected", "background_handoff_pending")
      backgroundHandoffWorkItem?.cancel()
      // JS owns the ordering: it unregisters/stops JsSIP before calling
      // startSipService. Starting here first creates two transports for the same
      // NetSapiens device AOR and the SBC closes one with WebSocket code 1001.
    }

    @objc private func onForeground() {
      appActive = true
      // Keep the last confirmed native Contact until JS reports its own
      // REGISTER 200 and explicitly calls stopSipService. Closing here created
      // a zero-Contact window where NetSapiens followed the voicemail rule.
      notifyListeners("sipReregisterRequested", data: ["reason": "enter_foreground"])
    }

    private func beginNativeOwnership(_ why: String) {
      guard !isForeground() else { releaseRegistration("foreground_js_owns"); return }
      connect()
      scheduleRegister()
      if socket != nil, status != "registered" { sendRegister(challenge: nil) }
      setStatus(status == "registered" ? "registered" : "protected", why)
    }

    private func activateAudioSession() {
      let s = AVAudioSession.sharedInstance()
      // ring16: once CallKit has activated the session it owns category, mode
      // and activation. Re-applying setCategory (the 2s keep-alive did it over
      // and over) makes iOS re-arbitrate the route and drop every output —
      // that is the measured 'hadOutputs=n' silence. Only re-assert the route.
      if callKitAudioActive {
        if s.category != .playAndRecord || s.mode != .voiceChat {
          try? s.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        }
        applyAudioRoute()
        NSLog("[PpSipKeepAlive] audio owned by CallKit outputs=%d", s.currentRoute.outputs.count)
        return
      }
      // During a live call we must own the session exclusively: .mixWithOthers
      // lets WebKit interrupt it when the app goes background (no audio at all).
      let opts: AVAudioSession.CategoryOptions = callActive
        ? [.allowBluetoothHFP, .allowBluetoothA2DP]
        : [.allowBluetoothHFP, .allowBluetoothA2DP, .mixWithOthers]
      try? s.setCategory(.playAndRecord, mode: .voiceChat, options: opts)
      // Foreground in-app calls do not pass through CXProvider.didActivate.
      if !callKitAudioActive { try? s.setActive(true, options: []) }
      // Re-assert the user's choice: activating the session resets the override
      // and iOS would fall back to the loudspeaker mid-call.
      applyAudioRoute()
    }
    private func connect() {
      // A new socket means a new AoR binding: clear the 200 OK debounce.
      lastRegisterOkTime = nil
      guard !host.isEmpty else { setStatus("error", "missing_host"); return }
      startPathMonitor()
      if isForeground() { return }
      if callActive { return }
      if socket != nil { return }
      var comps = URLComponents(); comps.scheme = port == 80 ? "ws" : "wss"; comps.host = host; comps.port = port; comps.path = path.isEmpty ? "/" : path
      guard let url = comps.url else { setStatus("error", "bad_ws_url"); return }
      var req = URLRequest(url: url); req.setValue("sip", forHTTPHeaderField: "Sec-WebSocket-Protocol")
      socketOpen = false
      registerOnOpen = true
      socket = session.webSocketTask(with: req); socket?.resume(); setStatus("connecting", "ws_connecting"); receiveLoop()
      // Safety net: if didOpen never fires within 10s, drop the socket and let
      // the reconnect watchdog take over. No REGISTER is sent in that case.
      let pending = socket
      DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) { [weak self] in
        guard let self = self, let pending = pending, pending === self.socket, !self.socketOpen else { return }
        NSLog("[PpSipKeepAlive] ws open timeout - cancelling socket")
        self.registerOnOpen = false
        self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil
        self.setStatus("reconnecting", "ws_open_timeout"); self.scheduleReconnect("ws_open_timeout")
      }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, webSocketTask === self.socket else { return }
        self.socketOpen = true
        NSLog("[PpSipKeepAlive] ws open")
        if self.registerOnOpen { self.registerOnOpen = false; self.sendRegister(challenge: nil, force: true) }
      }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self, webSocketTask === self.socket else { return }
        self.socketOpen = false
        self.socket = nil
        NSLog("[PpSipKeepAlive] ws closed code=%ld", closeCode.rawValue)
        if !self.isForeground() { self.setStatus("reconnecting", "ws_closed"); self.scheduleReconnect("ws_closed") }
      }
    }
    private func scheduleRegister() {
      timer?.invalidate()
      // Refresh once near expiry, not every minute. NetSapiens treats repeated
      // REGISTER handshakes on one AOR as competing bindings.
      let refreshInterval = max(60.0, Double(registerExpires) * 0.8)
      timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in self?.sendRegister(challenge: nil) }
      if let timer = timer { RunLoop.main.add(timer, forMode: .common) }
    }
    private func receiveLoop() {
      socket?.receive { [weak self] result in
        guard let self = self else { return }
        switch result {
        case .success(let message):
          self.reconnectAttempts = 0
          if case .string(let text) = message { self.handle(text) }
          self.receiveLoop()
        case .failure(let err):
          self.socket = nil
          self.socketOpen = false
          if self.isForeground() { self.setStatus("idle", "foreground_js_owns") }
          else {
            NSLog("[PpSipKeepAlive] socket closed: %@", String(describing: err))
            self.setStatus("reconnecting", "ws_closed")
            self.scheduleReconnect("ws_closed")
          }
        }
      }
    }

    /// Exponential backoff (2s → 60s cap) until the socket is back and REGISTER succeeds.
    private func scheduleReconnect(_ why: String) {
      if reconnectPending { return }
      reconnectPending = true
      reconnectAttempts = min(reconnectAttempts + 1, max(1, backoffMaxAttempts))
      let delay = min(backoffMaxMs / 1000.0, (backoffMinMs / 1000.0) * pow(2.0, Double(reconnectAttempts - 1)))
      NSLog("[PpSipKeepAlive] reconnect in %.0fs (%@)", delay, why)
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self = self else { return }
        self.reconnectPending = false
        if self.isForeground() { self.setStatus("idle", "foreground_js_owns"); return }
        guard self.networkUp else { self.setStatus("reconnecting", "network_down"); self.scheduleReconnect("network_down"); return }
        self.connect()
        DispatchQueue.main.asyncAfter(deadline: .now() + self.verifyDelayMs / 1000.0) { [weak self] in
          guard let self = self else { return }
          if self.status != "registered" && !self.isForeground() { self.scheduleReconnect("still_unregistered") }
        }
      }
    }

    private func startPathMonitor() {
      if pathMonitor != nil { return }
      let m = NWPathMonitor()
      m.pathUpdateHandler = { [weak self] path in
        guard let self = self else { return }
        let up = path.status == .satisfied
        let wasUp = self.networkUp
        if up == wasUp { return }
        if let last = self.lastPathChangeAt, Date().timeIntervalSince(last) < 2.0 { return }
        self.lastPathChangeAt = Date()
        self.networkUp = up
        NSLog("[PpSipKeepAlive] network %@", up ? "available" : "lost")
        if up {
          self.reconnectAttempts = 0
          DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.isForeground() else { return }
            self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil; self.socketOpen = false
            self.connect()
          }
        } else {
          self.setStatus("reconnecting", "network_lost")
        }
      }
      m.start(queue: DispatchQueue.global(qos: .utility))
      pathMonitor = m
    }

    private func handle(_ msg: String) {
      // A 401/407 only authenticates REGISTER when the response CSeq says so.
      // NetSapiens can challenge OPTIONS too; treating that as a REGISTER
      // challenge created a REGISTER → OPTIONS → 407 → REGISTER loop every 3s.
      let responseCSeq = (headerVal(msg, "CSeq") ?? "").uppercased()
      if (msg.hasPrefix("SIP/2.0 401") || msg.hasPrefix("SIP/2.0 407")) && responseCSeq.contains("REGISTER") {
        let isProxyAuth = msg.hasPrefix("SIP/2.0 407")
        sendRegister(challenge: headerVal(msg, isProxyAuth ? "Proxy-Authenticate" : "WWW-Authenticate"), proxyAuth: isProxyAuth)
        return
      }
      if msg.hasPrefix("SIP/2.0 200") && msg.uppercased().contains(" REGISTER") {
        lastRegisterOkTime = Date()
        setStatus("registered", "native_register_200")
        // NetSapiens accepts OPTIONS only after the dialog settles; too early can close WSS with 1001.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in self?.sendOptionsPing() }
        return
      }
      if msg.hasPrefix("INVITE ") {
        setStatus("registered", "incoming_invite")
        let fromHdr = headerVal(msg, "From") ?? ""
        let toHdr = headerVal(msg, "To") ?? ""
        let viaHdr = headerVal(msg, "Via") ?? ""
        let cidHdr = headerVal(msg, "Call-ID") ?? ""
        let cseqHdr = headerVal(msg, "CSeq") ?? ""
        let fromDisplay = parseDisplay(fromHdr)
        let fromUser = parseUser(fromHdr)
        sendRinging(via: viaHdr, from: fromHdr, to: toHdr, cid: cidHdr, cseq: cseqHdr)
        notifyListeners("sipIncomingInvite", data: [
          "callId": cidHdr, "from": fromHdr, "fromUser": fromUser, "fromDisplay": fromDisplay
        ])
        showIncomingCallBanner(callId: cidHdr, label: fromDisplay.isEmpty ? (fromUser.isEmpty ? "Appel entrant" : fromUser) : fromDisplay)
      }
    }

    private func sendRinging(via: String, from: String, to: String, cid: String, cseq: String) {
      guard socket != nil, !via.isEmpty, !cid.isEmpty else { return }
      let toWithTag = to.contains(";tag=") ? to : to + ";tag=" + String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)
      var r = "SIP/2.0 180 Ringing\r\n"
      r += "Via: " + via + "\r\n"
      r += "From: " + from + "\r\n"
      r += "To: " + toWithTag + "\r\n"
      r += "Call-ID: " + cid + "\r\n"
      r += "CSeq: " + cseq + "\r\n"
      r += "User-Agent: Planipret iOS KeepAlive\r\n"
      r += "Content-Length: 0\r\n\r\n"
      socket?.send(.string(r)) { _ in }
    }

    private func showIncomingCallBanner(callId: String, label: String) {
      let content = UNMutableNotificationContent()
      content.title = "Appel entrant"
      content.body = label
      if #available(iOS 15.2, *) { content.sound = UNNotificationSound.defaultRingtone } else { content.sound = UNNotificationSound.default }
      if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
      content.categoryIdentifier = "PP_INCOMING_CALL"
      content.userInfo = ["pp_call_id": callId, "pp_incoming_call": true]
      let req = UNNotificationRequest(identifier: "pp_incoming_call", content: content, trigger: nil)
      UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    /// OPTIONS keep-alive sent right after the REGISTER 200 OK (never before:
    /// an un-authenticated OPTIONS makes NetSapiens close the socket).
    private func sendOptionsPing() {
      guard let sock = socket, status == "registered", !domain.isEmpty else { return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      var sip = "OPTIONS sip:" + domain + " SIP/2.0\r\n"
      sip += "Via: SIP/2.0/WSS " + domain + ";branch=" + branch + "\r\n"
      sip += "From: <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\r\n"
      sip += "To: <sip:" + domain + ">\r\n"
      sip += "Call-ID: " + UUID().uuidString + "@planipret-ios\r\n"
      sip += "CSeq: " + String(seq) + " OPTIONS\r\n"
      sip += "Max-Forwards: 70\r\nUser-Agent: Planipret iOS KeepAlive\r\nContent-Length: 0\r\n\r\n"
      sock.send(.string(sip)) { err in
        if let e = err { NSLog("[PpSipKeepAlive] OPTIONS ping failed: %@", String(describing: e)) }
      }
    }

    private func sendRegister(challenge: String?, proxyAuth: Bool = false, force: Bool = false) {
      if isForeground() { releaseRegistration("foreground_js_owns"); return }
      if socket == nil { connect(); return }
      if !socketOpen {
        registerOnOpen = true
        if !force { NSLog("[PpSipKeepAlive] REGISTER skipped: ws_not_open") }
        return
      }
      // Two REGISTERs in a row on the same WSS connection make NetSapiens see a
      // duplicate AoR and close the socket. Hold off after each send/200 OK
      // (auth challenge responses are exempt: they complete the same handshake).
      if !force, challenge == nil, let sentAt = lastRegisterSentTime, Date().timeIntervalSince(sentAt) <= registerDebounceSec {
        NSLog("[PpSipKeepAlive] REGISTER debounced: %.2fs since sent (min %.1fs)", Date().timeIntervalSince(sentAt), registerDebounceSec)
        return
      }
      if !force, challenge == nil, let okAt = lastRegisterOkTime, Date().timeIntervalSince(okAt) <= registerDebounceSec {
        NSLog("[PpSipKeepAlive] REGISTER debounced: %.2fs since 200 OK (min %.1fs)", Date().timeIntervalSince(okAt), registerDebounceSec)
        return
      }
      guard !login.isEmpty, !domain.isEmpty else { setStatus("error", "missing_credentials"); return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      let contact = "<sip:" + login + "@" + stableContactHost() + ";transport=wss>"
      var sip = "REGISTER sip:" + domain + " SIP/2.0\r\n"
      sip += "Via: SIP/2.0/WSS " + domain + ";branch=" + branch + "\r\nMax-Forwards: 70\r\n"
      sip += "To: <sip:" + login + "@" + domain + ">\r\nFrom: \"" + displayName.replacingOccurrences(of: "\"", with: "") + "\" <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\r\n"
      sip += "Call-ID: " + callIdReg + "\r\nCSeq: " + String(seq) + " REGISTER\r\nContact: " + contact + ";expires=" + String(registerExpires) + "\r\nExpires: " + String(registerExpires) + "\r\nUser-Agent: Planipret iOS KeepAlive\r\nSupported: outbound,path,gruu\r\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\r\n"
      if let ch = challenge, !password.isEmpty { sip += (proxyAuth ? "Proxy-Authorization: " : "Authorization: ") + digest(challenge: ch) + "\r\n" }
      sip += "Content-Length: 0\r\n\r\n"
      socket?.send(.string(sip)) { [weak self] err in
        DispatchQueue.main.async {
          guard let self = self else { return }
          if err == nil {
            self.lastRegisterSentTime = Date()
            self.setStatus("connecting", challenge == nil ? "register_sent" : "register_auth_sent")
          } else {
            NSLog("[PpSipKeepAlive] REGISTER send failed: %@", String(describing: err))
            self.socket?.cancel(with: .abnormalClosure, reason: nil)
            self.socket = nil
            self.setStatus("reconnecting", "register_send_failed")
            self.scheduleReconnect("register_send_failed")
          }
        }
      }
    }

    private func stableContactHost() -> String {
      // RFC-routable Contact host: always the real SIP domain (never .invalid)
      return domain.isEmpty ? "planipret.ca" : domain
    }

    private func digest(challenge: String) -> String { let m = parseDigest(challenge); let realm = m["realm"] ?? domain; let nonce = m["nonce"] ?? ""; let qop = m["qop"] ?? ""; let uri = "sip:" + domain; let nc = "00000001"; let cnonce = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16); let ha1 = md5(login + ":" + realm + ":" + password); let ha2 = md5("REGISTER:" + uri); let response = qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); var out = "Digest username=\"" + login + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + uri + "\", response=\"" + response + "\", algorithm=MD5"; if qop.contains("auth") { out += ", qop=auth, nc=" + nc + ", cnonce=\"" + cnonce + "\"" }; if let opaque = m["opaque"] { out += ", opaque=\"" + opaque + "\"" }; return out }
    private func parseDigest(_ h: String) -> [String:String] { var out: [String:String] = [:]; let s = h.replacingOccurrences(of: "Digest ", with: "", options: .caseInsensitive); for part in s.split(separator: ",") { let pieces = part.split(separator: "=", maxSplits: 1); if pieces.count == 2 { var v = pieces[1].trimmingCharacters(in: .whitespaces); if v.hasPrefix("\"") && v.hasSuffix("\"") { v.removeFirst(); v.removeLast() }; out[pieces[0].trimmingCharacters(in: .whitespaces)] = v } }; return out }
    private func headerVal(_ msg: String, _ name: String) -> String? { for line in msg.components(separatedBy: .newlines) { if line.lowercased().hasPrefix(name.lowercased() + ":") { return String(line.dropFirst(name.count + 1)).trimmingCharacters(in: .whitespaces) } }; return nil }
    private func parseDisplay(_ hdr: String) -> String { guard let lt = hdr.firstIndex(of: "<") else { return "" }; var d = String(hdr[..<lt]).trimmingCharacters(in: .whitespaces); if d.hasPrefix("\"") && d.hasSuffix("\"") { d.removeFirst(); d.removeLast() }; return d }
    private func parseUser(_ hdr: String) -> String { var uri = hdr; if let lt = hdr.firstIndex(of: "<"), let gt = hdr[lt...].firstIndex(of: ">") { uri = String(hdr[hdr.index(after: lt)..<gt]) }; if uri.hasPrefix("sip:") { uri = String(uri.dropFirst(4)) } else if uri.hasPrefix("sips:") { uri = String(uri.dropFirst(5)) }; if let at = uri.firstIndex(of: "@") { uri = String(uri[..<at]) }; if let semi = uri.firstIndex(of: ";") { uri = String(uri[..<semi]) }; return uri }
    private func md5(_ s: String) -> String { let d = Insecure.MD5.hash(data: Data(s.utf8)); return d.map { String(format: "%02hhx", $0) }.joined() }
    private func beginBackgroundTask() { if bgTask != .invalid { return }; bgTask = UIApplication.shared.beginBackgroundTask(withName: "PlanipretSIPKeepAlive") { [weak self] in self?.endBackgroundTask(); self?.setStatus("protected", "background_task_expired") }; DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.sendRegister(challenge: nil); self?.endBackgroundTask() } }
    private func endBackgroundTask() { if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid } }
    private func setStatus(_ next: String, _ nextReason: String) { status = next; reason = nextReason; updatedAt = Date().timeIntervalSince1970 * 1000; DispatchQueue.main.async { self.notifyListeners("sipServiceStatus", data: self.snapshot(ok: true)) } }
    private func snapshot(ok: Bool) -> [String: Any] { ["ok": ok, "status": status, "reason": reason, "updatedAt": updatedAt, "backgroundTaskActive": bgTask != .invalid, "loggedIn": status == "registered"] }
}
