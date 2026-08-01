// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RecordItNative",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "RecordItNative",
            type: .static,
            targets: ["RecordItNative"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/Brendonovich/swift-rs", from: "1.0.7")
    ],
    targets: [
        .target(
            name: "RecordItNative",
            dependencies: [
                .product(name: "SwiftRs", package: "swift-rs")
            ]
        ),
    ]
)
