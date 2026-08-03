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
 *  - Toutes les API PJSUA sont appelées sur le thread worker qui a appelé
 *    pjsua_create() : pj_init() enregistre ce thread auprès de PJLIB, donc il
 *    est légal. Aucun franchissement de frontière par GCD (qui provoque des
 *    crashs aléatoires), et aucun besoin de pjsua_schedule_timer2 — laquelle
 *    n'est de toute façon pas appelable depuis Swift (voir ligne ~178).
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
        // useRealAor=true : REGISTER sur l'AOR de PRODUCTION (<ext>M), seule
        // façon de valider l'authentification digest NetSapiens. L'appelant DOIT
        // avoir arrêté JsSIP avant, et l'enregistrement est retiré aussitôt après.
        let useRealAor = call.getBool("useRealAor") ?? false
        let realmValue = call.getString("realm") ?? "*"

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
            port: port,
            useRealAor: useRealAor,
            realmValue: realmValue
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

// PJSIP_EUNSUPTRANSPORT = 220003 (« Unsupported transport »).
//
// Non importable depuis Swift. Les codes d'erreur PJSIP ne sont pas une enum mais des
// #define composes, definis dans pjsip/include/pjsip/sip_errno.h :
//
//     #define PJSIP_ERRNO_START            (PJ_ERRNO_START_USER)
//     #define PJSIP_ERRNO_FROM_SIP_STATUS(code)  (PJSIP_ERRNO_START+code)
//
// Swift n'importe un #define que si sa valeur est un litteral directement evaluable ;
// une composition de macros ne l'est pas. Et meme importe, ce serait un Int32 nu,
// donc sans `.rawValue`. La valeur numerique est stable et documentee (220003) : elle
// apparait telle quelle dans la sortie de pjsua et dans nos scripts de diagnostic.
private let PP_PJSIP_EUNSUPTRANSPORT: pj_status_t = 220003

