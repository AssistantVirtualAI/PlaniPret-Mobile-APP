import Foundation
import Capacitor
import UIKit

/// Ouvre uniquement un lien de relais AVA Planiprêt déjà validé par le code JS.
/// Cette sortie utilise le navigateur système et ne dépend pas de la feuille
/// SFSafariViewController de Capacitor, qui peut se fermer sans apparaître.
@objc(PpPortalExternal)
public class PpPortalExternal: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PpPortalExternal"
    public let jsName = "PpPortalExternal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private let allowedHosts: Set<String> = [
        "courtierai.planipret.com",
        "avastatistic.ca",
    ]

    private func isAllowedPortalURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              allowedHosts.contains(host) else {
            return false
        }

        let path = url.path
        let brokerRoot = "/planipret/broker"
        let adminRoot = "/planipret/admin"
        let isPortalPath = path == "/planipret/portal-handoff"
            || path == brokerRoot || path.hasPrefix(brokerRoot + "/")
            || path == adminRoot || path.hasPrefix(adminRoot + "/")
        guard isPortalPath,
              !path.contains(".."),
              !path.contains("//"),
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.contains(where: { $0.name == "th" && !($0.value ?? "").isEmpty }),
              items.contains(where: { $0.name == "em" && !($0.value ?? "").isEmpty }) else {
            return false
        }
        return true
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"),
              let url = URL(string: raw),
              isAllowedPortalURL(url) else {
            call.reject("invalid_portal_url")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve(["ok": true])
                } else {
                    call.reject("system_browser_unavailable")
                }
            }
        }
    }
}
