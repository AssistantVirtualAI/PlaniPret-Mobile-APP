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
    /// Instant ou l'action de decrochage CallKit a ete fulfillee. Sert a ne
    /// jamais resoudre deux fois la meme action.
    private var answerFulfilledAt: Date?
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
            answerFulfilledAt = nil
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
        // L'action de decrochage est desormais fulfillee des sa reception (voir
        // perform CXAnswerCallAction). Elle ne doit donc plus etre resolue une
        // seconde fois ici : CallKit journalise toute double resolution comme une
        // erreur, et un fail() sur une action deja fulfillee est ignore.
        let alreadyFulfilled = answerFulfilledAt != nil
        answerFulfilledAt = nil
        if ok {
            answerConfirmedForCallId = callId.isEmpty ? (activeCallId ?? "") : callId
            if !alreadyFulfilled { action.fulfill() }
            call.resolve(["ok": true, "reason": alreadyFulfilled ? "confirmed_after_fulfill" : "fulfilled"])
            return
        }
        answerConfirmedForCallId = ""
        if alreadyFulfilled {
            // Le decrochage a echoue cote SIP alors que CallKit affiche deja un
            // appel connecte : il faut le terminer explicitement, sinon
            // l'interface reste bloquee sur un appel fantome.
            if let uuid = activeCallUUID {
                provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
                activeCallUUID = nil; activeCallId = nil; activeCallerNumber = ""
            }
            NSLog("[PpVoipCall] SIP answer failed after fulfill - CallKit call ended")
        } else {
            action.fail()
        }
        call.resolve(["ok": true])
    }

    /// Jetons que NetSapiens et les trunks en amont placent dans le champ
    /// appelant quand le numero est masque. Aucun n'est composable.
    private static let anonymousTokens: Set<String> = [
        "anonymous", "unknown", "unavailable", "restricted", "private",
        "prive", "masque", "withheld", "blocked", "nonumber", "no-number",
        "no_number", "null", "none", ""
    ]

    /// Retourne un numero reellement composable, ou "" s'il n'y en a pas.
    ///
    /// - Normalise en E.164 les numeros nord-americains a 10 ou 11 chiffres :
    ///   un handle .phoneNumber sans "+" n'est pas associe au carnet d'adresses
    ///   par iOS, qui retombe alors sur son libelle generique.
    /// - Laisse les extensions internes (3 a 6 chiffres) telles quelles.
    /// - Retourne "" pour tout appelant masque ou toute valeur non numerique.
    static func dialableNumber(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.lowercased().hasPrefix("sip:") { value = String(value.dropFirst(4)) }
        if let at = value.firstIndex(of: "@") { value = String(value[value.startIndex..<at]) }
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = value.lowercased().replacingOccurrences(of: " ", with: "")
        if anonymousTokens.contains(token) { return "" }
        let digits = value.filter { $0.isNumber }
        if digits.isEmpty { return "" }
        // Un "0", "00", "000"... n'est pas un appelant.
        if digits.allSatisfy({ $0 == "0" }) { return "" }
        switch digits.count {
        case 3...6:
            return digits                                  // extension interne
        case 10:
            return "+1" + digits                           // NANP sans indicatif
        case 11 where digits.hasPrefix("1"):
            return "+" + digits
        case 8...15:
            return "+" + digits                            // international
        default:
            return ""
        }
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
        let rawName = (dict["callerName"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from"] as? String) ?? ""
        let rawNumber = (dict["callerNumber"] as? String) ?? (dict["from_number"] as? String) ?? (dict["from_user"] as? String) ?? ""
        // Le serveur signale explicitement un appelant masque. On ne s'y fie pas
        // seul : ce plugin doit rester correct face a un push emis par une
        // version anterieure du webhook.
        let serverSaysAnonymous = (dict["callerAnonymous"] as? Bool) ?? false
        // callerNumber ne doit contenir QU'UN numero reellement composable.
        // Sinon CXHandle(type: .phoneNumber) est rejete par iOS, qui affiche
        // alors son propre libelle "numero indisponible" - le defaut du 3 aout.
        let callerNumber = serverSaysAnonymous ? "" : Self.dialableNumber(rawNumber)
        let callerName: String = {
            let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, Self.dialableNumber(trimmed).isEmpty || trimmed == callerNumber {
                return trimmed
            }
            if !callerNumber.isEmpty { return callerNumber }
            return "Appel masque"
        }()

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
        // CXHandle(type: .phoneNumber) exige de l'E.164. Quand le numero est
        // absent, masque ou non composable, on passe en .generic avec un libelle
        // lisible : iOS affiche alors ce libelle au lieu de le remplacer par son
        // propre "numero indisponible".
        let handle: CXHandle = callerNumber.isEmpty
            ? CXHandle(type: .generic, value: callerName.isEmpty ? "Appel masque" : callerName)
            : CXHandle(type: .phoneNumber, value: callerNumber)
        update.remoteHandle = handle
        NSLog("[PpVoipCall] CallKit handle type=%@ value=%@ raw=%@",
              callerNumber.isEmpty ? "generic" : "phoneNumber",
              callerNumber.isEmpty ? callerName : callerNumber,
              rawNumber)
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
        if answerFulfilledAt == nil { pendingAnswerAction?.fail() }
        pendingAnswerAction = nil
        answerFulfilledAt = nil
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
        // LE CORRECTIF DU BOUTON DECROCHER GELE (3 aout).
        //
        // Cette action etait fulfillee seulement apres confirmation du dialogue
        // SIP par completeAnswer(). Quand le decrochage vient d'un push CallKit
        // et que JsSIP ne possede plus l'AOR, cette confirmation n'arrive jamais :
        // CallKit laisse alors son interface figee jusqu'au timeout de 32 s, et le
        // bouton "decrocher" ne repond plus - exactement le symptome observe.
        //
        // La doctrine Apple est de fulfiller des que l'application ACCEPTE de
        // decrocher, pas quand le media est etabli. L'etablissement reel est
        // rapporte ensuite par reportCall(with:updated:) ; un echec est signale
        // par reportCall(with:endedAt:reason:) et non par un bouton mort.
        action.fulfill()
        answerFulfilledAt = Date()
        NSLog("[PpVoipCall] answer action fulfilled immediately callId=%@", activeCallId ?? "")
        // ring16 - claim audio ownership HERE, not at didActivate. Log 138 shows
        // three "audio session (re)activated ... hadOutputs=n" emitted by the
        // keep-alive watchdog BETWEEN the 200 OK and didActivate, because the
        // ownership flag was only armed at didActivate. Each of those touches the
        // session while it still has no route, and that is what drives WebKit into
        // "beginInterruption but session is already interrupted!". From the moment
        // CallKit asks us to answer, nobody else may touch the session.
        NotificationCenter.default.post(name: Notification.Name("PpVoipAudioSessionActivated"), object: nil)
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
        // L'action etant deja fulfillee, ce filet ne peut plus "echouer" le
        // bouton : il termine l'appel proprement si le dialogue SIP ne s'est
        // jamais etabli, ce qui est la facon correcte de signaler l'echec.
        DispatchQueue.main.asyncAfter(deadline: .now() + 32.0) { [weak self, weak action] in
            guard let self = self, let action = action, self.pendingAnswerAction === action else { return }
            self.pendingAnswerAction = nil
            self.answerFulfilledAt = nil
            guard let uuid = self.activeCallUUID else { return }
            NSLog("[PpVoipCall] SIP dialog not confirmed after 32s - ending CallKit call")
            self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            self.activeCallUUID = nil; self.activeCallId = nil
            self.activeCallerNumber = ""; self.answerConfirmedForCallId = ""
        }
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Une action deja fulfillee ne doit pas etre fail() : ce serait une
        // double resolution, que CallKit journalise comme une erreur.
        if answerFulfilledAt == nil { pendingAnswerAction?.fail() }
        pendingAnswerAction = nil
        answerFulfilledAt = nil
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

        // ring16 - THE REMAINING HALF OF THE AUDIO FIX.
        // ring15 made the route correct (log 138: outputs=[Receiver],
        // inputs=[MicrophoneBuiltIn], 48 kHz) yet the call was still silent. The
        // reason is in the same log, BEFORE this callback fires:
        //     AudioSession::beginInterruption but session is already interrupted!
        //     [recording-notice] play blocked "The operation was aborted."
        // Between the SIP 200 OK and this didActivate the session has no output
        // route, so WebKit suspends its own audio pipeline. When the route finally
        // appears, WebKit does NOT resume by itself: the <audio> element stays
        // paused and the mic capture stays stopped, which is exactly a
        // two-way-silent call with every indicator green.
        //
        // So we tell the web layer that the route is live. The JS side re-attaches
        // srcObject and calls play() again, which is the only way to pull WebKit
        // out of its interrupted state.
        notifyListeners("audioSessionActivated", data: [
            "outputs": outs,
            "inputs": ins,
            "sampleRate": audioSession.sampleRate
        ])
    }

    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // Logged because a didDeactivate arriving DURING a call is the signature of
        // a competing setActive() call elsewhere in the app.
        NSLog("[PpVoipCall] CallKit didDeactivate audio session (call should be over)")
        NotificationCenter.default.post(name: Notification.Name("PpVoipAudioSessionDeactivated"), object: nil)
    }
}
