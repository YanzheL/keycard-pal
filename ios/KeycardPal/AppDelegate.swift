import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/// theme.ts `background`. LaunchScreen.storyboard and the Android splash paint
/// the same colour, so every hand-over on the way to the first JS frame is
/// invisible.
private let appBackground = UIColor(
  red: 0x12 / 255.0,
  green: 0x12 / 255.0,
  blue: 0x12 / 255.0,
  alpha: 1
)

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    return true
  }
}

/// iOS 27 refuses to launch an app built with its SDK that has no scene
/// lifecycle, so the window lives here rather than on AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let factory = (UIApplication.shared.delegate as? AppDelegate)?.reactNativeFactory
    else { return }

    window = UIWindow(windowScene: windowScene)

    factory.startReactNative(
      withModuleName: "KeycardPal",
      in: window,
      launchOptions: nil
    )

    // React Native paints its root view `systemBackground`, which is white on a
    // phone set to light appearance. The app is dark only, so that white would
    // show from the moment the launch screen goes away until JavaScript mounts
    // its first component: the very gap the launch screen exists to cover. The
    // window is not on screen until this method returns, so repainting it here
    // is still ahead of the first frame.
    window?.rootViewController?.view.backgroundColor = appBackground
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
