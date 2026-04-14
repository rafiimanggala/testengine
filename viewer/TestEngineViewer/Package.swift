// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TestEngineViewer",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "TestEngineViewer",
            path: "Sources"
        ),
    ]
)
