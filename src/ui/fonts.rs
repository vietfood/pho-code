//! Packaged workbench fonts.
//!
//! Fonts are reviewed local assets only. Registration never downloads or resolves remote URLs.
//! Missing or unloadable faces fall back to the platform-qualified monospace stack.

use std::borrow::Cow;

use gpui::App;

/// Family name embedded in the JetBrains Mono TTF files.
/// Used as the workbench UI and code font.
pub const WORKBENCH_FONT_FAMILY: &str = "JetBrains Mono";

/// Back-compat alias for call sites that still refer to the code font role.
pub const CODE_FONT_FAMILY: &str = WORKBENCH_FONT_FAMILY;

const JETBRAINS_MONO_FACES: &[&[u8]] = &[
    include_bytes!(
        "../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-Regular.ttf"
    ),
    include_bytes!("../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-Medium.ttf"),
    include_bytes!(
        "../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-SemiBold.ttf"
    ),
    include_bytes!("../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-Bold.ttf"),
    include_bytes!("../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-Italic.ttf"),
    include_bytes!(
        "../../assets/fonts/JetBrainsMono-2.304/fonts/ttf/JetBrainsMono-BoldItalic.ttf"
    ),
];

/// Registers the packaged JetBrains Mono faces with the GPUI text system.
///
/// Failure is non-fatal: the code viewer still renders with the system monospace fallback.
pub fn register_packaged_fonts(cx: &App) {
    let fonts = JETBRAINS_MONO_FACES
        .iter()
        .map(|bytes| Cow::Borrowed(*bytes))
        .collect();
    if let Err(error) = cx.text_system().add_fonts(fonts) {
        eprintln!("pho-native: packaged code font unavailable ({error}); using system monospace");
    }
}
