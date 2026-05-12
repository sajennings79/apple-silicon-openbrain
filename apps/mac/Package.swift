// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OpenBrainApp",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "OpenBrainApp", targets: ["OpenBrainApp"]),
    ],
    targets: [
        .executableTarget(
            name: "OpenBrainApp",
            path: "Sources/OpenBrainApp"
        ),
    ]
)
