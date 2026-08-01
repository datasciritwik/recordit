fn main() {
    println!("cargo:rustc-link-arg=-mmacosx-version-min=14.0");
    let swift_linker = swift_rs::SwiftLinker::new("14.0")
        .with_package("RecordItNative", "./swift-lib/");
    swift_linker.link();
    tauri_build::build();
}
