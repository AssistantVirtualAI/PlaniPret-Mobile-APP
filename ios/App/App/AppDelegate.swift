import UIKit
import Capacitor
import AVFoundation
import BackgroundTasks

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Configure AVAudioSession for VoIP calls:
        // - PlayAndRecord + voiceChat mode: enables mic + earpiece simultaneously
        // - defaultToSpeaker is NOT set — audio routes to earpiece by default
        // - The user must explicitly tap the speaker button to switch to loudspeaker
        // - allowBluetooth: enables Bluetooth headsets and AirPods
        configureAudioSession()

        // UIScene lifecycle observers (iOS 13+) — required for SIP foreground/background
        // transitions when the app uses UIScene (SceneDelegate). UIApplication notifications
        // alone are not reliably fired when UIScene is active.
        if #available(iOS 13.0, *) {
            NotificationCenter.default.addObserver(self, selector: #selector(onSceneForeground), name: UIScene.didActivateNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(onSceneForeground), name: UIScene.willEnterForegroundNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(onSceneBackground), name: UIScene.didEnterBackgroundNotification, object: nil)
            NotificationCenter.default.addObserver(self, selector: #selector(onSceneBackground), name: UIScene.willDeactivateNotification, object: nil)
        }

        // Register BGProcessingTask for periodic SIP re-registration (parity with Android PpSipKeepAliveService)
        // This ensures the SIP REGISTER is refreshed even when the app is in background/suspended.
        if #available(iOS 13.0, *) {
            BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.planipret.mobile.sip-refresh", using: nil) { task in
                self.handleSipRefreshTask(task as! BGProcessingTask)
            }
            scheduleSipRefreshTask()
        }

        return true
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [
                    .allowBluetooth,
                    .allowBluetoothA2DP,
                    .mixWithOthers
                    // Do NOT include .defaultToSpeaker
                ]
            )
            try session.setActive(true)
        } catch {
            print("[Planipret] AVAudioSession configuration failed: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Give the WebSocket SIP keep-alive up to ~25 seconds to finish any pending
        // re-REGISTER before iOS suspends the process. Parity with Android WakeLock.
        var bgTask: UIBackgroundTaskIdentifier = .invalid
        bgTask = application.beginBackgroundTask(withName: "PlanipretSIPKeepAlive") {
            NSLog("[SIP] Background task expired — WebSocket will be suspended")
            if bgTask != .invalid {
                application.endBackgroundTask(bgTask)
                bgTask = .invalid
            }
        }
        DispatchQueue.global(qos: .background).asyncAfter(deadline: .now() + 20) {
            NSLog("[SIP] Background keep-alive: triggering re-REGISTER via JS")
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                if bgTask != .invalid {
                    application.endBackgroundTask(bgTask)
                    bgTask = .invalid
                }
            }
        }
        // Schedule the next BGProcessingTask for SIP refresh in 15 minutes
        if #available(iOS 13.0, *) {
            scheduleSipRefreshTask()
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Re-activate audio session when returning from background
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    // MARK: - UIScene lifecycle (iOS 13+)

    @available(iOS 13.0, *)
    @objc private func onSceneForeground() {
        try? AVAudioSession.sharedInstance().setActive(true)
        NotificationCenter.default.post(name: NSNotification.Name("PpSipSceneForeground"), object: nil)
    }

    @available(iOS 13.0, *)
    @objc private func onSceneBackground() {
        NotificationCenter.default.post(name: NSNotification.Name("PpSipSceneBackground"), object: nil)
    }

    // MARK: - Background tasks (SIP registration refresh — iOS 13+)

    @available(iOS 13.0, *)
    private func scheduleSipRefreshTask() {
        let request = BGProcessingTaskRequest(identifier: "com.planipret.mobile.sip-refresh")
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        // Schedule next refresh in 15 minutes (iOS may delay to a convenient time)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
            NSLog("[BGTask] Scheduled sip-refresh in 15 min")
        } catch {
            NSLog("[BGTask] Failed to schedule sip-refresh: \(error)")
        }
    }

    @available(iOS 13.0, *)
    private func handleSipRefreshTask(_ task: BGProcessingTask) {
        // Reschedule immediately so we always have a pending task
        scheduleSipRefreshTask()

        task.expirationHandler = {
            NSLog("[BGTask] sip-refresh expired")
            task.setTaskCompleted(success: false)
        }

        NSLog("[BGTask] sip-refresh running — triggering SIP re-REGISTER")
        // PpSipKeepAlive plugin listens to this notification and sends a new REGISTER
        NotificationCenter.default.post(
            name: NSNotification.Name("PpSipBgRefresh"),
            object: nil
        )

        DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
            task.setTaskCompleted(success: true)
        }
    }

    // Apple requires every orientation for iPad multitasking. Keep the iPhone
    // experience portrait-only while allowing the required iPad orientations.
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
