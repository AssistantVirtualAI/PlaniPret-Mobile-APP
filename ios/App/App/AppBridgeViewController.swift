import Foundation
import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    private static let sipPlugin = PpSipKeepAlive()
    private static let pjsipPlugin = PpPjsip()
    private static let voipPlugin = PpVoipCall()
    private static let authPlugin = PpAuthSession()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(Self.sipPlugin)
        bridge?.registerPluginInstance(Self.pjsipPlugin)
        bridge?.registerPluginInstance(Self.voipPlugin)
        bridge?.registerPluginInstance(Self.authPlugin)
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
