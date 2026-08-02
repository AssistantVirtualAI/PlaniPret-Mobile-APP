import Foundation
import Capacitor

#if canImport(pjsua)
import pjsua
#endif

/**
 * PpPjsip — sonde d'enregistrement SIP natif (PJSIP) pour Planiprêt Mobile.
 *
 * Périmètre volontairement réduit à UN jalon : prouver qu'un REGISTER natif
 * en TLS sur core1.cluster1.ucstack.io:5061 obtient un 200 OK.
 *
 * Contraintes respectées :
 *  - Transport TLS uniquement (PJSIP n'a PAS de transport SIP over WebSocket ;
 *    la macro PJSIP_TRANSPORT_WSS n'existe pas dans pjproject).
 *  - Aucune manipulation d'AVAudioSession (PpVoipCall/CallKit reste seul maître).
 *  - AOR de test distincte (<user>PROBE) + +sip.instance propre : la sonde ne
 *    peut pas voler l'enregistrement de l'agent actif (JsSIP ou PpSipKeepAlive).
 *  - Entrée dans le contexte PJSIP via pjsua_schedule_timer2 (pas de GCD à
 *    travers la frontière PJLIB, qui provoque des crashs aléatoires).
 *  - Trace SIP complète (log level 5) redirigée vers NSLog.
 */
@objc(PpPjsip)
public class PpPjsip: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PpPjsip"
    public let jsName = "PpPjsip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "registerTest", returnType: CAPPluginReturnPromise)
    ]

    @objc func registerTest(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        let username = call.getString("username") ?? ""
        let password = call.getString("password") ?? ""
        let domain = call.getString("domain") ?? ""
        let server = call.getString("server") ?? ""
        let port = call.getInt("port") ?? 5061
        let transport = (call.getString("transport") ?? "TLS").uppercased()

        guard !username.isEmpty, !password.isEmpty, !domain.isEmpty, !server.isEmpty else {
            call.reject("missing_credentials", "username/password/domain/server are required")
            return
        }
        guard transport == "TLS" else {
            call.reject("unsupported_transport", "This probe only supports TLS (PJSIP has no SIP/WSS transport).")
            return
        }

        call.keepAlive = true
        PjsipProbeEngine.shared.registerTest(
            username: username,
            password: password,
            domain: domain,
            server: server,
            port: port
        ) { result in
            switch result {
            case .success(let payload):
                call.resolve(payload)
            case .failure(let err):
                call.reject("pjsip_error", (err as NSError).localizedDescription)
            }
            call.keepAlive = false
        }
        #else
        NSLog("[PpPjsip] binary_missing — libpjsip.xcframework is not linked into the app")
        call.reject(
            "binary_missing",
            "libpjsip.xcframework is not linked. Run scripts/build-pjsip-ios.sh on macOS, then `npx cap sync ios`."
        )
        #endif
    }
}

#if canImport(pjsua)

// MARK: - Callbacks C (pas de capture possible : état global)

private func ppPjsipLogWriter(_ level: Int32, _ data: UnsafePointer<CChar>?, _ len: Int32) {
    guard let data = data else { return }
    NSLog("[pjsip] %@", String(cString: data).trimmingCharacters(in: .whitespacesAndNewlines))
}

private func ppPjsipOnRegState2(_ accId: pjsua_acc_id, _ info: UnsafeMutablePointer<pjsua_reg_info>?) {
    guard let info = info, let rdata = info.pointee.cbparam else { return }
    let code = Int(rdata.pointee.code.rawValue)
    let reason = ppPjStr(rdata.pointee.reason)
    NSLog("[PpPjsip] REGISTER response acc=%d code=%d reason=%@", accId, code, reason)
    PjsipProbeEngine.shared.completeRegistration(code: code, reason: reason)
}

private func ppPjsipEnterContext(_ userData: UnsafeMutableRawPointer?) {
    PjsipProbeEngine.shared.runScheduledWork()
}

private func ppPjStr(_ s: pj_str_t) -> String {
    guard let ptr = s.ptr, s.slen > 0 else { return "" }
    let data = Data(bytes: ptr, count: Int(s.slen))
    return String(data: data, encoding: .utf8) ?? ""
}

/// pj_str_t sur une chaîne C dupliquée : PJSIP ne copie pas, le buffer doit
/// survivre à l'appel. Les duplicats sont conservés par l'engine.
private func ppMakePjStr(_ value: String, keep: inout [UnsafeMutablePointer<CChar>]) -> pj_str_t {
    let dup = strdup(value)!
    keep.append(dup)
    var out = pj_str_t()
    out.ptr = dup
    out.slen = pj_ssize_t(strlen(dup))
    return out
}

// MARK: - Engine

final class PjsipProbeEngine {
    static let shared = PjsipProbeEngine()

    private let thread = PjsipWorkerThread()
    private let lock = NSLock()

    private var started = false
    private var accId: pjsua_acc_id = pjsua_acc_id(-1)
    private var completion: ((Result<[String: Any], Error>) -> Void)?
    private var scheduledWork: (() -> Void)?
    private var strings: [UnsafeMutablePointer<CChar>] = []
    private var startedAt = Date()

    private init() {}

