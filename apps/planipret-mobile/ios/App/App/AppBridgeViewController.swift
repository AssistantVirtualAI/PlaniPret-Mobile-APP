import Foundation
import UIKit
import Capacitor
import AVFoundation
import CryptoKit
import UserNotifications
import PushKit
import CallKit

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PpSipKeepAlive())
        bridge?.registerPluginInstance(PpVoipCall())
        bridge?.registerPluginInstance(PpAuthSession())
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
