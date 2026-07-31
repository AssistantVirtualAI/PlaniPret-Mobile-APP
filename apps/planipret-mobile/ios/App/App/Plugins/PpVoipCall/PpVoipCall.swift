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
            self.setupCallKit()
            self.setupPushKit()
            self.notifyListeners("callKitReady", data: ["ok": true])
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
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.pushRegistry = registry
    }

    // MARK: - JS ↔ Native
    @objc func getVoipPushToken(_ call: CAPPluginCall) {
        // If PushKit has not handed us a token yet, re-arm the registry: after a
        // restore/reinstall the first didUpdate can be missed entirely.
        if (voipToken ?? "").isEmpty {
            NSLog("[PpVoipCall] no VoIP token cached, re-arming PushKit")
            DispatchQueue.main.async { [weak self] in self?.setupPushKit() }
        }
        call.resolve([
            "token": voipToken ?? "",
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "environment": apnsEnvironment()
        ])
    }

    /// Force PushKit to re-issue the VoIP token (used on app resume and when the
    /// backend reports the stored token as invalid/unregistered).
    @objc func refreshVoipPushToken(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(["ok": false]); return }
            let previous = self.voipToken
            self.pushRegistry?.desiredPushTypes = []
            self.pushRegistry = nil
            self.setupPushKit()
            NSLog("[PpVoipCall] VoIP token refresh requested (had token: %@)", previous == nil ? "no" : "yes")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self = self else { return }
                let current = self.voipToken ?? ""
                let changed = current != (previous ?? "")
                NSLog("[PpVoipCall] VoIP token after refresh changed=%@ empty=%@", changed ? "yes" : "no", current.isEmpty ? "yes" : "no")
                self.notifyListeners("voipPushToken", data: [
                    "token": current,
                    "bundleId": Bundle.main.bundleIdentifier ?? "",
                    "environment": self.apnsEnvironment(),
                    "changed": changed,
                    "source": "refresh"
                ])
            }
            call.resolve(["ok": true, "token": previous ?? ""])
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
            call.resolve(["ok": false, "reason": "no_pending_answer"])
            return
        }
        pendingAnswerAction = nil
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
        notifyListeners("voipPushTokenInvalidated", data: ["platform": "ios"])
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.setupPushKit() }
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        guard type == .voIP else { completion(); return }
        let dict = payload.dictionaryPayload
        let callId = (dict["callId"] as? String) ?? (dict["call_id"] as? String) ?? UUID().uuidString
        let callerName = (dict["callerName"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from"] as? String) ?? "Appel entrant"
        let callerNumber = (dict["callerNumber"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from_user"] as? String) ?? ""

        // NetSapiens may retry the same call event while the device is waking.
        // Keep the original CallKit UUID/action instead of creating a second
        // incoming-call screen and making the first Answer button stale.
        if callId == activeCallId, activeCallUUID != nil {
            NSLog("[PpVoipCall] duplicate VoIP push ignored callId=%@", callId)
            completion()
            return
        }

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
            ])
            completion()
        }
    }

    // MARK: - CXProviderDelegate
    public func providerDidReset(_ provider: CXProvider) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        activeCallUUID = nil; activeCallId = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        try? AVAudioSession.sharedInstance().setActive(true)
        notifyListeners("incomingCallAnswered", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ])
        pendingAnswerAction?.fail()
        pendingAnswerAction = action
        DispatchQueue.main.asyncAfter(deadline: .now() + 30.0) { [weak self, weak action] in
            guard let self = self, let action = action, self.pendingAnswerAction === action else { return }
            self.pendingAnswerAction = nil
            action.fail()
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        notifyListeners("incomingCallRejected", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ])
        activeCallUUID = nil; activeCallId = nil
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        try? audioSession.setActive(true)
    }
}
