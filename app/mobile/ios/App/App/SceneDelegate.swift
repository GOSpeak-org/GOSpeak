import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GospeakBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

final class GospeakBridgeViewController: CAPBridgeViewController {
    // capacitorDidLoad runs at the end of loadView(), after bridge exists but before loadWebView().
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        registerCustomPlugins(on: bridge)
    }
}

// registerPluginType is a no-op when autoRegisterPlugins is on, so app-local plugins must be registered as instances.
fileprivate func registerCustomPlugins(on bridge: CAPBridgeProtocol?) {
    guard let bridge = bridge else { return }
    if bridge.plugin(withName: "AudioSession") == nil {
        bridge.registerPluginInstance(AudioSessionPlugin())
    }
    if bridge.plugin(withName: "MediaControl") == nil {
        bridge.registerPluginInstance(MediaControlPlugin())
    }
}
