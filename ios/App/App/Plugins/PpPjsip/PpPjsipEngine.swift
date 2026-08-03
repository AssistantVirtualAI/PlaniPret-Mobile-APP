import Foundation
import AVFoundation

#if canImport(pjsua)
import pjsua

// MARK: - Notifications partagées avec CallKit (PpVoipCall)

extension Notification.Name {
    /// PJSIP a reçu un INVITE entrant → CallKit doit sonner.
    static let ppPjsipIncomingCall = Notification.Name("PpPjsipIncomingCall")
    /// L'appel PJSIP est terminé (BYE, CANCEL, échec) → CallKit doit clore.
    static let ppPjsipCallEnded = Notification.Name("PpPjsipCallEnded")
    /// L'appel PJSIP est connecté (200 OK / ACK) → CallKit passe en "connected".
    static let ppPjsipCallConnected = Notification.Name("PpPjsipCallConnected")
    /// CallKit demande de décrocher l'appel natif.
    static let ppPjsipAnswerRequested = Notification.Name("PpPjsipAnswerRequested")
    /// CallKit demande de raccrocher / refuser l'appel natif.
    static let ppPjsipEndRequested = Notification.Name("PpPjsipEndRequested")
}

// MARK: - Callbacks C (état global : aucune capture possible)

private func ppPjsipLogWriter(_ level: Int32, _ data: UnsafePointer<CChar>?, _ len: Int32) {
    guard let data = data else { return }
    NSLog("[pjsip] %@", String(cString: data).trimmingCharacters(in: .whitespacesAndNewlines))
}

private func ppPjsipOnRegState2(_ accId: pjsua_acc_id, _ info: UnsafeMutablePointer<pjsua_reg_info>?) {
    guard let info = info, let rdata = info.pointee.cbparam else { return }
    let code = Int(rdata.pointee.code.rawValue)
    let reason = ppPjStr(rdata.pointee.reason)
    NSLog("[PpPjsip] REGISTER response acc=%d code=%d reason=%@", accId, code, reason)
    PjsipEngine.shared.handleRegState(accId: accId, code: code, reason: reason)
}

private func ppPjsipOnIncomingCall(
    _ accId: pjsua_acc_id,
    _ callId: pjsua_call_id,
    _ rdata: UnsafeMutablePointer<pjsip_rx_data>?
) {
    var info = pjsua_call_info()
    pjsua_call_get_info(callId, &info)
    let remoteUri = ppPjStr(info.remote_info)
    PjsipEngine.shared.handleIncomingCall(callId: callId, remoteUri: remoteUri)
}

private func ppPjsipOnCallState(_ callId: pjsua_call_id, _ event: UnsafeMutablePointer<pjsip_event>?) {
    var info = pjsua_call_info()
    pjsua_call_get_info(callId, &info)
    PjsipEngine.shared.handleCallState(
        callId: callId,
        state: info.state,
        lastCode: Int(info.last_status.rawValue),
        remoteUri: ppPjStr(info.remote_info)
    )
}

private func ppPjsipOnCallMediaState(_ callId: pjsua_call_id) {
    var info = pjsua_call_info()
    pjsua_call_get_info(callId, &info)
    PjsipEngine.shared.handleCallMediaState(callId: callId, info: info)
}

private func ppPjsipEnterContext(_ userData: UnsafeMutableRawPointer?) {
    PjsipEngine.shared.runScheduledWork()
}

func ppPjStr(_ s: pj_str_t) -> String {
    guard let ptr = s.ptr, s.slen > 0 else { return "" }
    let data = Data(bytes: ptr, count: Int(s.slen))
    return String(data: data, encoding: .utf8) ?? ""
}

/// pj_str_t sur une chaîne C dupliquée : PJSIP ne copie pas, le buffer doit
/// survivre à l'appel. Les duplicats sont conservés par l'engine.
func ppMakePjStr(_ value: String, keep: inout [UnsafeMutablePointer<CChar>]) -> pj_str_t {
    let dup = strdup(value)!
    keep.append(dup)
    var out = pj_str_t()
    out.ptr = dup
    out.slen = pj_ssize_t(strlen(dup))
    return out
}

