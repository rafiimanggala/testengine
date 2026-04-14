import Foundation
import AppKit

@MainActor
class ScreencastStream: ObservableObject {
    @Published var currentFrame: NSImage?
    @Published var isConnected = false
    @Published var showDisconnected = false

    private var webSocketTask: URLSessionWebSocketTask?
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 3
    private let wsUrl: String

    init(wsUrl: String) {
        self.wsUrl = wsUrl
    }

    func connect() {
        guard let url = URL(string: wsUrl) else {
            print("Invalid WebSocket URL: \(wsUrl)")
            return
        }
        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()
        isConnected = true
        showDisconnected = false
        reconnectAttempts = 0
        receiveFrame()
    }

    private func receiveFrame() {
        webSocketTask?.receive { [weak self] result in
            Task { @MainActor in
                guard let self = self else { return }
                switch result {
                case .success(let message):
                    switch message {
                    case .data(let data):
                        if let image = NSImage(data: data) {
                            self.currentFrame = image
                        }
                    case .string:
                        break
                    @unknown default:
                        break
                    }
                    self.receiveFrame()
                case .failure(let error):
                    print("WebSocket error: \(error.localizedDescription)")
                    self.handleDisconnect()
                }
            }
        }
    }

    private func handleDisconnect() {
        isConnected = false
        reconnectAttempts += 1
        if reconnectAttempts <= maxReconnectAttempts {
            print("Reconnecting (\(reconnectAttempts)/\(maxReconnectAttempts))...")
            Task {
                try? await Task.sleep(for: .seconds(1))
                self.connect()
            }
        } else {
            print("Max reconnection attempts reached. Closing.")
            showDisconnected = true
            Task {
                try? await Task.sleep(for: .seconds(3))
                NSApplication.shared.terminate(nil)
            }
        }
    }

    func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
    }
}
