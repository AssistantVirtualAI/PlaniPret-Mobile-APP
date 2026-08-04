import Foundation
import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PpSipKeepAlive())
        bridge?.registerPluginInstance(PpPjsip())
        bridge?.registerPluginInstance(PpVoipCall())
        bridge?.registerPluginInstance(PpAuthSession())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
