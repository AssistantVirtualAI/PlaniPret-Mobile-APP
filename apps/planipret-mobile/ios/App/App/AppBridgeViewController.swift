import Foundation
import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // PpSipKeepAlive / PpVoipCall / PpAuthSession are CAPBridgedPlugin
        // classes with their own Plugins/*/*.m bridge — Capacitor auto-
        // discovers and instantiates them via the ObjC runtime. Calling
        // registerPluginInstance() here as well created a SECOND, separate
        // instance of each plugin with its own state (host/login/password,
        // NotificationCenter observers, PushKit/CallKit delegates). JS calls
        // like startSipService()/stopSipService() only reach ONE of the two
        // instances while UIApplication background/foreground notifications
        // fired on BOTH — the orphan instance ran with an empty `host`
        // ("missing_host") and kept its own SIP transport alive after
        // stopSipService() only tore down the other instance, so NetSapiens
        // saw two REGISTERs for the same AoR and closed the socket (WSS 1001).
        // Do not manually register these plugins; auto-discovery is sufficient.
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
