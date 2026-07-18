//! Direct-GPUI fallback theme, asset, and scale policy.
//!
//! This module contains no renderer or filesystem access. It gives the native adapter a bounded,
//! local policy that can be projected into GPUI primitives without downloading or resolving assets
//! during render.

pub const THEME_POLICY_VERSION: u16 = 1;
pub const ANSI_COLOR_COUNT: usize = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Rgb {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

impl Rgb {
    pub const fn new(red: u8, green: u8, blue: u8) -> Self {
        Self { red, green, blue }
    }

    pub fn relative_luminance(self) -> f64 {
        fn channel(value: u8) -> f64 {
            let value = f64::from(value) / 255.0;
            if value <= 0.039_28 {
                value / 12.92
            } else {
                ((value + 0.055) / 1.055).powf(2.4)
            }
        }

        0.2126 * channel(self.red) + 0.7152 * channel(self.green) + 0.0722 * channel(self.blue)
    }

    pub fn contrast_ratio(self, other: Self) -> f64 {
        let first = self.relative_luminance();
        let second = other.relative_luminance();
        let (lighter, darker) = if first >= second {
            (first, second)
        } else {
            (second, first)
        };
        (lighter + 0.05) / (darker + 0.05)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ThemeProfile {
    System,
    Light,
    Dark,
    HighContrast,
}

/// The native adapter supplies this small, already-qualified appearance value.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SystemAppearance {
    Light,
    Dark,
    HighContrast,
}

impl ThemeProfile {
    pub fn resolve(self, appearance: SystemAppearance) -> ResolvedTheme {
        let profile = match self {
            Self::System => match appearance {
                SystemAppearance::Light => Self::Light,
                SystemAppearance::Dark => Self::Dark,
                SystemAppearance::HighContrast => Self::HighContrast,
            },
            explicit => explicit,
        };
        ResolvedTheme {
            profile,
            colors: SemanticColors::for_profile(profile),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ResolvedTheme {
    pub profile: ThemeProfile,
    pub colors: SemanticColors,
}

/// Semantic colors required by the native lifecycle and workbench contracts.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SemanticColors {
    pub background: Rgb,
    pub surface: Rgb,
    pub raised: Rgb,
    pub hover: Rgb,
    pub selected: Rgb,
    pub separator: Rgb,
    pub primary_text: Rgb,
    pub muted_text: Rgb,
    pub border: Rgb,
    pub selection: Rgb,
    pub focus: Rgb,
    pub insertion: Rgb,
    pub deletion: Rgb,
    pub success: Rgb,
    pub warning: Rgb,
    pub error: Rgb,
    pub link: Rgb,
    pub inline_code: Rgb,
    pub fenced_code: Rgb,
    pub terminal_ansi: [Rgb; ANSI_COLOR_COUNT],
}

impl SemanticColors {
    pub fn for_profile(profile: ThemeProfile) -> Self {
        match profile {
            ThemeProfile::Light | ThemeProfile::System => Self::light(),
            ThemeProfile::Dark => Self::dark(),
            ThemeProfile::HighContrast => Self::high_contrast(),
        }
    }

    pub fn ansi(self, index: usize) -> Option<Rgb> {
        self.terminal_ansi.get(index).copied()
    }

    fn light() -> Self {
        Self {
            background: Rgb::new(250, 250, 250),
            surface: Rgb::new(255, 255, 255),
            raised: Rgb::new(240, 240, 240),
            hover: Rgb::new(232, 239, 248),
            selected: Rgb::new(211, 229, 255),
            separator: Rgb::new(205, 210, 218),
            primary_text: Rgb::new(17, 17, 17),
            muted_text: Rgb::new(74, 74, 74),
            border: Rgb::new(90, 90, 90),
            selection: Rgb::new(187, 215, 255),
            focus: Rgb::new(0, 95, 204),
            insertion: Rgb::new(11, 122, 62),
            deletion: Rgb::new(179, 38, 30),
            success: Rgb::new(23, 122, 68),
            warning: Rgb::new(138, 75, 0),
            error: Rgb::new(176, 0, 32),
            link: Rgb::new(0, 74, 159),
            inline_code: Rgb::new(235, 235, 235),
            fenced_code: Rgb::new(224, 224, 224),
            terminal_ansi: [
                Rgb::new(0, 0, 0),
                Rgb::new(170, 0, 0),
                Rgb::new(0, 120, 0),
                Rgb::new(150, 90, 0),
                Rgb::new(0, 70, 170),
                Rgb::new(125, 0, 125),
                Rgb::new(0, 115, 115),
                Rgb::new(128, 128, 128),
                Rgb::new(80, 80, 80),
                Rgb::new(200, 0, 0),
                Rgb::new(0, 150, 0),
                Rgb::new(180, 120, 0),
                Rgb::new(0, 100, 210),
                Rgb::new(170, 0, 170),
                Rgb::new(0, 145, 145),
                Rgb::new(32, 32, 32),
            ],
        }
    }

    fn dark() -> Self {
        Self {
            // ADR 0006's initial dark semantic roles. These remain roles rather than
            // view-local colors so light and high-contrast profiles can diverge safely.
            background: Rgb::new(11, 13, 16),
            surface: Rgb::new(17, 19, 24),
            raised: Rgb::new(23, 26, 32),
            hover: Rgb::new(31, 35, 43),
            selected: Rgb::new(34, 56, 82),
            separator: Rgb::new(39, 43, 51),
            primary_text: Rgb::new(242, 244, 247),
            muted_text: Rgb::new(150, 157, 168),
            border: Rgb::new(72, 78, 90),
            selection: Rgb::new(36, 75, 122),
            focus: Rgb::new(121, 184, 255),
            insertion: Rgb::new(97, 208, 149),
            deletion: Rgb::new(255, 138, 128),
            success: Rgb::new(114, 214, 157),
            warning: Rgb::new(229, 185, 107),
            error: Rgb::new(240, 124, 124),
            link: Rgb::new(102, 170, 255),
            inline_code: Rgb::new(51, 57, 67),
            fenced_code: Rgb::new(32, 37, 43),
            terminal_ansi: [
                Rgb::new(0, 0, 0),
                Rgb::new(255, 107, 107),
                Rgb::new(105, 219, 124),
                Rgb::new(255, 212, 59),
                Rgb::new(116, 192, 252),
                Rgb::new(218, 119, 242),
                Rgb::new(102, 217, 232),
                Rgb::new(173, 181, 189),
                Rgb::new(73, 80, 87),
                Rgb::new(255, 135, 135),
                Rgb::new(140, 233, 154),
                Rgb::new(255, 224, 102),
                Rgb::new(145, 213, 255),
                Rgb::new(229, 153, 247),
                Rgb::new(145, 231, 255),
                Rgb::new(248, 249, 250),
            ],
        }
    }

    fn high_contrast() -> Self {
        Self {
            background: Rgb::new(0, 0, 0),
            surface: Rgb::new(0, 0, 0),
            raised: Rgb::new(26, 26, 26),
            hover: Rgb::new(48, 48, 48),
            selected: Rgb::new(72, 72, 0),
            separator: Rgb::new(255, 255, 255),
            primary_text: Rgb::new(255, 255, 255),
            muted_text: Rgb::new(240, 240, 240),
            border: Rgb::new(255, 255, 255),
            selection: Rgb::new(255, 255, 0),
            focus: Rgb::new(0, 255, 255),
            insertion: Rgb::new(0, 255, 102),
            deletion: Rgb::new(255, 102, 102),
            success: Rgb::new(0, 255, 102),
            warning: Rgb::new(255, 255, 0),
            error: Rgb::new(255, 102, 102),
            link: Rgb::new(102, 204, 255),
            inline_code: Rgb::new(24, 24, 24),
            fenced_code: Rgb::new(16, 16, 16),
            terminal_ansi: [
                Rgb::new(0, 0, 0),
                Rgb::new(255, 102, 102),
                Rgb::new(0, 255, 102),
                Rgb::new(255, 255, 0),
                Rgb::new(102, 204, 255),
                Rgb::new(255, 102, 255),
                Rgb::new(0, 255, 255),
                Rgb::new(255, 255, 255),
                Rgb::new(128, 128, 128),
                Rgb::new(255, 153, 153),
                Rgb::new(102, 255, 153),
                Rgb::new(255, 255, 153),
                Rgb::new(153, 221, 255),
                Rgb::new(255, 153, 255),
                Rgb::new(153, 255, 255),
                Rgb::new(255, 255, 255),
            ],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NetworkAssetPolicy {
    Disabled,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FontFallbackPolicy {
    SystemQualified,
    /// Packaged JetBrains Mono faces registered at native startup.
    PackagedJetBrainsMono,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MissingAssetFallback {
    TextGlyphControl,
    SystemQualifiedFont,
    LiteralTex,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MathAssetFallback {
    LiteralTex,
}

/// Versioned policy for assets that are local-only and safe to use from render projections.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalAssetPolicyV1 {
    pub schema_version: u16,
    pub network_assets: NetworkAssetPolicy,
    pub ui_font: FontFallbackPolicy,
    pub monospace_font: FontFallbackPolicy,
    pub text_glyph_controls: bool,
    pub missing_icon: MissingAssetFallback,
    pub missing_font: MissingAssetFallback,
    pub math_fallback: MathAssetFallback,
}

impl Default for LocalAssetPolicyV1 {
    fn default() -> Self {
        Self {
            schema_version: THEME_POLICY_VERSION,
            network_assets: NetworkAssetPolicy::Disabled,
            ui_font: FontFallbackPolicy::PackagedJetBrainsMono,
            monospace_font: FontFallbackPolicy::PackagedJetBrainsMono,
            text_glyph_controls: true,
            missing_icon: MissingAssetFallback::TextGlyphControl,
            missing_font: MissingAssetFallback::SystemQualifiedFont,
            math_fallback: MathAssetFallback::LiteralTex,
        }
    }
}

impl LocalAssetPolicyV1 {
    pub fn math_fallback(&self) -> MissingAssetFallback {
        match self.math_fallback {
            MathAssetFallback::LiteralTex => MissingAssetFallback::LiteralTex,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScaleFactor {
    One,
    Two,
}

impl ScaleFactor {
    pub const fn value(self) -> f32 {
        match self {
            Self::One => 1.0,
            Self::Two => 2.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScaleMetricsV1 {
    pub scale: ScaleFactor,
    pub device_pixel: f32,
    pub minimum_hit_target: f32,
    pub focus_ring_width: f32,
    pub border_width: f32,
}

impl ScaleMetricsV1 {
    pub fn for_scale(scale: ScaleFactor) -> Self {
        let device_pixel = 1.0 / scale.value();
        Self {
            scale,
            device_pixel,
            minimum_hit_target: 44.0,
            focus_ring_width: 2.0 * device_pixel,
            border_width: device_pixel,
        }
    }

    pub fn validate(self) -> bool {
        self.device_pixel.is_finite()
            && self.minimum_hit_target.is_finite()
            && self.focus_ring_width.is_finite()
            && self.border_width.is_finite()
            && (0.5..=1.0).contains(&self.device_pixel)
            && (44.0..=88.0).contains(&self.minimum_hit_target)
            && (self.device_pixel..=4.0).contains(&self.focus_ring_width)
            && (self.device_pixel..=2.0).contains(&self.border_width)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn semantic_colors(colors: SemanticColors) -> [Rgb; 15] {
        [
            colors.background,
            colors.surface,
            colors.raised,
            colors.primary_text,
            colors.muted_text,
            colors.border,
            colors.selection,
            colors.focus,
            colors.insertion,
            colors.deletion,
            colors.warning,
            colors.error,
            colors.link,
            colors.inline_code,
            colors.fenced_code,
        ]
    }

    #[test]
    fn system_resolves_to_the_requested_appearance() {
        assert_eq!(
            ThemeProfile::System.resolve(SystemAppearance::Dark).profile,
            ThemeProfile::Dark
        );
        assert_eq!(
            ThemeProfile::System
                .resolve(SystemAppearance::HighContrast)
                .profile,
            ThemeProfile::HighContrast
        );
        assert_eq!(
            ThemeProfile::Light.resolve(SystemAppearance::Dark).profile,
            ThemeProfile::Light
        );
    }

    #[test]
    fn normal_text_and_high_contrast_text_meet_wcag_thresholds() {
        for profile in [ThemeProfile::Light, ThemeProfile::Dark] {
            let colors = SemanticColors::for_profile(profile);
            assert!(colors.primary_text.contrast_ratio(colors.background) >= 4.5);
            assert!(colors.primary_text.contrast_ratio(colors.surface) >= 4.5);
            assert!(colors.muted_text.contrast_ratio(colors.background) >= 4.5);
            assert!(colors.muted_text.contrast_ratio(colors.surface) >= 4.5);
        }
        let colors = SemanticColors::for_profile(ThemeProfile::HighContrast);
        assert!(colors.primary_text.contrast_ratio(colors.background) >= 7.0);
        assert!(colors.muted_text.contrast_ratio(colors.background) >= 7.0);
        assert!(colors.border.contrast_ratio(colors.background) >= 7.0);
    }

    #[test]
    fn semantic_meanings_are_not_collapsed_into_one_color() {
        for profile in [
            ThemeProfile::Light,
            ThemeProfile::Dark,
            ThemeProfile::HighContrast,
        ] {
            let colors = semantic_colors(SemanticColors::for_profile(profile));
            for (index, color) in colors.iter().enumerate() {
                for other in colors.iter().skip(index + 1) {
                    assert!(color != other || matches!(profile, ThemeProfile::HighContrast));
                }
            }
        }
    }

    #[test]
    fn ansi_palette_is_complete_and_indexed() {
        for profile in [
            ThemeProfile::Light,
            ThemeProfile::Dark,
            ThemeProfile::HighContrast,
        ] {
            let colors = SemanticColors::for_profile(profile);
            assert_eq!(colors.terminal_ansi.len(), ANSI_COLOR_COUNT);
            assert!(colors.ansi(0).is_some());
            assert!(colors.ansi(ANSI_COLOR_COUNT - 1).is_some());
            assert!(colors.ansi(ANSI_COLOR_COUNT).is_none());
        }
    }

    #[test]
    fn scale_metrics_are_bounded_to_one_or_two_x() {
        let one = ScaleMetricsV1::for_scale(ScaleFactor::One);
        let two = ScaleMetricsV1::for_scale(ScaleFactor::Two);
        assert!(one.validate());
        assert!(two.validate());
        assert_eq!(one.device_pixel, 1.0);
        assert_eq!(two.device_pixel, 0.5);
        assert_eq!(one.minimum_hit_target, two.minimum_hit_target);
    }

    #[test]
    fn local_asset_policy_has_no_network_or_path_fallback() {
        let policy = LocalAssetPolicyV1::default();
        assert_eq!(policy.schema_version, THEME_POLICY_VERSION);
        assert_eq!(policy.network_assets, NetworkAssetPolicy::Disabled);
        assert_eq!(
            policy.ui_font,
            FontFallbackPolicy::PackagedJetBrainsMono
        );
        assert_eq!(
            policy.monospace_font,
            FontFallbackPolicy::PackagedJetBrainsMono
        );
        assert!(policy.text_glyph_controls);
        assert_eq!(policy.missing_icon, MissingAssetFallback::TextGlyphControl);
        assert_eq!(
            policy.missing_font,
            MissingAssetFallback::SystemQualifiedFont
        );
        assert_eq!(policy.math_fallback(), MissingAssetFallback::LiteralTex);
        let debug = format!("{policy:?}");
        assert!(!debug.contains("http"));
        assert!(!debug.contains('/'));
        assert!(!debug.contains('\\'));
    }

    #[test]
    fn missing_assets_use_explicit_fallbacks() {
        let policy = LocalAssetPolicyV1::default();
        assert_eq!(policy.missing_icon, MissingAssetFallback::TextGlyphControl);
        assert_eq!(
            policy.missing_font,
            MissingAssetFallback::SystemQualifiedFont
        );
        assert_eq!(policy.math_fallback(), MissingAssetFallback::LiteralTex);
    }
}
