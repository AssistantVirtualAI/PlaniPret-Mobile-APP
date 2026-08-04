import Foundation
import Capacitor
import AVFoundation

#if canImport(pjsua)
import pjsua
#endif

/**
 * PpPjsip — moteur SIP natif (PJSIP) pour Planiprêt Mobile.
 *
 * Deux périmètres dans le MÊME plugin (une seule pile pjsua par process) :
 *  1. `registerTest` — sonde de validation TLS 5061 sur une AOR `<ext>PROBE`.
 *  2. Moteur d'appel complet — `initialize/register/makeCall/answerCall/
 *     hangupCall/setMute/setSpeaker/sendDTMF` sur l'AOR de production `<ext>M`.
 *
 * Contraintes :
 *  - Transports SIP natifs : TCP 5060 (défaut) / TLS 5061 (PJSIP n'a pas de SIP/WebSocket).
 *  - CallKit (PpVoipCall) reste seul maître de l'AVAudioSession : le moteur
 *    n'active jamais la session, il attend `PpCallKitAudioActivated`.
 *  - Les événements d'appel sont diffusés à la fois vers JS (notifyListeners)
 *    et vers CallKit (NotificationCenter), pour que la sonnerie système ne
 *    dépende plus de JsSIP.
 */
@objc(PpPjsip)
public class PpPjsip: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PpPjsip"
    public let jsName = "PpPjsip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isEngineLinked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),

        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "makeCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "answerCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hangupCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendDTMF", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addListener", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        #if canImport(pjsua)
        NSLog("[PpPjsip] READY — native media engine linked, TLS 5061 path enabled")
        PjsipEngine.shared.eventSink = { [weak self] name, payload in
            self?.notifyListeners(name, data: payload, retainUntilConsumed: true)
        }
        #else
        NSLog("[PpPjsip] FATAL — plugin loaded but module pjsua is not importable; incoming calls cannot be answered natively")
        #endif
    }

    // MARK: - Lien du moteur

    /// Retourne le résultat exact de `#if canImport(pjsua)` : le JS ne doit
    /// pré-revendiquer l'AOR `<ext>M` que si ce booléen est vrai.
    @objc func isEngineLinked(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        call.resolve(["linked": true])
        #else
        NSLog("[PpPjsip] isEngineLinked=false — libpjsip.xcframework is not linked into the app")
        call.resolve(["linked": false])
        #endif
    }

    // MARK: - Sonde TLS



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
        PjsipEngine.shared.registerTest(
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
        rejectMissingBinary(call)
        #endif
    }

    // MARK: - Moteur de production

    @objc func initialize(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        let username = call.getString("username") ?? ""
        let password = call.getString("password") ?? ""
        let domain = call.getString("domain") ?? ""
        let proxy = call.getString("proxy") ?? ""
        let transport = (call.getString("transport") ?? "TCP").uppercased()
        let port = call.getInt("port") ?? (transport == "TLS" ? 5061 : 5060)
        let displayName = call.getString("displayName") ?? "Planiprêt"

        guard !username.isEmpty, !password.isEmpty, !domain.isEmpty else {
            call.reject("missing_credentials", "username/password/domain are required")
            return
        }
        guard transport == "TLS" || transport == "TCP" || transport == "UDP" else {
            call.reject("unsupported_transport", "PJSIP natif : TCP 5060 / TLS 5061 / UDP (pas de SIP/WebSocket).")
            return
        }

        PjsipEngine.shared.configure(
            username: username,
            password: password,
            domain: domain,
            server: proxy.isEmpty ? domain : proxy,
            port: port,
            displayName: displayName,
            transport: transport
        ) { result in
            switch result {
            case .success:
                call.resolve(["ok": true, "username": username])
            case .failure(let err):
                call.reject("pjsip_error", (err as NSError).localizedDescription)
            }
        }
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func register(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.setRegistration(true)
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func unregister(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.setRegistration(false)
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func makeCall(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        let destination = call.getString("destination") ?? ""
        guard !destination.isEmpty else {
            call.reject("missing_destination", "destination is required")
            return
        }
        PjsipEngine.shared.makeCall(destination: destination) { result in
            switch result {
            case .success(let id): call.resolve(["callId": id])
            case .failure(let err): call.reject("pjsip_error", (err as NSError).localizedDescription)
            }
        }
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func answerCall(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.answer(callId: call.getString("callId")) { ok in
            if ok { call.resolve(["callId": PjsipEngine.shared.currentCallIdString]) }
            else { call.reject("no_active_call", "Aucun appel entrant à décrocher") }
        }
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func hangupCall(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.hangup(callId: call.getString("callId"))
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func setMute(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.setMute(call.getBool("muted") ?? false)
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func setSpeaker(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.setSpeaker(call.getBool("enabled") ?? false)
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func sendDTMF(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        PjsipEngine.shared.sendDTMF(call.getString("digits") ?? "")
        call.resolve(["ok": true])
        #else
        rejectMissingBinary(call)
        #endif
    }

    @objc func getState(_ call: CAPPluginCall) {
        #if canImport(pjsua)
        call.resolve(PjsipEngine.shared.stateSnapshot())
        #else
        call.resolve([
            "available": false,
            "registered": false,
            "username": "",
            "callId": ""
        ])
        #endif
    }

    private func rejectMissingBinary(_ call: CAPPluginCall) {
        NSLog("[PpPjsip] binary_missing — libpjsip.xcframework is not linked into the app")
        call.reject(
            "binary_missing",
            "libpjsip.xcframework is not linked. Run scripts/build-pjsip-ios.sh on macOS, then `npx cap sync ios`."
        )
    }
}