/// `sip:5551234567@planipret.ca` → `5551234567`
private func ppUserFromUri(_ uri: String) -> String {
    guard let range = uri.range(of: "sip:") else {
        return uri.trimmingCharacters(in: CharacterSet(charactersIn: "<>\" "))
    }
    let tail = uri[range.upperBound...]
    return String(tail.prefix(while: { $0 != "@" }))
}

private func ppDisplayFromUri(_ uri: String) -> String {
    guard let lt = uri.firstIndex(of: "<") else { return ppUserFromUri(uri) }
    let name = uri[uri.startIndex..<lt]
        .trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
    return name.isEmpty ? ppUserFromUri(uri) : name
}

// MARK: - Engine

final class PjsipEngine {
    static let shared = PjsipEngine()

    /// Injecté par le plugin Capacitor pour diffuser les events vers JS.
    var eventSink: ((String, [String: Any]) -> Void)?

    private let thread = PjsipWorkerThread()
    private let lock = NSLock()

    private var started = false
    private var scheduledWork: (() -> Void)?
    private var strings: [UnsafeMutablePointer<CChar>] = []
    private var pjThreadDescs: [UnsafeMutableRawPointer] = []


    // Sonde
    private var probeAccId: pjsua_acc_id = pjsua_acc_id(-1)
    private var probeCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var probeStartedAt = Date()

    // Production
    private var accId: pjsua_acc_id = pjsua_acc_id(-1)
    private var username = ""
    private var domain = ""
    private var registered = false
    private var activeCall: pjsua_call_id = pjsua_call_id(-1)
    private var muted = false
    private var speakerOn = false
    private var audioSessionReady = false

    var currentCallIdString: String { activeCall >= 0 ? String(activeCall) : "" }

