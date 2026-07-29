import Foundation
import Capacitor
import UIKit
import AVFoundation
import CryptoKit
import UserNotifications
import Network

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
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]
    private var status = "idle"; private var reason = "plugin_loaded"; private var updatedAt = Date().timeIntervalSince1970 * 1000
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var host = ""; private var port = 443; private var path = "/"; private var login = ""; private var domain = ""; private var displayName = ""; private var password = ""
    private var socket: URLSessionWebSocketTask?
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
    private let registerDebounceSec: TimeInterval = 2.0
    private var reconnectPending = false
    private var pathMonitor: NWPathMonitor?
    private var networkUp = true

    public override func load() {
      DispatchQueue.main.async { [weak self] in self?.appActive = UIApplication.shared.applicationState == .active }
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.didBecomeActiveNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.willResignActiveNotification, object: nil)
      // UIScene lifecycle (iOS 13+) — the app adopts scenes, so the legacy
      // UIApplication notifications are not always delivered. Observing both
      // keeps appActive correct without ever reading UI state off-thread.
      if #available(iOS 13.0, *) {
        NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIScene.didActivateNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onSceneWillEnterForeground), name: UIScene.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIScene.willDeactivateNotification, object: nil)
      }
      // Ask for notification permission so the incoming-call banner can ring.
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil) }

    @objc func startSipService(_ call: CAPPluginCall) {
      host = call.getString("host") ?? call.getString("domain") ?? ""; port = call.getInt("port") ?? 443; path = call.getString("path") ?? "/"
      login = call.getString("login") ?? call.getString("username") ?? call.getString("extension") ?? ""
      domain = call.getString("domain") ?? ""; displayName = call.getString("displayName") ?? login; password = call.getString("password") ?? ""
      backoffMinMs = max(4000, Double(call.getInt("backoffMinMs") ?? 4000))
      backoffMaxMs = Double(call.getInt("backoffMaxMs") ?? 60000)
      backoffMaxAttempts = call.getInt("backoffMaxAttempts") ?? 5
      verifyDelayMs = Double(call.getInt("verifyDelayMs") ?? 8000)
      registerExpires = call.getInt("registerExpiresSec") ?? 1800
      NSLog("[PpSipKeepAlive] reconnect strategy min=%.0fms max=%.0fms attempts=%d verify=%.0fms expires=%ds", backoffMinMs, backoffMaxMs, backoffMaxAttempts, verifyDelayMs, registerExpires)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { call.resolve(["ok": false, "status": "error", "reason": "plugin_released"]); return }
        self.activateAudioSession()
        // Only ONE SIP registration per AOR: while the app is in the foreground the
        // JsSIP web layer owns the registration. Registering natively at the same
        // time made NetSapiens close the JsSIP socket (1001), producing an endless
        // disconnect/reconnect loop. Store the credentials and stay idle instead.
        if self.isForeground() { self.releaseRegistration("foreground_js_owns") } else { self.connect(); self.scheduleRegister() }
        call.resolve(self.snapshot(ok: true))
      }
    }
    @objc func stopSipService(_ call: CAPPluginCall) { DispatchQueue.main.async { self.releaseRegistration("stopped"); call.resolve(self.snapshot(ok: true)) } }
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

    // NEVER touch UIApplication/UIScene off the main thread: it triggers
    // "UI API called on a background thread" and can deadlock (DispatchQueue.main.sync).
    // The cached appActive flag is refreshed only from main-thread notifications.
    private func isForeground() -> Bool {
      if Thread.isMainThread {
        appActive = UIApplication.shared.applicationState == .active
        return appActive
      }
      return appActive
    }
    @objc private func onSceneWillEnterForeground() { onForeground() }
    private func releaseRegistration(_ why: String) {
      if !Thread.isMainThread { DispatchQueue.main.async { [weak self] in self?.releaseRegistration(why) }; return }
      timer?.invalidate(); timer = nil
      socket?.cancel(with: .goingAway, reason: nil); socket = nil
      endBackgroundTask(); setStatus("idle", why)
    }

    @objc private func onBackground() { appActive = false; beginBackgroundTask(); activateAudioSession(); connect(); scheduleRegister(); sendRegister(challenge: nil); setStatus("protected", "background_register_sent") }
    @objc private func onForeground() {
      appActive = true
      // Hand the AOR back to JsSIP and ask the web layer to re-REGISTER.
      releaseRegistration("foreground_js_owns")
      notifyListeners("sipReregisterRequested", data: ["reason": "enter_foreground"])
    }

    private func activateAudioSession() { try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]); try? AVAudioSession.sharedInstance().setActive(true) }
    private func connect() {
      // A new socket means a new AoR binding: clear the 200 OK debounce.
      lastRegisterOkTime = nil
      guard !host.isEmpty else { setStatus("error", "missing_host"); return }
      startPathMonitor()
      if isForeground() { return }
      if socket != nil { return }
      var comps = URLComponents(); comps.scheme = port == 80 ? "ws" : "wss"; comps.host = host; comps.port = port; comps.path = path.isEmpty ? "/" : path
      guard let url = comps.url else { setStatus("error", "bad_ws_url"); return }
      var req = URLRequest(url: url); req.setValue("sip", forHTTPHeaderField: "Sec-WebSocket-Protocol")
      socket = session.webSocketTask(with: req); socket?.resume(); setStatus("connecting", "ws_connecting"); receiveLoop()
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.sendRegister(challenge: nil) }
    }
    private func scheduleRegister() { timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.sendRegister(challenge: nil) }; RunLoop.main.add(timer!, forMode: .common) }
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
        self.sendRegister(challenge: nil)
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
        self.networkUp = up
        NSLog("[PpSipKeepAlive] network %@", up ? "available" : "lost")
        if up && !wasUp {
          self.reconnectAttempts = 0
          DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.isForeground() else { return }
            self.socket?.cancel(with: .goingAway, reason: nil); self.socket = nil
            self.connect(); self.sendRegister(challenge: nil)
          }
        } else if !up {
          self.setStatus("reconnecting", "network_lost")
        }
      }
      m.start(queue: DispatchQueue.global(qos: .utility))
      pathMonitor = m
    }

    private func handle(_ msg: String) {
      if msg.hasPrefix("SIP/2.0 401") || msg.hasPrefix("SIP/2.0 407") {
        let isProxyAuth = msg.hasPrefix("SIP/2.0 407")
        sendRegister(challenge: headerVal(msg, isProxyAuth ? "Proxy-Authenticate" : "WWW-Authenticate"), proxyAuth: isProxyAuth)
        return
      }
      if msg.hasPrefix("SIP/2.0 200") && msg.uppercased().contains(" REGISTER") {
        lastRegisterOkTime = Date()
        setStatus("registered", "native_register_200")
        // NetSapiens closes inactive sockets: ping within 500ms of the 200 OK.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in self?.sendOptionsPing() }
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
        notifyListeners("sipReregisterRequested", data: ["reason": "incoming_invite"])
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
      sip += "Via: SIP/2.0/WSS planipret-ios.invalid;branch=" + branch + "\r\n"
      sip += "From: <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\r\n"
      sip += "To: <sip:" + domain + ">\r\n"
      sip += "Call-ID: " + UUID().uuidString + "@planipret-ios\r\n"
      sip += "CSeq: " + String(seq) + " OPTIONS\r\n"
      sip += "Max-Forwards: 70\r\nUser-Agent: Planipret iOS KeepAlive\r\nContent-Length: 0\r\n\r\n"
      sock.send(.string(sip)) { err in
        if let e = err { NSLog("[PpSipKeepAlive] OPTIONS ping failed: %@", String(describing: e)) }
      }
    }

    private func sendRegister(challenge: String?, proxyAuth: Bool = false) {
      if isForeground() { releaseRegistration("foreground_js_owns"); return }
      if socket == nil { connect(); return }
      // Two REGISTERs in a row on the same WSS connection make NetSapiens see a
      // duplicate AoR and close the socket. Hold off for 2s after each 200 OK
      // (auth challenge responses are exempt: they complete the same handshake).
      if challenge == nil, let okAt = lastRegisterOkTime, Date().timeIntervalSince(okAt) <= registerDebounceSec {
        NSLog("[PpSipKeepAlive] REGISTER debounced: %.2fs since 200 OK (min %.1fs)", Date().timeIntervalSince(okAt), registerDebounceSec)
        sendOptionsPing()
        return
      }
      guard !login.isEmpty, !domain.isEmpty else { setStatus("error", "missing_credentials"); return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      let contact = "<sip:" + login + "@" + UUID().uuidString.replacingOccurrences(of: "-", with: "") + ".invalid;transport=wss>"
      var sip = "REGISTER sip:" + domain + " SIP/2.0\r\n"
      sip += "Via: SIP/2.0/WSS planipret-ios.invalid;branch=" + branch + "\r\nMax-Forwards: 70\r\n"
      sip += "To: <sip:" + login + "@" + domain + ">\r\nFrom: \"" + displayName.replacingOccurrences(of: "\"", with: "") + "\" <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\r\n"
      sip += "Call-ID: " + callIdReg + "\r\nCSeq: " + String(seq) + " REGISTER\r\nContact: " + contact + ";expires=" + String(registerExpires) + "\r\nExpires: " + String(registerExpires) + "\r\nUser-Agent: Planipret iOS KeepAlive\r\nSupported: outbound,path,gruu\r\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\r\n"
      if let ch = challenge, !password.isEmpty { sip += (proxyAuth ? "Proxy-Authorization: " : "Authorization: ") + digest(challenge: ch) + "\r\n" }
      sip += "Content-Length: 0\r\n\r\n"
      socket?.send(.string(sip)) { [weak self] err in
        DispatchQueue.main.async {
          guard let self = self else { return }
          if err == nil {
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

    private func digest(challenge: String) -> String { let m = parseDigest(challenge); let realm = m["realm"] ?? domain; let nonce = m["nonce"] ?? ""; let qop = m["qop"] ?? ""; let uri = "sip:" + domain; let nc = "00000001"; let cnonce = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16); let ha1 = md5(login + ":" + realm + ":" + password); let ha2 = md5("REGISTER:" + uri); let response = qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); var out = "Digest username=\"" + login + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + uri + "\", response=\"" + response + "\", algorithm=MD5"; if qop.contains("auth") { out += ", qop=auth, nc=" + nc + ", cnonce=\"" + cnonce + "\"" }; if let opaque = m["opaque"] { out += ", opaque=\"" + opaque + "\"" }; return out }
    private func parseDigest(_ h: String) -> [String:String] { var out: [String:String] = [:]; let s = h.replacingOccurrences(of: "Digest ", with: "", options: .caseInsensitive); for part in s.split(separator: ",") { let pieces = part.split(separator: "=", maxSplits: 1); if pieces.count == 2 { var v = pieces[1].trimmingCharacters(in: .whitespaces); if v.hasPrefix("\"") && v.hasSuffix("\"") { v.removeFirst(); v.removeLast() }; out[pieces[0].trimmingCharacters(in: .whitespaces)] = v } }; return out }
    private func headerVal(_ msg: String, _ name: String) -> String? { for line in msg.components(separatedBy: .newlines) { if line.lowercased().hasPrefix(name.lowercased() + ":") { return String(line.dropFirst(name.count + 1)).trimmingCharacters(in: .whitespaces) } }; return nil }
    private func parseDisplay(_ hdr: String) -> String { guard let lt = hdr.firstIndex(of: "<") else { return "" }; var d = String(hdr[..<lt]).trimmingCharacters(in: .whitespaces); if d.hasPrefix("\"") && d.hasSuffix("\"") { d.removeFirst(); d.removeLast() }; return d }
    private func parseUser(_ hdr: String) -> String { var uri = hdr; if let lt = hdr.firstIndex(of: "<"), let gt = hdr[lt...].firstIndex(of: ">") { uri = String(hdr[hdr.index(after: lt)..<gt]) }; if uri.hasPrefix("sip:") { uri = String(uri.dropFirst(4)) } else if uri.hasPrefix("sips:") { uri = String(uri.dropFirst(5)) }; if let at = uri.firstIndex(of: "@") { uri = String(uri[..<at]) }; if let semi = uri.firstIndex(of: ";") { uri = String(uri[..<semi]) }; return uri }
    private func md5(_ s: String) -> String { let d = Insecure.MD5.hash(data: Data(s.utf8)); return d.map { String(format: "%02hhx", $0) }.joined() }
    private func beginBackgroundTask() { if bgTask != .invalid { return }; bgTask = UIApplication.shared.beginBackgroundTask(withName: "PlanipretSIPKeepAlive") { [weak self] in self?.endBackgroundTask(); self?.setStatus("protected", "background_task_expired") }; DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.sendRegister(challenge: nil); self?.endBackgroundTask() } }
    private func endBackgroundTask() { if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid } }
    private func setStatus(_ next: String, _ nextReason: String) { status = next; reason = nextReason; updatedAt = Date().timeIntervalSince1970 * 1000; DispatchQueue.main.async { self.notifyListeners("sipServiceStatus", data: self.snapshot(ok: true)) } }
    private func snapshot(ok: Bool) -> [String: Any] { ["ok": ok, "status": status, "reason": reason, "updatedAt": updatedAt, "backgroundTaskActive": bgTask != .invalid, "loggedIn": status == "registered" || status == "protected"] }
}
