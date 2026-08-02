import Foundation
import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PpSipKeepAlive())
        bridge?.registerPluginInstance(PpVoipCall())
        bridge?.registerPluginInstance(PpAuthSession())
        bridge?.registerPluginInstance(PpPjsip())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