    private init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: .ppPjsipAnswerRequested, object: nil, queue: nil) { [weak self] _ in
            self?.answer(callId: nil) { _ in }
        }
        nc.addObserver(forName: .ppPjsipEndRequested, object: nil, queue: nil) { [weak self] _ in
            self?.hangup(callId: nil)
        }
        // CallKit a recu un "decrocher" avant que l'INVITE natif ne soit
        // presente : si un appel natif existe deja, on repond immediatement.
        nc.addObserver(forName: Notification.Name("PpPjsipAnswerPending"), object: nil, queue: nil) { [weak self] _ in
            guard let self = self, self.activeCall >= 0 else { return }
            self.answer(callId: nil) { _ in }
        }
        nc.addObserver(forName: Notification.Name("PpPjsipMuteRequested"), object: nil, queue: nil) { [weak self] note in
            self?.setMute((note.userInfo?["muted"] as? Bool) ?? false)
        }
        nc.addObserver(forName: Notification.Name("PpPjsipDtmfRequested"), object: nil, queue: nil) { [weak self] note in
            self?.sendDTMF((note.userInfo?["digits"] as? String) ?? "")
        }
        // CallKit est seul maître de l'AVAudioSession : PJSIP n'ouvre son
        // périphérique audio qu'une fois la session activée par le système.
        nc.addObserver(forName: Notification.Name("PpCallKitAudioActivated"), object: nil, queue: nil) { [weak self] _ in
            self?.onAudioSessionActivated()
        }
        nc.addObserver(forName: Notification.Name("PpCallKitAudioDeactivated"), object: nil, queue: nil) { [weak self] _ in
            self?.audioSessionReady = false
        }
    }

    // MARK: Configuration production

    func configure(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int,
        displayName: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        self.username = username
        self.domain = domain

        thread.run { [weak self] in
            guard let self = self else { return }
            do {
                try self.ensureStackStarted(withAudio: true)
                self.scheduleOnPjsipThread {
                    do {
                        try self.addProductionAccount(
                            username: username,
                            password: password,
                            domain: domain,
                            server: server,
                            port: port,
                            displayName: displayName
                        )
                        completion(.success(()))
                    } catch {
                        completion(.failure(error))
                    }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func addProductionAccount(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int,
        displayName: String
    ) throws {
        // AOR unique par appareil : `<ext>M`. Une seule pile REGISTER sur cette
        // AOR — JsSIP doit céder (`pp:sip-native-owns-aor`), sinon NetSapiens
        // ferme la socket la plus ancienne (WSS 1001).
        if accId != pjsua_acc_id(-1) {
            pjsua_acc_set_registration(accId, pj_bool_t(0))
            pjsua_acc_del(accId)
            accId = pjsua_acc_id(-1)
        }

        let instanceId = "urn:uuid:\(ppStableInstanceUuid())"
        var acc = pjsua_acc_config()
        pjsua_acc_config_default(&acc)

        acc.id = ppMakePjStr("\"\(displayName)\" <sip:\(username)@\(domain)>", keep: &strings)
        acc.reg_uri = ppMakePjStr("sip:\(server):\(port);transport=tls", keep: &strings)
        acc.cred_count = 1
        acc.cred_info.0.realm = ppMakePjStr("*", keep: &strings)
        acc.cred_info.0.scheme = ppMakePjStr("digest", keep: &strings)
        acc.cred_info.0.username = ppMakePjStr(username, keep: &strings)
        acc.cred_info.0.data_type = 0 // PJSIP_CRED_DATA_PLAIN_PASSWD
        acc.cred_info.0.data = ppMakePjStr(password, keep: &strings)
        acc.proxy_cnt = 1
        acc.proxy.0 = ppMakePjStr("sip:\(server):\(port);transport=tls;lr", keep: &strings)
        acc.reg_timeout = 300
        acc.reg_retry_interval = 15
        acc.reg_first_retry_interval = 5
        acc.register_on_acc_add = pj_bool_t(1)
        acc.allow_contact_rewrite = pj_bool_t(1)
        acc.contact_rewrite_method = 2
        acc.use_srtp = PJMEDIA_SRTP_OPTIONAL
        acc.srtp_secure_signaling = 0
        acc.contact_params = ppMakePjStr(";+sip.instance=\"<\(instanceId)>\"", keep: &strings)

        NSLog("[PpPjsip] production REGISTER → sip:%@:%d TLS aor=sip:%@@%@", server, Int32(port), username, domain)
        try check(pjsua_acc_add(&acc, pj_bool_t(1), &accId), "pjsua_acc_add")
    }

    /// UUID stable par installation : NetSapiens déduplique les contacts sur
    /// `+sip.instance`, un UUID neuf à chaque lancement crée des doublons.
    private func ppStableInstanceUuid() -> String {
        let key = "pp.pjsip.instance-uuid.v1"
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let fresh = UUID().uuidString.lowercased()
        UserDefaults.standard.set(fresh, forKey: key)
        return fresh
    }

    func setRegistration(_ on: Bool) {
        guard accId != pjsua_acc_id(-1) else { return }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                pjsua_acc_set_registration(self.accId, pj_bool_t(on ? 1 : 0))
            }
        }
    }

    // MARK: Appels

    func makeCall(destination: String, completion: @escaping (Result<String, Error>) -> Void) {
        guard accId != pjsua_acc_id(-1) else {
            completion(.failure(NSError(domain: "PpPjsip", code: 412, userInfo: [NSLocalizedDescriptionKey: "engine not initialized"])))
            return
        }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                var keep: [UnsafeMutablePointer<CChar>] = []
                let target = destination.contains("@")
                    ? (destination.hasPrefix("sip:") ? destination : "sip:\(destination)")
                    : "sip:\(destination)@\(self.domain)"
                var uri = ppMakePjStr(target, keep: &keep)
                var newCall = pjsua_call_id(-1)
                let status = pjsua_call_make_call(self.accId, &uri, nil, nil, nil, &newCall)
                keep.forEach { free($0) }
                if status != pj_status_t(0) {
                    completion(.failure(NSError(domain: "PpPjsip", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "pjsua_call_make_call failed"])))
                    return
                }
                self.activeCall = newCall
                self.muted = false
                NSLog("[PpPjsip] outgoing INVITE → %@ callId=%d", target, newCall)
                completion(.success(String(newCall)))
            }
        }
    }

    func answer(callId: String?, completion: @escaping (Bool) -> Void) {
        let target = resolveCall(callId)
        guard target >= 0 else { completion(false); return }
        var done = false
        let finish: (Bool) -> Void = { [weak self] ok in
            guard let self = self else { return }
            self.lock.lock()
            let already = done
            done = true
            self.lock.unlock()
            if already { return }
            completion(ok)
        }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.registerCurrentThreadIfNeeded()
            self.scheduleOnPjsipThread {
                if done { return }
                let status = pjsua_call_answer(target, 200, nil, nil)
                NSLog("[PpPjsip] answer callId=%d status=%d", target, status)
                finish(status == pj_status_t(0))
            }
        }
        // Filet de sécurité : si le timer PJSIP ne s'exécute pas (thread non
        // enregistré, pile occupée), on envoie le 200 OK depuis un thread
        // enregistré manuellement. Sans ça, CallKit affiche « en cours » alors
        // que l'appelant continue d'entendre la sonnerie.
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + 1.0) { [weak self] in
            guard let self = self, !done else { return }
            self.registerCurrentThreadIfNeeded()
            let status = pjsua_call_answer(target, 200, nil, nil)
            NSLog("[PpPjsip] answer FALLBACK callId=%d status=%d", target, status)
            finish(status == pj_status_t(0))
        }

    }


    func hangup(callId: String?) {
        let target = resolveCall(callId)
        guard target >= 0 else { return }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                // 603 Decline (et non 486) : NetSapiens bascule sur la
                // messagerie sur 486, un refus explicite arrête la sonnerie.
                pjsua_call_hangup(target, 603, nil, nil)
            }
        }
    }

    func setMute(_ on: Bool) {
        muted = on
        guard activeCall >= 0 else { return }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                var info = pjsua_call_info()
                pjsua_call_get_info(self.activeCall, &info)
                guard info.conf_slot >= 0 else { return }
                // Coupe le flux micro → conférence (direction sortante).
                pjsua_conf_adjust_rx_level(info.conf_slot, on ? 0.0 : 1.0)
            }
        }
    }

    func setSpeaker(_ enabled: Bool) {
        speakerOn = enabled
        // CallKit possède la session : on ne change QUE la route de sortie.
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            try? session.overrideOutputAudioPort(enabled ? .speaker : .none)
        }
    }

    func sendDTMF(_ digits: String) {
        guard activeCall >= 0, !digits.isEmpty else { return }
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                var keep: [UnsafeMutablePointer<CChar>] = []
                var d = ppMakePjStr(digits, keep: &keep)
                // RFC 2833 d'abord, repli SIP INFO si le média n'est pas prêt.
                if pjsua_call_dial_dtmf(self.activeCall, &d) != pj_status_t(0) {
                    var body = pjsua_call_send_dtmf_param()
                    pjsua_call_send_dtmf_param_default(&body)
                    body.method = PJSUA_DTMF_METHOD_SIP_INFO
                    body.digits = d
                    pjsua_call_send_dtmf(self.activeCall, &body)
                }
                keep.forEach { free($0) }
            }
        }
    }

    func stateSnapshot() -> [String: Any] {
        [
            "available": started,
            "registered": registered,
            "username": username,
            "callId": currentCallIdString,
            "muted": muted,
            "speaker": speakerOn
        ]
    }

    private func resolveCall(_ callId: String?) -> pjsua_call_id {
        if let raw = callId, let parsed = Int32(raw), parsed >= 0 { return pjsua_call_id(parsed) }
        return activeCall
    }

    // MARK: Callbacks PJSIP

    func handleRegState(accId: pjsua_acc_id, code: Int, reason: String) {
        if accId == probeAccId {
            completeRegistrationProbe(code: code, reason: reason)
            return
        }
        guard accId == self.accId else { return }
        registered = code == 200
        let state = registered ? "registered" : (code == 0 ? "unregistered" : "failed")
        emit("registrationState", ["state": state, "code": code, "reason": reason, "username": username])
    }

    func handleIncomingCall(callId: pjsua_call_id, remoteUri: String) {
        // Un seul appel simultané : tout INVITE concurrent est refusé (486).
        if activeCall >= 0 && activeCall != callId {
            pjsua_call_answer(callId, 486, nil, nil)
            return
        }
        activeCall = callId
        muted = false
        let number = ppUserFromUri(remoteUri)
        let name = ppDisplayFromUri(remoteUri)
        NSLog("[PpPjsip] incoming INVITE callId=%d from=%@", callId, remoteUri)

        // Sonnerie 180 immédiate, sinon NetSapiens bascule en messagerie.
        pjsua_call_answer(callId, 180, nil, nil)

        // CallKit sonne à partir de l'INVITE natif — plus de dépendance JsSIP.
        NotificationCenter.default.post(
            name: .ppPjsipIncomingCall,
            object: nil,
            userInfo: ["callId": String(callId), "callerNumber": number, "callerName": name]
        )
        emit("incomingCall", ["callId": String(callId), "remoteNumber": number, "remoteName": name])
    }

    func handleCallState(callId: pjsua_call_id, state: pjsip_inv_state, lastCode: Int, remoteUri: String) {
        let label: String
        switch state {
        case PJSIP_INV_STATE_CALLING, PJSIP_INV_STATE_EARLY: label = "ringing"
        case PJSIP_INV_STATE_CONNECTING: label = "connecting"
        case PJSIP_INV_STATE_CONFIRMED: label = "connected"
        case PJSIP_INV_STATE_DISCONNECTED: label = "disconnected"
        default: label = "unknown"
        }

        emit("callState", [
            "callId": String(callId),
            "state": label,
            "code": lastCode,
            "remoteNumber": ppUserFromUri(remoteUri)
        ])

        if state == PJSIP_INV_STATE_CONFIRMED {
            NotificationCenter.default.post(
                name: .ppPjsipCallConnected, object: nil, userInfo: ["callId": String(callId)]
            )
        }
        if state == PJSIP_INV_STATE_DISCONNECTED {
            if activeCall == callId { activeCall = pjsua_call_id(-1) }
            audioSessionReady = false
            NotificationCenter.default.post(
                name: .ppPjsipCallEnded, object: nil,
                userInfo: ["callId": String(callId), "code": lastCode]
            )
        }
    }

    func handleCallMediaState(callId: pjsua_call_id, info: pjsua_call_info) {
        guard info.media_status == PJSUA_CALL_MEDIA_ACTIVE, info.conf_slot >= 0 else { return }
        // Pont RTP ↔ périphérique audio : sans ces deux connexions, l'appel est
        // muet dans une direction (cause historique du "one-way audio").
        pjsua_conf_connect(info.conf_slot, 0)
        pjsua_conf_connect(0, info.conf_slot)
        if muted { pjsua_conf_adjust_rx_level(info.conf_slot, 0.0) }
        NSLog("[PpPjsip] media active callId=%d slot=%d", callId, info.conf_slot)
        emit("callState", ["callId": String(callId), "state": "media"])
    }

    private func onAudioSessionActivated() {
        audioSessionReady = true
        thread.run { [weak self] in
            guard let self = self else { return }
            self.scheduleOnPjsipThread {
                // Ouvre le périphérique audio APRÈS activation par CallKit.
                pjsua_set_snd_dev(0, 0)
                if self.activeCall >= 0 {
                    var info = pjsua_call_info()
                    pjsua_call_get_info(self.activeCall, &info)
                    if info.media_status == PJSUA_CALL_MEDIA_ACTIVE, info.conf_slot >= 0 {
                        pjsua_conf_connect(info.conf_slot, 0)
                        pjsua_conf_connect(0, info.conf_slot)
                    }
                }
            }
        }
    }

    private func emit(_ name: String, _ payload: [String: Any]) {
        DispatchQueue.main.async { [weak self] in self?.eventSink?(name, payload) }
    }

    // MARK: Sonde TLS

    func registerTest(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        lock.lock()
        if probeCompletion != nil {
            lock.unlock()
            completion(.failure(NSError(domain: "PpPjsip", code: 409, userInfo: [NSLocalizedDescriptionKey: "A probe is already running"])))
            return
        }
        probeCompletion = completion
        probeStartedAt = Date()
        lock.unlock()

        thread.run { [weak self] in
            guard let self = self else { return }
            do {
                try self.ensureStackStarted(withAudio: false)
                self.scheduleOnPjsipThread {
                    do {
                        try self.addProbeAccount(
                            username: username, password: password,
                            domain: domain, server: server, port: port
                        )
                    } catch {
                        self.finishProbe(.failure(error))
                    }
                }
            } catch {
                self.finishProbe(.failure(error))
            }
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 20) { [weak self] in
            self?.finishProbe(.failure(NSError(
                domain: "PpPjsip", code: 408,
                userInfo: [NSLocalizedDescriptionKey: "timeout — no SIP response after 20s"]
            )))
        }
    }

    private func addProbeAccount(
        username: String, password: String, domain: String, server: String, port: Int
    ) throws {
        let probeUser = "\(username)PROBE"
        let instanceId = "urn:uuid:\(UUID().uuidString.lowercased())"

        var acc = pjsua_acc_config()
        pjsua_acc_config_default(&acc)
        acc.id = ppMakePjStr("sip:\(probeUser)@\(domain)", keep: &strings)
        acc.reg_uri = ppMakePjStr("sip:\(server):\(port);transport=tls", keep: &strings)
        acc.cred_count = 1
        acc.cred_info.0.realm = ppMakePjStr("*", keep: &strings)
        acc.cred_info.0.scheme = ppMakePjStr("digest", keep: &strings)
        acc.cred_info.0.username = ppMakePjStr(username, keep: &strings)
        acc.cred_info.0.data_type = 0
        acc.cred_info.0.data = ppMakePjStr(password, keep: &strings)
        acc.proxy_cnt = 1
        acc.proxy.0 = ppMakePjStr("sip:\(server):\(port);transport=tls;lr", keep: &strings)
        acc.reg_timeout = 300
        acc.register_on_acc_add = pj_bool_t(1)
        acc.contact_params = ppMakePjStr(";+sip.instance=\"<\(instanceId)>\"", keep: &strings)

        NSLog("[PpPjsip] PROBE REGISTER → sip:%@:%d TLS aor=sip:%@@%@", server, Int32(port), probeUser, domain)
        try check(pjsua_acc_add(&acc, pj_bool_t(1), &probeAccId), "pjsua_acc_add(probe)")
    }

    private func completeRegistrationProbe(code: Int, reason: String) {
        let elapsed = Int(Date().timeIntervalSince(probeStartedAt) * 1000)
        if code == 200 {
            finishProbe(.success([
                "ok": true, "code": code, "reason": reason.isEmpty ? "OK" : reason,
                "transport": "TLS", "elapsedMs": elapsed
            ]))
        } else if code >= 300 || code == 0 {
            finishProbe(.success([
                "ok": false, "code": code, "reason": reason,
                "transport": "TLS", "elapsedMs": elapsed
            ]))
        }
    }

    private func finishProbe(_ result: Result<[String: Any], Error>) {
        lock.lock()
        let cb = probeCompletion
        probeCompletion = nil
        lock.unlock()
        guard let cb = cb else { return }
        if probeAccId != pjsua_acc_id(-1) {
            pjsua_acc_set_registration(probeAccId, pj_bool_t(0))
            pjsua_acc_del(probeAccId)
            probeAccId = pjsua_acc_id(-1)
        }
        cb(result)
    }

    // MARK: Pile

    private func ensureStackStarted(withAudio: Bool) throws {
        if started {
            if withAudio { /* le périphérique s'ouvre à l'activation CallKit */ }
            return
        }

        try check(pjsua_create(), "pjsua_create")

        var cfg = pjsua_config()
        pjsua_config_default(&cfg)
        cfg.cb.on_reg_state2 = ppPjsipOnRegState2
        cfg.cb.on_incoming_call = ppPjsipOnIncomingCall
        cfg.cb.on_call_state = ppPjsipOnCallState
        cfg.cb.on_call_media_state = ppPjsipOnCallMediaState
        cfg.max_calls = 2

        var logCfg = pjsua_logging_config()
        pjsua_logging_config_default(&logCfg)
        logCfg.level = 5
        logCfg.console_level = 5
        logCfg.msg_logging = pj_bool_t(1)
        logCfg.cb = ppPjsipLogWriter

        var mediaCfg = pjsua_media_config()
        pjsua_media_config_default(&mediaCfg)
        mediaCfg.no_vad = pj_bool_t(1)
        mediaCfg.clock_rate = 16000
        mediaCfg.snd_clock_rate = 16000
        mediaCfg.ec_tail_len = 0 // l'AEC est fourni par iOS (voiceChat)

        try check(pjsua_init(&cfg, &logCfg, &mediaCfg), "pjsua_init")

        var tcfg = pjsua_transport_config()
        pjsua_transport_config_default(&tcfg)
        tcfg.port = 0
        var transportId = pjsua_transport_id(-1)
        let tlsStatus = pjsua_transport_create(PJSIP_TRANSPORT_TLS, &tcfg, &transportId)
        if tlsStatus != pj_status_t(0) { logTlsFailureDiagnostics(status: tlsStatus) }
        try check(tlsStatus, "pjsua_transport_create(TLS)")

        try check(pjsua_start(), "pjsua_start")
        // Périphérique nul par défaut : CallKit décidera quand ouvrir l'audio.
        pjsua_set_null_snd_dev()

        started = true
        NSLog("[PpPjsip] stack started (TLS transport id=%d)", transportId)
    }

    // MARK: Contexte PJSIP

    /// PJLIB refuse tout appel provenant d'un thread inconnu (assertion
    /// "Calling pjlib from unknown thread"). Les blocs exécutés sur la
    /// DispatchQueue GCD peuvent changer de thread système à tout moment :
    /// on enregistre donc le thread courant à la demande, avec un descripteur
    /// conservé en mémoire pour toute la durée de vie du process.
    func registerCurrentThreadIfNeeded() {
        guard started else { return }
        if pj_thread_is_registered() != 0 { return }
        let count = max(1, MemoryLayout<pj_thread_desc>.size / MemoryLayout<Int>.size)
        let desc = UnsafeMutablePointer<Int>.allocate(capacity: count)
        desc.initialize(repeating: 0, count: count)
        var handle: UnsafeMutablePointer<pj_thread_t>?
        let status = pj_thread_register("pp-gcd", desc, &handle)
        NSLog("[PpPjsip] pj_thread_register status=%d", status)
        lock.lock()
        pjThreadDescs.append(UnsafeMutableRawPointer(desc))
        lock.unlock()
    }

    private func scheduleOnPjsipThread(_ work: @escaping () -> Void) {
        registerCurrentThreadIfNeeded()
        lock.lock()
        let previous = scheduledWork
        scheduledWork = {
            previous?()
            work()
        }
        lock.unlock()
        pjsua_schedule_timer2(ppPjsipEnterContext, nil, 0)
    }


    func runScheduledWork() {
        lock.lock()
        let work = scheduledWork
        scheduledWork = nil
        lock.unlock()
        work?()
    }

    /// Diagnostic complet quand le transport TLS refuse de démarrer.
    private func logTlsFailureDiagnostics(status: pj_status_t) {
        var buf = [CChar](repeating: 0, count: 256)
        pj_strerror(status, &buf, 256)
        let msg = String(cString: buf)

        var ciphers = [pj_ssl_cipher](repeating: pj_ssl_cipher(0), count: 256)
        var count = UInt32(ciphers.count)
        let cipherStatus = pj_ssl_cipher_get_availables(&ciphers, &count)
        let sslBackendPresent = cipherStatus == pj_status_t(0) && count > 0

        NSLog("[PpPjsip] ❌ pjsua_transport_create(TLS) failed status=%d (%@)", status, msg)
        NSLog("[PpPjsip]   pjsua version        : %@", String(cString: pj_get_version()))
        NSLog("[PpPjsip]   backend SSL présent  : %@ (ciphers=%u, status=%d)",
              sslBackendPresent ? "OUI" : "NON", count, cipherStatus)
        NSLog("[PpPjsip]   TLS est le SEUL transport natif possible — PJSIP n'a pas de transport SIP/WebSocket.")

        if status == pj_status_t(PJSIP_EUNSUPTRANSPORT.rawValue) || !sslBackendPresent {
            NSLog("[PpPjsip] 🔎 CAUSE : PJSIP_EUNSUPTRANSPORT — libpjsip.xcframework construit SANS OpenSSL.")
            NSLog("[PpPjsip]    CORRECTIF : bash scripts/build-pjsip-ios.sh puis npx cap sync ios")
        } else {
            NSLog("[PpPjsip] 🔎 CAUSE probable : réseau/certificat local (backend SSL présent).")
        }
    }

    private func check(_ status: pj_status_t, _ what: String) throws {
        guard status == pj_status_t(0) else {
            var buf = [CChar](repeating: 0, count: 256)
            pj_strerror(status, &buf, 256)
            let msg = String(cString: buf)
            NSLog("[PpPjsip] %@ failed: %@ (%d)", what, msg, status)
            throw NSError(domain: "PpPjsip", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "\(what): \(msg)"])
        }
    }
}

/// Thread dédié et persistant : c'est lui qui appelle pjsua_create(), donc le
/// thread reste enregistré auprès de PJLIB pour toute la durée du process.
final class PjsipWorkerThread {
    private let queue = DispatchQueue(label: "ca.planipret.pjsip.engine")
    func run(_ block: @escaping () -> Void) { queue.async(execute: block) }
}

#endif
