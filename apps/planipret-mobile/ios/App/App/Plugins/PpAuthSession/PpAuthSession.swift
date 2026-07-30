import Foundation
import Capacitor
import UIKit
import AuthenticationServices

@objc(PpAuthSession)
public class PpAuthSession: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "PpAuthSession"
    public let jsName = "PpAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("missing url"); return
        }
        let scheme = call.getString("scheme") ?? "capacitor"
        DispatchQueue.main.async {
            let authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackUrl, error in
                self.session = nil
                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.resolve(["cancelled": true])
                        return
                    }
                    NSLog("[PpAuthSession] failed: %@", error.localizedDescription)
                    call.reject(error.localizedDescription)
                    return
                }
                guard let callbackUrl = callbackUrl else { call.resolve(["cancelled": true]); return }
                NSLog("[PpAuthSession] callback received")
                call.resolve(["url": callbackUrl.absoluteString])
            }
            authSession.presentationContextProvider = self
            authSession.prefersEphemeralWebBrowserSession = false
            self.session = authSession
            if !authSession.start() {
                self.session = nil
                call.reject("cannot start auth session")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
