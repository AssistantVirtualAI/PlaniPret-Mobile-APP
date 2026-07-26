import Foundation
import Capacitor
import UIKit
import AVFoundation
import CryptoKit
import UserNotifications
import PushKit

// Planiprêt-only. DO NOT reuse in Lemtel (Verto stack).
//
// RFC 8599 — SIP Push Notification:
// When a VoIP push token is available (via PpVoipCall / PKPushRegistry),
// we embed pn-provider / pn-prid / pn-param in the SIP REGISTER Contact
// header so NetSapiens can wake the app via APNs instead of relying on
// a persistent WebSocket connection (which iOS kills in background).
//
@objc(PpSipKeepAlive)
public class PpSipKeepAlive: CAPPlugin, CAPBridgedPlugin, URLSessionWebSocketDelegate {
    public let identifier = "PpSipKeepAlive"; public let jsName = "PpSipKeepAlive"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "startSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "stopSipService", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "getSipServiceStatus", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "triggerReregister", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "acknowledgeIncoming", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "setVoipPushToken", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]
    private var status = "idle"; private var reason = "plugin_loaded"; private var updatedAt = Date().timeIntervalSince1970 * 1000
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var host = ""; private var port = 443; private var path = "/"; private var login = ""; private var domain = ""; private var displayName = ""; private var password = ""
    private var socket: URLSessionWebSocketTask?
    // URLSession avec configuration background + voip pour survivre à la suspension iOS.
    // iOS suspend les URLSession.default en arrière-plan — background config + voip mode
    // permettent à la WebSocket SIP de rester active même quand l'app est suspendue.
    private lazy var session: URLSession = {
      let cfg = URLSessionConfiguration.background(withIdentifier: "com.planipret.sip.keepalive")
      cfg.waitsForConnectivity = true
      cfg.shouldUseExtendedBackgroundIdleMode = true
      cfg.networkServiceType = .voip
      return URLSession(configuration: cfg, delegate: self, delegateQueue: OperationQueue())
    }()
    private var timer: Timer?
    private var cseq = 1
    private let callIdReg = UUID().uuidString + "@planipret-ios"
    private let fromTag = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16)

    // FIX 1: instanceId stable par session — ne change pas entre les REGISTER
    // Un UUID aléatoire à chaque REGISTER faisait croire à NS que c'était un
    // nouvel appareil → NS fermait le WebSocket (code 1001) avant d'envoyer 200 OK
    private let instanceId = UUID().uuidString.replacingOccurrences(of: "-", with: "")

    // FIX 3: throttle REGISTER — max 1 par 800ms pour éviter le flood
    private var lastRegisterSent: Date = .distantPast
    // FIX 4: backoff exponentiel pour la reconnexion WebSocket
    private var reconnectDelay: Double = 2.0
    private var wsReady = false  // true uniquement après urlSession(_:webSocketTask:didOpenWithProtocol:)

    // RFC 8599 push token — set by PpVoipCall or JS via setVoipPushToken
    private var voipPushToken: String = ""
    private var voipBundleId: String = ""

    public override func load() {
      NotificationCenter.default.addObserver(self, selector: #selector(onBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
      NotificationCenter.default.addObserver(self, selector: #selector(onForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
      // Listen for VoIP token updates from PpVoipCall plugin
      NotificationCenter.default.addObserver(self, selector: #selector(onVoipToken(_:)), name: NSNotification.Name("PpVoipPushToken"), object: nil)
      // Listen for BGTask-triggered SIP refresh (from AppDelegate BGProcessingTask)
      NotificationCenter.default.addObserver(self, selector: #selector(onBgRefresh), name: NSNotification.Name("PpSipBgRefresh"), object: nil)
      // Ask for notification permission so the incoming-call banner can ring.
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }
    deinit { NotificationCenter.default.removeObserver(self); timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil) }

    @objc private func onVoipToken(_ notification: Notification) {
      if let token = notification.userInfo?["token"] as? String, !token.isEmpty {
        voipPushToken = token
        voipBundleId = notification.userInfo?["bundleId"] as? String ?? Bundle.main.bundleIdentifier ?? ""
        // Re-register with push params now that we have the token
        if !login.isEmpty { sendRegister(challenge: nil) }
      }
    }

    @objc func startSipService(_ call: CAPPluginCall) {
      host = call.getString("host") ?? call.getString("domain") ?? ""; port = call.getInt("port") ?? 443; path = call.getString("path") ?? "/"
      login = call.getString("login") ?? call.getString("username") ?? call.getString("extension") ?? ""
      domain = call.getString("domain") ?? ""; displayName = call.getString("displayName") ?? login; password = call.getString("password") ?? ""
      // Accept optional push token at start time
      if let tok = call.getString("voipPushToken"), !tok.isEmpty { voipPushToken = tok }
      if let bid = call.getString("bundleId"), !bid.isEmpty { voipBundleId = bid }
      if voipBundleId.isEmpty { voipBundleId = Bundle.main.bundleIdentifier ?? "" }
      reconnectDelay = 2.0
      // En avant-plan: JsSIP possède l'AOR, ne pas ouvrir le WS natif
      // En arrière-plan: ouvrir le WS et s'enregistrer
      if !isForeground() {
        activateAudioSession(); connect(); scheduleRegister()
      } else {
        setStatus("idle", "foreground_js_owns")
      }
      call.resolve(snapshot(ok: true))
    }

    @objc func stopSipService(_ call: CAPPluginCall) { timer?.invalidate(); socket?.cancel(with: .goingAway, reason: nil); socket = nil; wsReady = false; endBackgroundTask(); setStatus("disconnected", "stopped"); call.resolve(snapshot(ok: true)) }
    @objc func getSipServiceStatus(_ call: CAPPluginCall) { call.resolve(snapshot(ok: true)) }
    @objc func triggerReregister(_ call: CAPPluginCall) {
      if isForeground() {
        // En avant-plan: JsSIP gère le re-register, ne pas interférer
        notifyListeners("sipReregisterRequested", data: ["reason": "manual"])
      } else {
        sendRegister(challenge: nil)
        notifyListeners("sipReregisterRequested", data: ["reason": "manual"])
      }
      call.resolve(snapshot(ok: true))
    }

    /// Allow JS to push the VoIP token into this plugin (called from useMplanipretSoftphone)
    @objc func setVoipPushToken(_ call: CAPPluginCall) {
      if let tok = call.getString("token"), !tok.isEmpty { voipPushToken = tok }
      if let bid = call.getString("bundleId"), !bid.isEmpty { voipBundleId = bid }
      if voipBundleId.isEmpty { voipBundleId = Bundle.main.bundleIdentifier ?? "" }
      if !login.isEmpty { sendRegister(challenge: nil) }
      call.resolve(["ok": true, "tokenSet": !voipPushToken.isEmpty])
    }

    @objc func acknowledgeIncoming(_ call: CAPPluginCall) {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["pp_incoming_call"])
      call.resolve(["ok": true])
    }

    // ARCHITECTURE: le plugin natif gère l'enregistrement SIP UNIQUEMENT en arrière-plan.
    // En avant-plan, JsSIP (WebView) possède l'AOR. Le plugin libère le WS dès que
    // l'app revient en avant-plan pour éviter la collision de deux WebSockets SIP sur NS.
    private func isForeground() -> Bool { UIApplication.shared.applicationState == .active }
    private func releaseRegistration(_ why: String) {
      timer?.invalidate(); timer = nil
      socket?.cancel(with: .goingAway, reason: nil); socket = nil
      wsReady = false; endBackgroundTask(); setStatus("idle", why)
    }
    @objc private func onBackground() {
      // Arrière-plan: le plugin natif prend l'AOR — ouvrir le WS et s'enregistrer
      beginBackgroundTask(); activateAudioSession(); connect(); scheduleRegister()
      sendRegister(challenge: nil); setStatus("protected", "background_register_sent")
    }
    @objc private func onForeground() {
      // Avant-plan: JsSIP reprend l'AOR — libérer le WS natif immédiatement
      releaseRegistration("foreground_js_owns")
      // Demander à JsSIP de se ré-enregistrer
      notifyListeners("sipReregisterRequested", data: ["reason": "enter_foreground"])
    }
    /// Called by AppDelegate BGProcessingTask every ~15 min to keep SIP registration alive
    @objc private func onBgRefresh() { if !login.isEmpty { connect(); sendRegister(challenge: nil); notifyListeners("sipReregisterRequested", data: ["reason": "bg_task_refresh"]); NSLog("[PpSipKeepAlive] BGTask refresh — REGISTER sent") } }

    private func activateAudioSession() { try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]); try? AVAudioSession.sharedInstance().setActive(true) }

    private func connect() {
      guard !host.isEmpty else { setStatus("error", "missing_host"); return }
      // Ne pas ouvrir le WS en avant-plan — JsSIP possède l'AOR
      if isForeground() { return }
      if socket != nil { return }
      wsReady = false
      var comps = URLComponents(); comps.scheme = port == 80 ? "ws" : "wss"; comps.host = host; comps.port = port; comps.path = path.isEmpty ? "/" : path
      guard let url = comps.url else { setStatus("error", "bad_ws_url"); return }
      var req = URLRequest(url: url); req.setValue("sip", forHTTPHeaderField: "Sec-WebSocket-Protocol")
      socket = session.webSocketTask(with: req); socket?.resume(); setStatus("connecting", "ws_connecting"); receiveLoop()
      // FIX 4: Ne pas envoyer REGISTER immédiatement — attendre urlSession didOpen (wsReady = true)
      // Le sendRegister sera déclenché par urlSession(_:webSocketTask:didOpenWithProtocol:)
    }

    // FIX 4: URLSessionWebSocketDelegate — déclenche le premier REGISTER quand le WS est vraiment ouvert
    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        self.wsReady = true
        self.reconnectDelay = 2.0  // reset backoff après connexion réussie
        NSLog("[PpSipKeepAlive] WS opened — sending initial REGISTER")
        self.sendRegister(challenge: nil)
      }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        self.wsReady = false
        self.socket = nil
        // Si l'app est en avant-plan, ne pas reconnecter — JsSIP possède l'AOR
        if self.isForeground() {
          self.setStatus("idle", "foreground_js_owns")
          return
        }
        let delay = self.reconnectDelay
        self.reconnectDelay = min(self.reconnectDelay * 2, 30.0)  // backoff exponentiel max 30s
        NSLog("[PpSipKeepAlive] WS closed (code \(closeCode.rawValue)) — reconnecting in \(delay)s")
        self.setStatus("reconnecting", "ws_closed")
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.connect() }
      }
    }

    private func scheduleRegister() { timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 240, repeats: true) { [weak self] _ in self?.sendRegister(challenge: nil) }; RunLoop.main.add(timer!, forMode: .common) }

    private func receiveLoop() {
      socket?.receive { [weak self] result in
        guard let self = self else { return }
        switch result {
        case .success(let message):
          if case .string(let text) = message { DispatchQueue.main.async { self.handle(text) } }
          self.receiveLoop()
        case .failure(let error):
          DispatchQueue.main.async {
            self.wsReady = false
            self.socket = nil
            // Si l'app est en avant-plan quand le WS se ferme, ne pas reconnecter
            // (JsSIP possède l'AOR en avant-plan)
            if self.isForeground() {
              self.setStatus("idle", "foreground_js_owns")
              return
            }
            let delay = self.reconnectDelay
            self.reconnectDelay = min(self.reconnectDelay * 2, 30.0)
            NSLog("[PpSipKeepAlive] receiveLoop error: \(error.localizedDescription) — reconnecting in \(delay)s")
            self.setStatus("reconnecting", "ws_closed")
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.connect() }
          }
        }
      }
    }

    // FIX 5: tracker le type de challenge (401 → Authorization, 407 → Proxy-Authorization)
    private var lastChallengeWas407 = false

    private func handle(_ msg: String) {
      if msg.hasPrefix("SIP/2.0 401") || msg.hasPrefix("SIP/2.0 407") {
        // Challenge reçu — répondre immédiatement (bypass throttle)
        let is407 = msg.hasPrefix("SIP/2.0 407")
        lastChallengeWas407 = is407
        let hdrName = is407 ? "Proxy-Authenticate" : "WWW-Authenticate"
        sendRegisterForced(challenge: headerVal(msg, hdrName))
        return
      }
      if msg.hasPrefix("SIP/2.0 200") && msg.uppercased().contains(" REGISTER") {
        reconnectDelay = 2.0  // reset backoff après 200 OK
        setStatus("registered", "native_register_200")
        return
      }
      if msg.hasPrefix("SIP/2.0 403") || msg.hasPrefix("SIP/2.0 404") {
        NSLog("[PpSipKeepAlive] REGISTER rejected (\(msg.prefix(15))) — stopping retries")
        setStatus("error", "register_rejected")
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
      if #available(iOS 15.2, *) {
        content.sound = UNNotificationSound.defaultRingtone
      } else {
        content.sound = UNNotificationSound.default
      }
      if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
      content.categoryIdentifier = "PP_INCOMING_CALL"
      content.userInfo = ["pp_call_id": callId, "pp_incoming_call": true]
      let req = UNNotificationRequest(identifier: "pp_incoming_call", content: content, trigger: nil)
      UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    // MARK: - SIP REGISTER with RFC 8599 push params

    private func buildContactHeader() -> String {
      // FIX 1: instanceId stable — même valeur pour toute la session
      // Un UUID différent à chaque REGISTER faisait croire à NS que c'était
      // un nouvel appareil → NS fermait le WS (code 1001) avant d'envoyer 200 OK
      var contact = "<sip:" + login + "@" + instanceId + ".invalid;transport=wss"

      // RFC 8599 — embed push notification parameters so NetSapiens can
      // wake the app via APNs VoIP push when the WebSocket is not connected.
      if !voipPushToken.isEmpty {
        let bundleId = voipBundleId.isEmpty ? (Bundle.main.bundleIdentifier ?? "com.planipret.mobile") : voipBundleId
        // pn-provider: "apns.voip" for VoIP push (PushKit), "apns" for regular APNs
        contact += ";pn-provider=apns.voip"
        // pn-prid: the device push token
        contact += ";pn-prid=" + voipPushToken
        // pn-param: bundle ID (NetSapiens uses this to identify the APNs certificate)
        contact += ";pn-param=" + bundleId
        NSLog("[PpSipKeepAlive] REGISTER with RFC 8599 push params (token: \(voipPushToken.prefix(8))...)")
      } else {
        NSLog("[PpSipKeepAlive] REGISTER without push params (no VoIP token yet)")
      }

      contact += ">"
      return contact
    }

    // FIX 3: throttle — max 1 REGISTER non-challenge par 800ms
    private func sendRegister(challenge: String?) {
      guard challenge != nil else {
        // Non-challenge REGISTER: throttle
        let now = Date()
        guard now.timeIntervalSince(lastRegisterSent) >= 0.8 else { return }
        lastRegisterSent = now
        sendRegisterRaw(challenge: nil)
        return
      }
      // Challenge response: envoyer immédiatement
      sendRegisterForced(challenge: challenge)
    }

    // Envoie un REGISTER avec challenge sans throttle (réponse 401/407)
    private func sendRegisterForced(challenge: String?) {
      lastRegisterSent = Date()
      sendRegisterRaw(challenge: challenge)
    }

    private func sendRegisterRaw(challenge: String?) {
      // Ne pas s'enregistrer en avant-plan — JsSIP possède l'AOR
      if isForeground() { releaseRegistration("foreground_js_owns"); return }
      // FIX 4: Ne pas envoyer si le WS n'est pas encore ouvert
      guard wsReady, socket != nil else {
        if socket == nil { connect() }
        return
      }
      guard !login.isEmpty, !domain.isEmpty else { setStatus("error", "missing_credentials"); return }
      let seq = cseq; cseq += 1
      let branch = "z9hG4bK" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      let contact = buildContactHeader()
      var sip = "REGISTER sip:" + domain + " SIP/2.0\r\n"
      sip += "Via: SIP/2.0/WSS planipret-ios.invalid;branch=" + branch + "\r\nMax-Forwards: 70\r\n"
      sip += "To: <sip:" + login + "@" + domain + ">\r\nFrom: \"" + displayName.replacingOccurrences(of: "\"", with: "") + "\" <sip:" + login + "@" + domain + ">;tag=" + fromTag + "\r\n"
      sip += "Call-ID: " + callIdReg + "\r\nCSeq: " + String(seq) + " REGISTER\r\n"
      sip += "Contact: " + contact + ";expires=600\r\nExpires: 600\r\n"
      // FIX 2: Route header (use_preloaded_route équivalent natif)
      // NS utilise ce Route pour router les INVITEs entrants via le WS établi
      // au lieu d'essayer de contacter l'adresse .invalid du Contact
      sip += "Route: <sip:" + host + ":" + String(port) + ";transport=wss;lr>\r\n"
      sip += "User-Agent: Planipret iOS KeepAlive\r\nSupported: outbound,path,gruu\r\nAllow: INVITE,ACK,CANCEL,BYE,OPTIONS,MESSAGE,INFO,UPDATE,REGISTER\r\n"
      if let ch = challenge, !password.isEmpty {
        // RFC 3261: 407 → Proxy-Authorization, 401 → Authorization
        let authHeader = lastChallengeWas407 ? "Proxy-Authorization" : "Authorization"
        sip += authHeader + ": " + digest(challenge: ch) + "\r\n"
        NSLog("[PpSipKeepAlive] Using %@ header (407=%@)", authHeader, lastChallengeWas407 ? "true" : "false")
      }
      sip += "Content-Length: 0\r\n\r\n"
      socket?.send(.string(sip)) { [weak self] err in
        DispatchQueue.main.async {
          self?.setStatus(err == nil ? "connecting" : "error",
                          err == nil ? (challenge == nil ? "register_sent" : "register_auth_sent") : "register_send_failed")
        }
      }
    }

    private func digest(challenge: String) -> String { let m = parseDigest(challenge); let realm = m["realm"] ?? domain; let nonce = m["nonce"] ?? ""; let qop = m["qop"] ?? ""; let uri = "sip:" + domain; let nc = "00000001"; let cnonce = String(Int(Date().timeIntervalSince1970 * 1000), radix: 16); let ha1 = md5(login + ":" + realm + ":" + password); let ha2 = md5("REGISTER:" + uri); let response = qop.contains("auth") ? md5(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2) : md5(ha1 + ":" + nonce + ":" + ha2); var out = "Digest username=\"" + login + "\", realm=\"" + realm + "\", nonce=\"" + nonce + "\", uri=\"" + uri + "\", response=\"" + response + "\", algorithm=MD5"; if qop.contains("auth") { out += ", qop=auth, nc=" + nc + ", cnonce=\"" + cnonce + "\"" }; if let opaque = m["opaque"] { out += ", opaque=\"" + opaque + "\"" }; return out }
    private func parseDigest(_ h: String) -> [String:String] { var out: [String:String] = [:]; let s = h.replacingOccurrences(of: "Digest ", with: "", options: .caseInsensitive); for part in s.split(separator: ",") { let pieces = part.split(separator: "=", maxSplits: 1); if pieces.count == 2 { var v = pieces[1].trimmingCharacters(in: .whitespaces); if v.hasPrefix("\"") && v.hasSuffix("\"") { v.removeFirst(); v.removeLast() }; out[pieces[0].trimmingCharacters(in: .whitespaces)] = v } }; return out }
    private func headerVal(_ msg: String, _ name: String) -> String? { for line in msg.components(separatedBy: .newlines) { if line.lowercased().hasPrefix(name.lowercased() + ":") { return String(line.dropFirst(name.count + 1)).trimmingCharacters(in: .whitespaces) } }; return nil }
    private func parseDisplay(_ hdr: String) -> String { guard let lt = hdr.firstIndex(of: "<") else { return "" }; var d = String(hdr[..<lt]).trimmingCharacters(in: .whitespaces); if d.hasPrefix("\"") && d.hasSuffix("\"") { d.removeFirst(); d.removeLast() }; return d }
    private func parseUser(_ hdr: String) -> String { var uri = hdr; if let lt = hdr.firstIndex(of: "<"), let gt = hdr[lt...].firstIndex(of: ">") { uri = String(hdr[hdr.index(after: lt)..<gt]) }; if uri.hasPrefix("sip:") { uri = String(uri.dropFirst(4)) } else if uri.hasPrefix("sips:") { uri = String(uri.dropFirst(5)) }; if let at = uri.firstIndex(of: "@") { uri = String(uri[..<at]) }; if let semi = uri.firstIndex(of: ";") { uri = String(uri[..<semi]) }; return uri }
    private func md5(_ s: String) -> String { let d = Insecure.MD5.hash(data: Data(s.utf8)); return d.map { String(format: "%02hhx", $0) }.joined() }
    private func beginBackgroundTask() {
      if bgTask != .invalid { return }
      bgTask = UIApplication.shared.beginBackgroundTask(withName: "PlanipretSIPKeepAlive") { [weak self] in
        // iOS expiry handler: envoyer un dernier REGISTER puis terminer proprement
        self?.sendRegister(challenge: nil)
        self?.endBackgroundTask()
        self?.setStatus("protected", "background_task_expired")
      }
      // Ne pas terminer la tâche manuellement — laisser iOS la gérer via l'expiry handler.
      // L'ancien code appelait endBackgroundTask() après 25s, ce qui suspendait l'app
      // immédiatement et empêchait le timer de 240s de s'exécuter.
    }
    private func endBackgroundTask() { if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid } }
    private func setStatus(_ next: String, _ nextReason: String) { status = next; reason = nextReason; updatedAt = Date().timeIntervalSince1970 * 1000; DispatchQueue.main.async { self.notifyListeners("sipServiceStatus", data: self.snapshot(ok: true)) } }
    private func snapshot(ok: Bool) -> [String: Any] { ["ok": ok, "status": status, "reason": reason, "updatedAt": updatedAt, "backgroundTaskActive": bgTask != .invalid, "loggedIn": status == "registered" || status == "protected", "hasPushToken": !voipPushToken.isEmpty] }
}