private func ppPjsipOnRegState2(_ accId: pjsua_acc_id, _ info: UnsafeMutablePointer<pjsua_reg_info>?) {
    guard let info = info, let rdata = info.pointee.cbparam else { return }
    // rdata.pointee.code est le champ `code` de pjsip_status_line : un `int` C, donc
    // Int32 nu cote Swift. Seules les typedef enum C sont importees comme
    // RawRepresentable et ont `.rawValue` ; un Int32 n'en a pas.
    let code = Int(rdata.pointee.code)
    let reason = ppPjStr(rdata.pointee.reason)
    NSLog("[PpPjsip] REGISTER response acc=%d code=%d reason=%@", accId, code, reason)
    PjsipProbeEngine.shared.completeRegistration(code: code, reason: reason)
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
    private var strings: [UnsafeMutablePointer<CChar>] = []
    private var startedAt = Date()

    private init() {}

    func registerTest(
        username: String,
        password: String,
        domain: String,
        server: String,
        port: Int,
        useRealAor: Bool,
        realmValue: String,
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
                // Appel direct : PAS d'indirection par pjsua_schedule_timer2.
                //
                // ensureStackStarted() vient d'appeler pjsua_create() SUR CE THREAD, et
                // pjsua_create() appelle pj_init() qui enregistre le thread appelant aupres
                // de PJLIB. Ce thread est donc deja un thread PJLIB legal : toute API PJSUA
                // peut y etre appelee. Replanifier via un timer serait redondant.
                //
                // La contrainte PJSIP (« ne jamais franchir la frontiere via GCD ») est
                // respectee par construction, puisque nous ne franchissons aucune frontiere :
                // pjsua_create() et pjsua_acc_add() s'executent sur le meme thread.
                //
                // Note technique : pjsua_schedule_timer2 n'est de toute facon pas appelable
                // depuis Swift. Quand PJ_TIMER_DEBUG est actif (le cas en configuration Debug),
                // pjsua.h la redefinit en macro a arguments vers pjsua_schedule_timer2_dbg ;
                // or Swift n'importe pas les macros C a arguments.
                try self.addProbeAccount(
                    username: username,
                    password: password,
                    domain: domain,
                    server: server,
                    port: port,
                    useRealAor: useRealAor,
                    realmValue: realmValue
                )
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
        let tlsStatus = pjsua_transport_create(PJSIP_TRANSPORT_TLS, &tcfg, &transportId)
        if tlsStatus != pj_status_t(0) {
            // Sans ce diagnostic, un binaire construit sans OpenSSL échoue ici avec
            // un code numérique dont la cause est invisible depuis le Swift.
            logTlsFailureDiagnostics(status: tlsStatus)
        }
        try check(tlsStatus, "pjsua_transport_create(TLS)")

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
        port: Int,
        useRealAor: Bool,
        realmValue: String
    ) throws {
        // Deux modes :
        //
        //  - useRealAor=false (defaut) : AOR de test <ext>MPROBE. Ne peut PAS
        //    aboutir a un 200 OK car cet abonne n'existe pas dans NetSapiens :
        //    le serveur repond 403 Forbidden. Utile uniquement pour prouver que
        //    le transport TLS fonctionne, sans jamais toucher la production.
        //
        //  - useRealAor=true : AOR de PRODUCTION <ext>M, la seule que NetSapiens
        //    connaisse. Seul mode capable de valider l'authentification digest.
        //    L'appelant DOIT avoir arrete JsSIP avant (sinon deux agents se
        //    disputent l'AOR), et finish() retire l'enregistrement aussitot.
        let probeUser = useRealAor ? username : "\(username)PROBE"
        let instanceId = "urn:uuid:\(UUID().uuidString.lowercased())"

        var acc = pjsua_acc_config()
        pjsua_acc_config_default(&acc)

        acc.id = ppMakePjStr("sip:\(probeUser)@\(domain)", keep: &strings)
        acc.reg_uri = ppMakePjStr("sip:\(server):\(port);transport=tls", keep: &strings)
        acc.cred_count = 1
        // realm : "*" (joker PJSIP) par defaut. Si NetSapiens boucle en 401,
        // passer le realm exact renvoye dans son WWW-Authenticate.
        acc.cred_info.0.realm = ppMakePjStr(realmValue.isEmpty ? "*" : realmValue, keep: &strings)
        acc.cred_info.0.scheme = ppMakePjStr("digest", keep: &strings)
        acc.cred_info.0.username = ppMakePjStr(username, keep: &strings)
        acc.cred_info.0.data_type = 0 // PJSIP_CRED_DATA_PLAIN_PASSWD
        acc.cred_info.0.data = ppMakePjStr(password, keep: &strings)
        acc.proxy_cnt = 1
        acc.proxy.0 = ppMakePjStr("sip:\(server):\(port);transport=tls;lr", keep: &strings)
        acc.reg_timeout = 300
        acc.register_on_acc_add = pj_bool_t(1)
        acc.contact_params = ppMakePjStr(";+sip.instance=\"<\(instanceId)>\"", keep: &strings)

        NSLog(
            "[PpPjsip] REGISTER → sip:%@:%d TLS  aor=sip:%@@%@  authUser=%@  realm=%@  mode=%@",
            server, Int32(port), probeUser, domain, username,
            realmValue.isEmpty ? "*" : realmValue,
            useRealAor ? "REAL_AOR" : "PROBE_AOR"
        )
        try check(pjsua_acc_add(&acc, pj_bool_t(1), &accId), "pjsua_acc_add")
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

    /// Diagnostic d'échec du transport TLS.
    ///
    /// Le point décisif est `pj_ssl_cipher_get_availables` : si le binaire a été
    /// construit sans OpenSSL, aucun cipher n'est disponible. Cela distingue de
    /// façon fiable un défaut de BUILD (TLS absent du binaire) d'un défaut de
    /// RÉSEAU ou de certificat — deux causes qui produisent sinon le même silence.
    private func logTlsFailureDiagnostics(status: pj_status_t) {
        var buf = [CChar](repeating: 0, count: 256)
        pj_strerror(status, &buf, 256)
        let msg = String(cString: buf)

        var ciphers = [pj_ssl_cipher](repeating: pj_ssl_cipher(0), count: 256)
        var count = UInt32(ciphers.count)
        let cipherStatus = pj_ssl_cipher_get_availables(&ciphers, &count)
        let sslBackendPresent = cipherStatus == pj_status_t(0) && count > 0

        NSLog("[PpPjsip] pjsua_transport_create(TLS) failed status=%d (%@)", status, msg)
        NSLog("[PpPjsip] --- etat de configuration PJSIP ---")
        NSLog("[PpPjsip]   pjsua version       : %@", String(cString: pj_get_version()))
        NSLog("[PpPjsip]   backend SSL present : %@ (ciphers=%u, status=%d)",
              sslBackendPresent ? "OUI" : "NON", count, cipherStatus)
        NSLog("[PpPjsip]   transport demande   : PJSIP_TRANSPORT_TLS (5061)")
        NSLog("[PpPjsip]   TLS est le SEUL transport natif possible : PJSIP n'a pas de transport SIP/WebSocket.")

        if status == PP_PJSIP_EUNSUPTRANSPORT || !sslBackendPresent {
            NSLog("[PpPjsip] CAUSE : libpjsip.xcframework a ete construit SANS OpenSSL (PJ_HAS_SSL_SOCK=0).")
            NSLog("[PpPjsip]   CORRECTIF : bash scripts/build-pjsip-ios.sh")
            NSLog("[PpPjsip]   puis      : bash scripts/verify-pjsip-tls.sh")
            NSLog("[PpPjsip]   puis      : npx cap sync ios")
        } else {
            NSLog("[PpPjsip] CAUSE probable : reseau ou certificat local. Le backend SSL est present.")
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
/// thread est enregistré auprès de PJLIB pour toute la durée de vie du process.
final class PjsipWorkerThread {
    private let queue = DispatchQueue(label: "ca.planipret.pjsip.probe")
    func run(_ block: @escaping () -> Void) { queue.async(execute: block) }
}

#endif
