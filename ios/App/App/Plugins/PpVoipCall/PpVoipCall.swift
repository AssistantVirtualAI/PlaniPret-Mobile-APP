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
    // ring13 - the PBX call-id is not stable across fork legs, so dedup also needs
    // the caller and the age of the live CallKit report.
    private var activeCallerNumber: String = ""
    /// ring15 - last callId whose CXAnswerCallAction we successfully fulfilled, so a
    /// second completeAnswer(ok:true) for the same call is reported as already
    /// confirmed instead of as a failure.
    private var answerConfirmedForCallId: String = ""
    private var activeCallReportedAt: Date = .distantPast
    private var pendingAnswerAction: CXAnswerCallAction?
    private let voipTokenDefaultsKey = "pp.voip.push-token.v1"
    /// ring11 - memoised result of apnsEnvironment(); the embedded provisioning
    /// profile cannot change while the process is alive.
    private var cachedApnsEnvironment: String? = nil

    /// ring11 - the APNs environment a PushKit token belongs to is decided by the
    /// aps-environment entitlement baked into the embedded provisioning
    /// profile, NOT by the Xcode build configuration.
    ///
    /// The previous implementation returned "sandbox" under #if DEBUG, which
    /// mislabelled every Debug build even though Planipret's entitlements are
    /// production. The ring10 log showed environment=sandbox for a
    /// production-signed build, and because pp-voip-push-token persists that
    /// value on every app launch it kept overwriting the server-side
    /// self-correction. Result: ns-webhook-receiver hit
    /// api.sandbox.push.apple.com first on EVERY call, took a BadDeviceToken,
    /// then retried on the production host - a permanent extra round trip on
    /// the critical path that delayed the INVITE.
    ///
    /// We now read the real entitlement out of embedded.mobileprovision. That
    /// file is a CMS blob wrapping a plist, so we slice between the plist
    /// markers instead of trying to decode the signature.
    private func apnsEnvironment() -> String {
        if let cached = cachedApnsEnvironment { return cached }

        var resolved: String? = nil

        if let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
           let data = try? Data(contentsOf: url),
           let raw = String(data: data, encoding: .isoLatin1),
           let start = raw.range(of: "<?xml"),
           let end = raw.range(of: "</plist>") {
            let plistText = String(raw[start.lowerBound..<end.upperBound])
            if let plistData = plistText.data(using: .isoLatin1),
               let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
               let entitlements = plist["Entitlements"] as? [String: Any],
               let apsEnv = entitlements["aps-environment"] as? String {
                // Apple spells it "development" in the entitlement; APNs calls
                // the matching host "sandbox".
                resolved = (apsEnv == "development") ? "sandbox" : "production"
                NSLog("[PpVoipCall] apnsEnvironment from entitlement aps-environment=%@ -> %@", apsEnv, resolved!)
            }
        }

        if resolved == nil {
            // App Store / TestFlight builds strip the embedded profile, and those
            // are always production.
            resolved = "production"
            NSLog("[PpVoipCall] apnsEnvironment no embedded profile -> production")
        }

        cachedApnsEnvironment = resolved
        return resolved!
    }

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.voipToken = UserDefaults.standard.string(forKey: self.voipTokenDefaultsKey)
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
            activeCallerNumber = ""
            activeCallReportedAt = .distantPast
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
            // ring15 - idempotent. Two independent paths now confirm a successful
            // answer (answerOnce, and the 200 OK effect added in ring14), so the
            // second one legitimately arrives after the action was consumed. Log 137
            // shows exactly that: completeAnswer -> ok:true, then completeAnswer ->
            // ok:false/no_pending_answer. Reporting a failure for an answer that in
            // fact succeeded is misleading, and a caller that reacts to ok:false
            // could tear down a healthy call.
            let alreadyConfirmed = ok && answerConfirmedForCallId == (callId.isEmpty ? (activeCallId ?? "") : callId)
            call.resolve([
                "ok": alreadyConfirmed,
                "reason": alreadyConfirmed ? "already_confirmed" : "no_pending_answer"
            ])
            return
        }
        pendingAnswerAction = nil
        if ok {
            answerConfirmedForCallId = callId.isEmpty ? (activeCallId ?? "") : callId
            action.fulfill()
        } else {
            answerConfirmedForCallId = ""
            action.fail()
        }
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

        // ring13 - second-level dedup, BY CALLER, because the callId is not stable.
        //
        // The callId dedup above only catches a byte-identical retry. The ring12 log
        // carried FOUR pushes bearing THREE distinct callIds for the same physical
        // call, because NetSapiens mints a new call-id per fork leg (orig and term
        // side both fire the call webhook model). Each unseen callId therefore
        // produced a fresh reportNewIncomingCall with a fresh UUID, and the user saw
        // TWO CallKit call screens for one caller - one already connected, the other
        // still ringing with a Reject button.
        //
        // Same caller + a still-live CallKit call = same physical call. Update the
        // existing call instead of reporting a new one: reporting twice is what puts
        // CallKit and the SIP dialog out of sync, and the second (dialog-less) call
        // screen is the one that can never be answered.
        if let liveUUID = activeCallUUID,
           !callerNumber.isEmpty,
           callerNumber == activeCallerNumber,
           Date().timeIntervalSince(activeCallReportedAt) < 25.0 {
            NSLog("[PpVoipCall] duplicate VoIP push ignored: same caller %@ already ringing (callId=%@ mapped onto live call)", callerNumber, callId)
            // Keep the newest PBX call-id addressable so an answer/hangup routed
            // through it still resolves to the live CallKit call.
            activeCallId = callId
            NotificationCenter.default.post(name: Notification.Name("PpVoipIncomingPush"), object: nil, userInfo: ["callId": callId])
            notifyListeners("callKitReady", data: [
                "callUUID": liveUUID.uuidString,
                "callId": callId,
                "callerName": callerName,
                "callerNumber": callerNumber,
                "deduplicated": true
            ], retainUntilConsumed: true)
            completion()
            return
        }

        // Wake the native SIP keep-alive FIRST: iOS may have killed the WSS
        // socket while suspended, and only this push guarantees runtime.
        NotificationCenter.default.post(name: Notification.Name("PpVoipIncomingPush"), object: nil, userInfo: ["callId": callId])

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId
        // ring13 - remember WHO is calling and WHEN, so a later push from another
        // fork leg of the same call can be folded onto this CallKit call.
        activeCallerNumber = callerNumber
        activeCallReportedAt = Date()

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
            // retainUntilConsumed: the VoIP push often lands while the WebView
            // is suspended; without it the event is dropped and the JS layer
            // never learns about the incoming call.
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
        activeCallUUID = nil; activeCallId = nil; activeCallerNumber = ""; activeCallReportedAt = .distantPast; answerConfirmedForCallId = ""
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // Prepare the route but let CallKit own activation (didActivate:).
        // Activating the session here races the system session and produces a
        // connected CallKit call with no audio path.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        // Settle the transaction BEFORE waking JS. With retainUntilConsumed a
        // retained Capacitor listener can answer SYNCHRONOUSLY inside
        // notifyListeners, and completeAnswer() then ran while
        // pendingAnswerAction was still the PREVIOUS action (or nil): it found
        // nothing to fulfill, action.fulfill() was never called, and CallKit tore
        // the call down at the 32s timeout. Fulfill any stale action first, then
        // publish the authoritative one, then wake JS.
        pendingAnswerAction?.fulfill()
        pendingAnswerAction = action
        // Pin the SIP transport + audio session up while the WebView performs
        // the actual SIP answer, possibly still in the background.
        NotificationCenter.default.post(name: Notification.Name("PpVoipCallAnswered"), object: nil, userInfo: ["callId": activeCallId ?? ""])
        // retainUntilConsumed: Answer can be tapped from the lock screen while
        // the WebView is suspended; without it the event is dropped and the
        // call is never picked up on the SIP side.
        notifyListeners("incomingCallAnswered", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ], retainUntilConsumed: true)
        // Safety net: never present a falsely connected CallKit call.
        // 32s is deliberately GREATER than PP_PENDING_ANSWER_TIMEOUT_MS (30s in
        // ppSipProvider): the pending-answer intent stays valid for 30s while the
        // caller is still hearing the greeting, so a 12s CallKit timeout used to
        // fail() the action while the SIP path was still legitimately working.
        // Ordering must always be: JS watchdogs < SIP intent (30s) < CallKit (32s).
        DispatchQueue.main.asyncAfter(deadline: .now() + 32.0) { [weak self, weak action] in
            guard let self = self, let action = action, self.pendingAnswerAction === action else { return }
            self.pendingAnswerAction = nil
            NSLog("[PpVoipCall] answer action timed out — SIP dialog not confirmed after 32s")
            action.fail()
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        pendingAnswerAction?.fail(); pendingAnswerAction = nil
        notifyListeners("incomingCallRejected", data: [
            "callUUID": action.callUUID.uuidString,
            "callId": activeCallId ?? ""
        ])
        activeCallUUID = nil; activeCallId = nil; activeCallerNumber = ""; activeCallReportedAt = .distantPast; answerConfirmedForCallId = ""
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // ring15 - THE AUDIO FIX. This callback is the ONLY moment iOS lets us take
        // the CallKit-owned session, and it was doing the one thing that breaks
        // WebRTC: calling setActive(true) on a session CallKit had already
        // activated, WITHOUT ever configuring category/mode. Log 137 shows the
        // consequence directly - every activation during a call reports
        // hadOutputs=n, i.e. AVAudioSession has NO output route, so neither
        // direction can carry audio.
        //
        // Correct order, and it must be exactly this order:
        //   1. category/mode FIRST. .playAndRecord + .voiceChat is what makes iOS
        //      attach the earpiece/speaker route and enable the mic. Setting it
        //      after activation is silently ignored.
        //   2. setActive(true) is deliberately NOT called again. CallKit already
        //      activated this session; re-activating it makes iOS re-arbitrate the
        //      route and drop the outputs (that is the hadOutputs=n we measured).
        //   3. overrideOutputAudioPort(.none) pins the earpiece, per the product
        //      rule that the speaker must only ever be enabled by the user tapping
        //      the dedicated button.
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat,
                                         options: [.allowBluetoothHFP, .allowBluetoothA2DP])
            try audioSession.overrideOutputAudioPort(.none)
        } catch {
            NSLog("[PpVoipCall] didActivate: category/route failed %@", error.localizedDescription)
        }
        let outs = audioSession.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")
        let ins = audioSession.currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ",")
        NSLog("[PpVoipCall] CallKit didActivate audio session outputs=[%@] inputs=[%@] sr=%.0f",
              outs.isEmpty ? "NONE" : outs, ins.isEmpty ? "NONE" : ins, audioSession.sampleRate)
        // Tell the keep-alive plugin that CallKit owns the session now, so its
        // 2-second watchdog stops reconfiguring it underneath WebRTC.
        NotificationCenter.default.post(name: Notification.Name("PpVoipAudioSessionActivated"), object: nil)
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Logged because a didDeactivate arriving DURING a call is the signature of
        // a competing setActive() call elsewhere in the app.
        NSLog("[PpVoipCall] CallKit didDeactivate audio session (call should be over)")
        NotificationCenter.default.post(name: Notification.Name("PpVoipAudioSessionDeactivated"), object: nil)
    }
}
