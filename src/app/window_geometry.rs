//! Pure geometry for restoring the native workbench window.
//!
//! The adapter supplies logical display rectangles; this module does not know about GPUI, native
//! screens, or persisted paths. Invalid persisted values and display data are ignored before any
//! arithmetic is performed.

pub use super::workbench_preferences::WindowFrame;

pub const MAX_VISIBLE_SCREENS: usize = 16;
pub const MAX_GEOMETRY_COORDINATE: f64 = 100_000.0;
pub const MAX_GEOMETRY_DIMENSION: f64 = 20_000.0;
pub const DEFAULT_WINDOW_WIDTH: f64 = 1_280.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 800.0;
pub const MIN_WINDOW_WIDTH: f64 = 640.0;
pub const MIN_WINDOW_HEIGHT: f64 = 480.0;

/// A visible logical screen work area supplied by the native adapter.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VisibleScreen {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl VisibleScreen {
    fn is_valid(self) -> bool {
        self.x.is_finite()
            && self.y.is_finite()
            && self.width.is_finite()
            && self.height.is_finite()
            && self.x.abs() <= MAX_GEOMETRY_COORDINATE
            && self.y.abs() <= MAX_GEOMETRY_COORDINATE
            && self.width > 0.0
            && self.height > 0.0
            && self.width <= MAX_GEOMETRY_DIMENSION
            && self.height <= MAX_GEOMETRY_DIMENSION
            && self.x + self.width <= MAX_GEOMETRY_COORDINATE
            && self.y + self.height <= MAX_GEOMETRY_COORDINATE
            && self.x + self.width >= -MAX_GEOMETRY_COORDINATE
            && self.y + self.height >= -MAX_GEOMETRY_COORDINATE
    }

    fn right(self) -> f64 {
        self.x + self.width
    }

    fn bottom(self) -> f64 {
        self.y + self.height
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
}

