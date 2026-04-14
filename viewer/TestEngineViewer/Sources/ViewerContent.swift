import SwiftUI
import AppKit

struct ViewerContent: View {
    @ObservedObject var stream: ScreencastStream
    let sessionId: String

    var body: some View {
        ZStack {
            Color.black
            if let frame = stream.currentFrame {
                Image(nsImage: frame)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Text("Waiting for frames...")
                    .foregroundColor(.gray)
            }
            if stream.showDisconnected {
                Text("Disconnected")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.red.opacity(0.85))
                    .cornerRadius(8)
            }
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    let sessionId: String
    let wsUrl: String
    var window: NSWindow?
    var stream: ScreencastStream?

    init(sessionId: String, wsUrl: String) {
        self.sessionId = sessionId
        self.wsUrl = wsUrl
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let stream = ScreencastStream(wsUrl: wsUrl)
        self.stream = stream

        let contentView = ViewerContent(stream: stream, sessionId: sessionId)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "TestEngine — \(sessionId)"
        window.minSize = NSSize(width: 640, height: 360)
        window.contentView = NSHostingView(rootView: contentView)
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        stream.connect()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stream?.disconnect()
    }
}
