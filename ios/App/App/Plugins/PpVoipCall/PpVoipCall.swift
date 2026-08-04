import Foundation
import Capacitor
import UIKit
import PushKit
import CallKit
import AVFoundation

@objc(PpVoipCall)
public class PpVoipCall: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "PpVoipCall"; public let jsName = "PpVoipCall"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "getVoipPushToken", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "refreshVoipPushToken", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "completeAnswer", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
      CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    private var pushRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private var callController = CXCallController()
    private var voipToken: String?
    private var lastReportedToken: String?
    private var activeCallUUID: UUID?
    private var activeCallId: String?
    private var pendingAnswerAction: CXAnswerCallAction?
    private var answerCompleted = false
    // ring17: NetSapiens can emit the SAME inbound call twice with two
    // different callIds. Deduplicate on the caller number too, otherwise a
    // second CallKit call races the first answer action.
    private var lastPushNumber: String = ""
    private var lastPushAt: TimeInterval = 0
    private let voipTokenDefaultsKey = "pp.voip.push-token.v1"
    /// true quand l'appel CallKit courant est piloté par le moteur PJSIP natif
    /// (INVITE reçu en TLS 5061) et non plus par le chemin JsSIP/WebView.
    private var nativeEngineOwnsCall = false


    private func apnsEnvironment() -> String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.voipToken = UserDefaults.standard.string(forKey: self.voipTokenDefaultsKey)
            self.setupCallKit()
            self.setupPushKit()
            self.notifyListeners("callKitReady", data: ["ok": true])
            self.observePjsipEngine()
        }
    }

    // MARK: - Pont PJSIP natif → CallKit
    /// La sonnerie système est désormais déclenchée par l'INVITE PJSIP natif.
    /// Le push VoIP ne sert plus qu'à réveiller le process : si PJSIP présente
    /// l'appel en premier, le chemin JsSIP n'est jamais sollicité.
    private func observePjsipEngine() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: Notification.Name("PpPjsipIncomingCall"), object: nil, queue: .main) { [weak self] note in
            guard let self = self else { return }
            let info = note.userInfo as? [String: Any] ?? [:]
            self.reportNativeIncomingCall(
                callId: (info["callId"] as? String) ?? UUID().uuidString,
                callerName: (info["callerName"] as? String) ?? "Appel entrant",
                callerNumber: (info["callerNumber"] as? String) ?? ""
            )
        }
        nc.addObserver(forName: Notification.Name("PpPjsipCallConnected"), object: nil, queue: .main) { [weak self] _ in
            guard let self = self, let uuid = self.activeCallUUID else { return }
            self.provider?.reportOutgoingCall(with: uuid, connectedAt: Date())
        }
        nc.addObserver(forName: Notification.Name("PpPjsipCallEnded"), object: nil, queue: .main) { [weak self] note in
            guard let self = self, let uuid = self.activeCallUUID else { return }
            let code = (note.userInfo?["code"] as? Int) ?? 0
            let reason: CXCallEndedReason = (code == 486 || code == 603) ? .declinedElsewhere
                : (code >= 400 && code != 487) ? .failed : .remoteEnded
            self.provider?.reportCall(with: uuid, endedAt: Date(), reason: reason)
            self.pendingAnswerAction?.fulfill(); self.pendingAnswerAction = nil
            self.activeCallUUID = nil; self.activeCallId = nil
            self.nativeEngineOwnsCall = false
        }
    }

    private func reportNativeIncomingCall(callId: String, callerName: String, callerNumber: String) {
        // Un push VoIP a pu déjà présenter le même appel : on garde le premier
        // UUID CallKit et on se contente d'enrichir l'affichage.
        if let uuid = activeCallUUID {
            nativeEngineOwnsCall = true
            activeCallId = callId
            let update = CXCallUpdate()
            // Le push VoIP arrive souvent sans numero (NetSapiens ne le fournit
            // pas toujours) -> CallKit affiche "Numero indisponible". L'INVITE
            // natif, lui, porte toujours le From : on corrige le handle ici.
            if !callerNumber.isEmpty {
                update.remoteHandle = CXHandle(type: .phoneNumber, value: callerNumber)
            }
            update.localizedCallerName = callerName
            provider?.reportCall(with: uuid, updated: update)
            NSLog("[PpVoipCall] PJSIP INVITE joined existing CallKit call callId=%@", callId)
            // L'utilisateur a pu decrocher AVANT l'arrivee de l'INVITE (appel
            // presente par le push). L'action CallKit attendait alors JsSIP qui
            // ne repond plus : on la remplit maintenant via PJSIP.
            if let pending = pendingAnswerAction {
                pendingAnswerAction = nil
                answerCompleted = true
                NotificationCenter.default.post(name: Notification.Name("PpPjsipAnswerRequested"), object: nil, userInfo: ["callId": callId])
                notifyListeners("incomingCallAnswered", data: [
                    "callUUID": uuid.uuidString,
                    "callId": callId,
                    "source": "pjsip"
                ], retainUntilConsumed: true)
                pending.fulfill()
                NSLog("[PpVoipCall] pending answer fulfilled by native INVITE callId=%@", callId)
            }
            return
        }

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId
        nativeEngineOwnsCall = true

        let update = CXCallUpdate()
        update.remoteHandle = callerNumber.isEmpty
            ? CXHandle(type: .generic, value: callerName)
            : CXHandle(type: .phoneNumber, value: callerNumber)
        update.localizedCallerName = callerName
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsDTMF = true

        provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                NSLog("[PpVoipCall] PJSIP reportNewIncomingCall failed: \(error.localizedDescription)")
                NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil)
                return
            }
            NSLog("[PpVoipCall] CallKit ringing from native PJSIP INVITE callId=%@", callId)
            self?.notifyListeners("callKitReady", data: [
                "callUUID": uuid.uuidString,
                "callId": callId,
                "callerName": callerName,
                "callerNumber": callerNumber,
                "source": "pjsip"
            ], retainUntilConsumed: true)
        }
    }


    private func setupCallKit() {
        let cfg = CXProviderConfiguration(localizedName: "Planiprêt")
        cfg.supportsVideo = false
        cfg.maximumCallsPerCallGroup = 1
        cfg.maximumCallGroups = 1
        cfg.supportedHandleTypes = [.phoneNumber, .generic]
        cfg.includesCallsInRecents = true
        if let img = UIImage(named: "AppIcon") { cfg.iconTemplateImageData = img.pngData() }
        let p = CXProvider(configuration: cfg)
        p.setDelegate(self, queue: nil)
        self.provider = p
    }

    private func setupPushKit() {
        guard pushRegistry == nil else {
            pushRegistry?.desiredPushTypes = [.voIP]
            return
        }
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.pushRegistry = registry
    }

    // MARK: - JS ↔ Native
    @objc func getVoipPushToken(_ call: CAPPluginCall) {
        if pushRegistry == nil {
            NSLog("[PpVoipCall] PushKit registry missing, creating it")
            setupPushKit()
        }
        call.resolve([
            "token": voipToken ?? "",
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment()
        ])
    }

    /// Keep one registry alive; replacing it while APNs registration is pending
    /// prevents the delegate callback from ever delivering the token.
    @objc func refreshVoipPushToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(["ok": false]); return }
            self.setupPushKit()
            let current = self.voipToken ?? ""
            NSLog("[PpVoipCall] PushKit registry armed (cached token: %@)", current.isEmpty ? "no" : "yes")
            call.resolve(["ok": true, "token": current])
        }
    }

    @objc func reportCallEnded(_ call: CAPPluginCall) {
        if let uuid = activeCallUUID {
            let end = CXEndCallAction(call: uuid)
            callController.request(CXTransaction(action: end)) { _ in }
            activeCallUUID = nil
            activeCallId = nil
        }
        call.resolve(["ok": true])
    }

    @objc func completeAnswer(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        let ok = call.getBool("ok") ?? false
        // Push webhook IDs and the final SIP Call-ID are not guaranteed to be
        // identical. CallKit is configured for one call only, so the pending
        // CXAnswerCallAction is the authoritative correlation token.
        guard let action = pendingAnswerAction else {
            // ring16: completeAnswer is idempotent. A second call after the
            // action was already fulfilled is a duplicate, not a failure.
            call.resolve(["ok": answerCompleted, "reason": answerCompleted ? "already_completed" : "no_pending_answer"])
            return
        }
        pendingAnswerAction = nil
        answerCompleted = ok
        if ok { action.fulfill() } else { action.fail() }
        call.resolve(["ok": true])
    }

    // MARK: - PKPushRegistryDelegate
    public func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = credentials.token.map { String(format: "%02x", $0) }.joined()
        let changed = token != (lastReportedToken ?? "")
        self.voipToken = token
        self.lastReportedToken = token
        UserDefaults.standard.set(token, forKey: voipTokenDefaultsKey)
        NSLog("[PpVoipCall] VoIP token updated changed=%@ suffix=%@", changed ? "yes" : "no", String(token.suffix(6)))
        notifyListeners("voipPushToken", data: [
            "token": token,
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment(),
            "changed": changed,
            "source": "pushkit"
        ])
    }

    public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        NSLog("[PpVoipCall] VoIP token invalidated — re-arming PushKit")
        self.voipToken = nil
        UserDefaults.standard.removeObject(forKey: voipTokenDefaultsKey)
        notifyListeners("voipPushTokenInvalidated", data: ["platform": "ios"])
        DispatchQueue.main.async { [weak self] in self?.setupPushKit() }
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let dict = payload.dictionaryPayload
        let callId = (dict["callId"] as? String) ?? (dict["call_id"] as? String) ?? UUID().uuidString
        let callerName = (dict["callerName"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from"] as? String) ?? "Appel entrant"
        let callerNumber = (dict["callerNumber"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from_user"] as? String) ?? ""

        // NetSapiens can retry a call event while iOS is waking. Preserve the
        // first CallKit UUID so its Answer action never becomes stale.
        if callId == activeCallId, activeCallUUID != nil {
            NSLog("[PpVoipCall] duplicate VoIP push ignored callId=%@", callId)
            completion()
            return
        }
        // ring17: same caller, different callId, within 45s of the first push
        // and a CallKit call still up → same physical call, drop it.
        let now = Date().timeIntervalSince1970
        let digits = callerNumber.filter { $0.isNumber }
        if !digits.isEmpty, digits == lastPushNumber, activeCallUUID != nil, now - lastPushAt < 45 {
            NSLog("[PpVoipCall] duplicate VoIP push ignored (same caller) callId=%@", callId)
            completion()
            return
        }
        lastPushNumber = digits
        lastPushAt = now


        // Wake the native SIP keep-alive FIRST: iOS may have killed the WSS
        // socket while suspended, and only this push guarantees runtime.
        NotificationCenter.default.post(name: Notification.Name("PpVoipIncomingPush"), object: nil, userInfo: ["callId": callId])

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId

        let update = CXCallUpdate()
        let handle: CXHandle = callerNumber.isEmpty
            ? CXHandle(type: .generic, value: callerName)
            : CXHandle(type: .phoneNumber, value: callerNumber)
        update.remoteHandle = handle
        update.localizedCallerName = callerName
        update.hasVideo = false
        update.supportsHolding = true
        update.supportsDTMF = true

        provider?.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                NSLog("[PpVoipCall] reportNewIncomingCall failed: \(error.localizedDescription)")
            }
            self?.notifyListeners("callKitReady", data: [
                "callUUID": uuid.uuidString,
                "callId": callId,
                "callerName": callerName,
                "callerNumber": callerNumber
            ], retainUntilConsumed: true)
            completion()
        }
    }

    // MARK: - CXProviderDelegate
    public func providerDidReset(_ provider: CXProvider) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        if nativeEngineOwnsCall {
            NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil)
        }
        nativeEngineOwnsCall = false
        activeCallUUID = nil; activeCallId = nil
    }

    /// Mute système (bouton CallKit) → coupe le flux micro dans PJSIP.
    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("PpPjsipMuteRequested"), object: nil,
            userInfo: ["muted": action.isMuted]
        )
        notifyListeners("callMuted", data: ["muted": action.isMuted])
        action.fulfill()
    }

    /// Clavier CallKit → DTMF RFC 2833 côté PJSIP.
    public func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("PpPjsipDtmfRequested"), object: nil,
            userInfo: ["digits": action.digits]
        )
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // Never invalidate the first valid answer transaction. A duplicate
        // CallKit callback must join/lose, not fail the action JS is completing.
        if pendingAnswerAction != nil {
            NSLog("[PpVoipCall] duplicate answer action ignored")
            action.fail()
            return
        }
        // Prepare the route but let CallKit own activation (didActivate:) —
        // activating here races the system session and yields a dead call.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])

        // Chemin natif PJSIP : le décrochage est un simple `pjsua_call_answer`,
        // il ne dépend ni de la WebView ni d'un REGISTER JsSIP. On remplit donc
        // l'action tout de suite (plus de fenêtre de 32 s ni de completeAnswer).
        if nativeEngineOwnsCall {
            answerCompleted = true
            pendingAnswerAction = nil
            NotificationCenter.default.post(name: Notification.Name("PpVoipCallAnswered"), object: nil, userInfo: ["callId": activeCallId ?? ""])
            NotificationCenter.default.post(name: Notification.Name("PpPjsipAnswerRequested"), object: nil, userInfo: ["callId": activeCallId ?? ""])
            notifyListeners("incomingCallAnswered", data: [
                "callUUID": action.callUUID.uuidString,
                "callId": activeCallId ?? "",
                "source": "pjsip"
            ], retainUntilConsumed: true)
            action.fulfill()
            return
        }

        // Store the transaction BEFORE waking JS. A retained Capacitor listener
        // can answer synchronously; completeAnswer() must already have the
        // authoritative CXAnswerCallAction when that callback returns.
        pendingAnswerAction = action
        answerCompleted = false
        // Si le moteur PJSIP est demarre, l'INVITE natif va arriver d'un
        // instant a l'autre : reportNativeIncomingCall remplira cette action.
        NotificationCenter.default.post(name: Notification.Name("PpPjsipAnswerPending"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        // Keep the SIP transport pinned up while the WebView answers.
        NotificationCenter.default.post(name: Notification.Name("PpVoipCallAnswered"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        notifyListeners("incomingCallAnswered", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ], retainUntilConsumed: true)
        // JS keeps the pending SIP-answer intent for 30s. Keep CallKit alive
        // slightly longer so slow WSS registration/refork can still complete.
        DispatchQueue.main.asyncAfter(deadline: .now() + 32.0) { [weak self, weak action] in
            guard let self = self, let action = action, self.pendingAnswerAction === action else { return }
            self.pendingAnswerAction = nil
            NSLog("[PpVoipCall] answer action timed out — SIP dialog not confirmed")
            action.fail()
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        if nativeEngineOwnsCall {
            // 603 Decline côté PJSIP : un 486 renverrait l'appel en messagerie.
            NotificationCenter.default.post(name: Notification.Name("PpPjsipEndRequested"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        }
        notifyListeners("incomingCallRejected", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? "",
            "source": nativeEngineOwnsCall ? "pjsip" : "jssip"
        ])
        activeCallUUID = nil; activeCallId = nil
        nativeEngineOwnsCall = false
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        NotificationCenter.default.post(name: Notification.Name("PpCallKitAudioActivated"), object: audioSession)
        // ring17: JS must only attach/enable the microphone track AFTER CallKit
        // owns the session, otherwise the outgoing direction stays silent.
        notifyListeners("audioSessionActivated", data: ["callId": activeCallId ?? ""], retainUntilConsumed: true)
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        NotificationCenter.default.post(name: Notification.Name("PpCallKitAudioDeactivated"), object: audioSession)
        notifyListeners("audioSessionDeactivated", data: ["callId": activeCallId ?? ""])
    }
}