impl WindowSize {
    fn sanitized(self, fallback: Self) -> Self {
        if self.width.is_finite()
            && self.height.is_finite()
            && self.width > 0.0
            && self.height > 0.0
            && self.width <= MAX_GEOMETRY_DIMENSION
            && self.height <= MAX_GEOMETRY_DIMENSION
        {
            self
        } else {
            fallback
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestoreDecision {
    /// The persisted frame was valid and was retained after clamping.
    Restored,
    /// The persisted frame was absent or invalid, so a valid default was centered.
    Centered,
    /// No valid visible screen existed, so a deterministic origin/default was used.
    Default,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RestoredWindowFrame {
    pub frame: WindowFrame,
    pub decision: RestoreDecision,
}

/// Restore a persisted frame against visible screen work areas.
///
/// At most [`MAX_VISIBLE_SCREENS`] entries are considered. Invalid screens are skipped. A valid
/// persisted frame selects the display with the greatest positive intersection area, retaining
/// the first display on ties; a frame with no intersection uses the first valid display. Missing
/// or invalid persisted data uses a centered default. Every returned frame is entirely inside
/// the selected display (or starts at the origin when no display is usable).
pub fn restore_window_frame(
    persisted: Option<WindowFrame>,
    screens: &[VisibleScreen],
    minimum_size: WindowSize,
    default_size: WindowSize,
) -> RestoredWindowFrame {
    let fallback_minimum = WindowSize {
        width: MIN_WINDOW_WIDTH,
        height: MIN_WINDOW_HEIGHT,
    };
    let minimum = minimum_size.sanitized(fallback_minimum);
    let default = default_size.sanitized(WindowSize {
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
    });
    let default = WindowSize {
        width: default.width.max(minimum.width),
        height: default.height.max(minimum.height),
    };

    let valid_screens: Vec<VisibleScreen> = screens
        .iter()
        .copied()
        .take(MAX_VISIBLE_SCREENS)
        .filter(|screen| screen.is_valid())
        .collect();
    let Some(first_screen) = valid_screens.first().copied() else {
        let size = clamped_size(default, minimum, None);
        return RestoredWindowFrame {
            frame: frame_at(0.0, 0.0, size),
            decision: RestoreDecision::Default,
        };
    };

    let valid_persisted = persisted.filter(|frame| valid_frame(*frame));
    let screen = valid_persisted
        .and_then(|frame| best_screen(frame, &valid_screens))
        .unwrap_or(first_screen);

    let (size, decision, origin) = match valid_persisted {
        Some(frame) => {
            let size = clamped_size(
                WindowSize {
                    width: frame.width,
                    height: frame.height,
                },
                minimum,
                Some(screen),
            );
            (
                size,
                RestoreDecision::Restored,
                clamp_origin(frame.x, frame.y, size, screen),
            )
        }
        None => {
            let size = clamped_size(default, minimum, Some(screen));
            (
                size,
                RestoreDecision::Centered,
                (
                    screen.x + (screen.width - size.width) / 2.0,
                    screen.y + (screen.height - size.height) / 2.0,
                ),
            )
        }
    };

    RestoredWindowFrame {
        frame: frame_at(origin.0, origin.1, size),
        decision,
    }
}

fn valid_frame(frame: WindowFrame) -> bool {
    frame.x.is_finite()
        && frame.y.is_finite()
        && frame.width.is_finite()
        && frame.height.is_finite()
        && frame.x.abs() <= MAX_GEOMETRY_COORDINATE
        && frame.y.abs() <= MAX_GEOMETRY_COORDINATE
        && frame.width > 0.0
        && frame.height > 0.0
        && frame.width <= MAX_GEOMETRY_DIMENSION
        && frame.height <= MAX_GEOMETRY_DIMENSION
}

fn best_screen(frame: WindowFrame, screens: &[VisibleScreen]) -> Option<VisibleScreen> {
    let mut best: Option<(f64, VisibleScreen)> = None;
    for screen in screens {
        let left = frame.x.max(screen.x);
        let top = frame.y.max(screen.y);
        let right = (frame.x + frame.width).min(screen.right());
        let bottom = (frame.y + frame.height).min(screen.bottom());
        let area = (right - left).max(0.0) * (bottom - top).max(0.0);
        if area > 0.0 && best.is_none_or(|(best_area, _)| area > best_area) {
            best = Some((area, *screen));
        }
    }
    best.map(|(_, screen)| screen)
}

fn clamped_size(
    requested: WindowSize,
    minimum: WindowSize,
    screen: Option<VisibleScreen>,
) -> WindowSize {
    let (max_width, max_height) = screen
        .map(|screen| (screen.width, screen.height))
        .unwrap_or((MAX_GEOMETRY_DIMENSION, MAX_GEOMETRY_DIMENSION));
    WindowSize {
        width: requested.width.max(minimum.width).min(max_width),
        height: requested.height.max(minimum.height).min(max_height),
    }
}

fn clamp_origin(x: f64, y: f64, size: WindowSize, screen: VisibleScreen) -> (f64, f64) {
    (
        x.clamp(screen.x, screen.right() - size.width),
        y.clamp(screen.y, screen.bottom() - size.height),
    )
}

fn frame_at(x: f64, y: f64, size: WindowSize) -> WindowFrame {
    WindowFrame {
        x,
        y,
        width: size.width,
        height: size.height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen(x: f64, y: f64, width: f64, height: f64) -> VisibleScreen {
        VisibleScreen {
            x,
            y,
            width,
            height,
        }
    }

    fn frame(x: f64, y: f64, width: f64, height: f64) -> WindowFrame {
        WindowFrame {
            x,
            y,
            width,
            height,
        }
    }

    fn size(width: f64, height: f64) -> WindowSize {
        WindowSize { width, height }
    }

    #[test]
    fn missing_frame_is_centered_on_first_screen() {
        let restored = restore_window_frame(
            None,
            &[screen(0.0, 0.0, 1920.0, 1080.0)],
            size(640.0, 480.0),
            size(1000.0, 700.0),
        );
        assert_eq!(restored.decision, RestoreDecision::Centered);
        assert_eq!(restored.frame, frame(460.0, 190.0, 1000.0, 700.0));
    }

    #[test]
    fn onscreen_frame_is_retained() {
        let persisted = frame(100.0, 200.0, 900.0, 600.0);
        let restored = restore_window_frame(
            Some(persisted),
            &[screen(0.0, 0.0, 1920.0, 1080.0)],
            size(640.0, 480.0),
            size(1000.0, 700.0),
        );
        assert_eq!(restored.decision, RestoreDecision::Restored);
        assert_eq!(restored.frame, persisted);
    }

    #[test]
    fn offscreen_frame_is_clamped_from_each_direction() {
        let screens = [screen(0.0, 0.0, 1920.0, 1080.0)];
        let minimum = size(640.0, 480.0);
        let default = size(1000.0, 700.0);
        assert_eq!(
            restore_window_frame(
                Some(frame(-900.0, 200.0, 900.0, 600.0)),
                &screens,
                minimum,
                default
            )
            .frame,
            frame(0.0, 200.0, 900.0, 600.0)
        );
        assert_eq!(
            restore_window_frame(
                Some(frame(1500.0, 200.0, 900.0, 600.0)),
                &screens,
                minimum,
                default
            )
            .frame,
            frame(1020.0, 200.0, 900.0, 600.0)
        );
        assert_eq!(
            restore_window_frame(
                Some(frame(200.0, -500.0, 900.0, 600.0)),
                &screens,
                minimum,
                default
            )
            .frame,
            frame(200.0, 0.0, 900.0, 600.0)
        );
        assert_eq!(
            restore_window_frame(
                Some(frame(200.0, 900.0, 900.0, 600.0)),
                &screens,
                minimum,
                default
            )
            .frame,
            frame(200.0, 480.0, 900.0, 600.0)
        );
    }

    #[test]
    fn oversized_frame_is_clamped_to_screen_and_minimum_is_screen_safe() {
        let restored = restore_window_frame(
            Some(frame(-100.0, -100.0, 5000.0, 5000.0)),
            &[screen(0.0, 0.0, 1920.0, 1080.0)],
            size(2400.0, 1400.0),
            size(1000.0, 700.0),
        );
        assert_eq!(restored.frame, frame(0.0, 0.0, 1920.0, 1080.0));
    }

    #[test]
    fn negative_coordinate_display_is_supported() {
        let restored = restore_window_frame(
            Some(frame(-1800.0, -900.0, 1000.0, 600.0)),
            &[screen(-1920.0, -1080.0, 1920.0, 1080.0)],
            size(640.0, 480.0),
            size(1000.0, 700.0),
        );
        assert_eq!(restored.frame, frame(-1800.0, -900.0, 1000.0, 600.0));
    }

    #[test]
    fn greatest_intersection_selects_display_deterministically() {
        let screens = [
            screen(0.0, 0.0, 1000.0, 1000.0),
            screen(1000.0, 0.0, 2000.0, 1000.0),
        ];
        let restored = restore_window_frame(
            Some(frame(700.0, 100.0, 1000.0, 600.0)),
            &screens,
            size(640.0, 480.0),
            size(800.0, 600.0),
        );
        assert_eq!(restored.frame, frame(1000.0, 100.0, 1000.0, 600.0));
    }

    #[test]
    fn invalid_persisted_values_and_displays_use_safe_defaults() {
        let invalid_screens = [
            screen(f64::NAN, 0.0, 1920.0, 1080.0),
            screen(0.0, 0.0, 0.0, 1080.0),
            screen(0.0, 0.0, f64::INFINITY, 1080.0),
        ];
        let restored = restore_window_frame(
            Some(frame(f64::NAN, 0.0, 1000.0, 700.0)),
            &invalid_screens,
            size(640.0, 480.0),
            size(1000.0, 700.0),
        );
        assert_eq!(restored.decision, RestoreDecision::Default);
        assert_eq!(restored.frame, frame(0.0, 0.0, 1000.0, 700.0));

        let restored = restore_window_frame(
            None,
            &[],
            size(f64::NAN, 0.0),
            size(f64::NAN, f64::INFINITY),
        );
        assert_eq!(
            restored.frame,
            frame(0.0, 0.0, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
        );
    }
}
