use std::sync::Arc;

use gpui::{Context, Render, Window, div, prelude::*};

use crate::app::instance_lock::InstanceGuard;
use crate::app::runtime::AppRuntime;

pub struct StartupView {
    _runtime: Option<Arc<AppRuntime>>,
    _instance_guard: Option<InstanceGuard>,
    startup_error: Option<&'static str>,
}

impl StartupView {
    pub fn new(
        runtime: Option<Arc<AppRuntime>>,
        instance_guard: Option<InstanceGuard>,
        startup_error: Option<&'static str>,
    ) -> Self {
        Self {
            _runtime: runtime,
            _instance_guard: instance_guard,
            startup_error,
        }
    }
}

impl Render for StartupView {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl gpui::IntoElement {
        let status = self
            .startup_error
            .unwrap_or("Pho Code foundation is ready. Authentication is not configured.");
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .p_8()
            .child(status)
    }
}