    func registerTest(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        lock.lock()
        if self.completion != nil {
            lock.unlock()
            completion(.failure(NSError(domain: "PpPjsip", code: 409, userInfo: [NSLocalizedDescriptionKey: "A probe is already running"])))
            return
        }
        self.completion = completion
        self.startedAt = Date()
        lock.unlock()

        // Le thread worker est celui qui appelle pjsua_create() : PJLIB
        // l'enregistre automatiquement, donc toute la suite est légale dessus.
        thread.run { [weak self] in
            guard let self = self else { return }
            do {
                try self.ensureStackStarted()
                // Franchissement de la frontière par le scheduler PJSIP, comme
                // le recommande la documentation (jamais via GCD).
                self.scheduleOnPjsipThread {
                    do {
                        try self.addProbeAccount(
                            username: username,
                            password: password,
                            domain: domain,
                            server: server,
                            port: port
                        )
                    } catch {
                        self.finish(.failure(error))
                    }
                }
            } catch {
                self.finish(.failure(error))
            }
        }

        // Filet de sécurité : pas de réponse SIP en 20 s → échec explicite.
        DispatchQueue.global().asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self = self else { return }
            self.finish(.failure(NSError(
                domain: "PpPjsip",
                code: 408,
                userInfo: [NSLocalizedDescriptionKey: "timeout — no SIP response after 20s"]
            )))
        }
    }

    // MARK: pile

    private func ensureStackStarted() throws {
        if started { return }

        try check(pjsua_create(), "pjsua_create")

        var cfg = pjsua_config()
        pjsua_config_default(&cfg)
        cfg.cb.on_reg_state2 = ppPjsipOnRegState2
        cfg.max_calls = 1

        var logCfg = pjsua_logging_config()
        pjsua_logging_config_default(&logCfg)
        logCfg.level = 5
        logCfg.console_level = 5
        logCfg.msg_logging = pj_bool_t(1)   // trace SIP complète
        logCfg.cb = ppPjsipLogWriter

        var mediaCfg = pjsua_media_config()
        pjsua_media_config_default(&mediaCfg)
        // Pas d'audio dans ce lot : device audio nul, AVAudioSession intouchée.
        mediaCfg.no_vad = pj_bool_t(1)

        try check(pjsua_init(&cfg, &logCfg, &mediaCfg), "pjsua_init")

        var tcfg = pjsua_transport_config()
        pjsua_transport_config_default(&tcfg)
        tcfg.port = 0                      // port local éphémère
        var transportId = pjsua_transport_id(-1)
        try check(
            pjsua_transport_create(PJSIP_TRANSPORT_TLS, &tcfg, &transportId),
            "pjsua_transport_create(TLS)"
        )

        try check(pjsua_start(), "pjsua_start")
        // Aucun périphérique audio ouvert : ce lot ne fait que du signalement.
        pjsua_set_null_snd_dev()

        started = true
        NSLog("[PpPjsip] stack started (TLS transport id=%d)", transportId)
    }

    private func addProbeAccount(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int
    ) throws {
        // AOR de test : suffixe PROBE pour ne JAMAIS entrer en concurrence avec
        // l'AOR de production (<ext>M) tenue par JsSIP / PpSipKeepAlive.
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
        acc.cred_info.0.data_type = 0 // PJSIP_CRED_DATA_PLAIN_PASSWD
        acc.cred_info.0.data = ppMakePjStr(password, keep: &strings)
        acc.proxy_cnt = 1
        acc.proxy.0 = ppMakePjStr("sip:\(server):\(port);transport=tls;lr", keep: &strings)
        acc.reg_timeout = 300
        acc.register_on_acc_add = pj_bool_t(1)
        acc.contact_params = ppMakePjStr(";+sip.instance=\"<\(instanceId)>\"", keep: &strings)

        NSLog("[PpPjsip] REGISTER → sip:%@:%d TLS  aor=sip:%@@%@", server, Int32(port), probeUser, domain)
        try check(pjsua_acc_add(&acc, pj_bool_t(1), &accId), "pjsua_acc_add")
    }

    // MARK: contexte PJSIP

    private func scheduleOnPjsipThread(_ work: @escaping () -> Void) {
        lock.lock()
        scheduledWork = work
        lock.unlock()
        // pjsua_schedule_timer2(cb, user_data, msec_delay) : délai nul, la
        // fonction est exécutée depuis un thread PJSIP enregistré.
        pjsua_schedule_timer2(ppPjsipEnterContext, nil, 0)
    }

    func runScheduledWork() {
        lock.lock()
        let work = scheduledWork
        scheduledWork = nil
        lock.unlock()
        work?()
    }

    // MARK: résultat

    func completeRegistration(code: Int, reason: String) {
        let elapsed = Int(Date().timeIntervalSince(startedAt) * 1000)
        if code == 200 {
            finish(.success([
                "ok": true,
                "code": code,
                "reason": reason.isEmpty ? "OK" : reason,
                "transport": "TLS",
                "elapsedMs": elapsed
            ]))
        } else if code >= 300 || code == 0 {
            finish(.success([
                "ok": false,
                "code": code,
                "reason": reason,
                "transport": "TLS",
                "elapsedMs": elapsed
            ]))
        }
    }

    private func finish(_ result: Result<[String: Any], Error>) {
        lock.lock()
        let cb = completion
        completion = nil
        lock.unlock()
        guard let cb = cb else { return }
        // La sonde ne conserve aucun enregistrement : on retire le compte pour
        // libérer l'AOR de test immédiatement.
        if accId != pjsua_acc_id(-1) {
            pjsua_acc_set_registration(accId, pj_bool_t(0))
            pjsua_acc_del(accId)
            accId = pjsua_acc_id(-1)
        }
        cb(result)
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
/// thread est enregistré auprès de PJLIB pour toute la durée de vie du process.
final class PjsipWorkerThread {
    private let queue = DispatchQueue(label: "ca.planipret.pjsip.probe")
    func run(_ block: @escaping () -> Void) { queue.async(execute: block) }
}

#endif
