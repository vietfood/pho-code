use std::collections::VecDeque;
use std::rc::Rc;

use gpui::{
    Context, Entity, FocusHandle, Focusable as _, Hsla, PathPromptOptions, Render, Subscription,
    Task, Window, WindowAppearance, div, prelude::*, px, rgb,
};

use crate::agent::types::{ApprovalId, ToolCallId, TurnId};
use crate::app::action::RuntimeEvent;
use crate::app::markdown::{MAX_SOURCE_BYTES as MAX_MARKDOWN_SOURCE_BYTES, MarkdownDocument};
use crate::app::workbench_controller::{
    TerminalPanelStatus, WorkbenchCommand, WorkbenchCommandKind, WorkbenchControllerEvent,
    WorkbenchSnapshot,
};
use crate::app::workbench_lifecycle::{
    NativeStartupState, StartupEffect, StartupEvent, StartupGeneration, WorkbenchStartupProjection,
    reduce_startup,
};
use crate::app::workbench_preferences::ThemePreference;
use crate::auth::CredentialState;
use crate::tools::{ApprovalDecision, ApprovalResponse};

use super::composer::{Composer, ComposerEvent};
use super::secure_input::SecureInput;
use super::workbench_theme::{Rgb, SemanticColors, SystemAppearance, ThemeProfile};

pub const DEFAULT_WINDOW_WIDTH: f32 = 1_400.0;
pub const DEFAULT_WINDOW_HEIGHT: f32 = 900.0;
pub const MINIMUM_WINDOW_WIDTH: f32 = 960.0;
pub const MINIMUM_WINDOW_HEIGHT: f32 = 640.0;
pub const NAVIGATION_PREFERRED_WIDTH: f32 = 300.0;
pub const FILE_TREE_PREFERRED_WIDTH: f32 = 250.0;
pub const COLLAPSED_REGION_WIDTH: f32 = 44.0;
pub const ALL_REGIONS_MINIMUM_WIDTH: f32 = 1_150.0;
pub const NAVIGATION_COLLAPSE_WIDTH: f32 = 900.0;

gpui::actions!(
    pho_workbench,
    [
        FocusNavigation,
        FocusChat,
        FocusInspection,
        FocusTerminal,
        FocusFiles,
        OpenCredentialSettings
    ]
);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LayoutDecision {
    pub navigation_collapsed: bool,
    pub file_tree_collapsed: bool,
}

pub fn layout_for_width(width: f32) -> LayoutDecision {
    let bounded = if width.is_finite() {
        width.max(0.0)
    } else {
        0.0
    };
    LayoutDecision {
        file_tree_collapsed: bounded < ALL_REGIONS_MINIMUM_WIDTH,
        navigation_collapsed: bounded < NAVIGATION_COLLAPSE_WIDTH,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SemanticPalette {
    pub background: Hsla,
    pub surface: Hsla,
    pub raised: Hsla,
    pub border: Hsla,
    pub text: Hsla,
    pub muted_text: Hsla,
    pub focus: Hsla,
    pub warning: Hsla,
}

impl SemanticPalette {
    pub fn for_theme(theme: ThemePreference) -> Self {
        let profile = match theme {
            ThemePreference::System | ThemePreference::Light => ThemeProfile::Light,
            ThemePreference::Dark => ThemeProfile::Dark,
            ThemePreference::HighContrast => ThemeProfile::HighContrast,
        };
        Self::from_semantic(SemanticColors::for_profile(profile))
    }

    pub fn for_window(theme: ThemePreference, appearance: WindowAppearance) -> Self {
        let profile = match theme {
            ThemePreference::System => ThemeProfile::System,
            ThemePreference::Light => ThemeProfile::Light,
            ThemePreference::Dark => ThemeProfile::Dark,
            ThemePreference::HighContrast => ThemeProfile::HighContrast,
        };
        let appearance = match appearance {
            WindowAppearance::Dark | WindowAppearance::VibrantDark => SystemAppearance::Dark,
            WindowAppearance::Light | WindowAppearance::VibrantLight => SystemAppearance::Light,
        };
        Self::from_semantic(profile.resolve(appearance).colors)
    }

    fn from_semantic(colors: SemanticColors) -> Self {
        Self {
            background: gpui_color(colors.background),
            surface: gpui_color(colors.surface),
            raised: gpui_color(colors.raised),
            border: gpui_color(colors.border),
            text: gpui_color(colors.primary_text),
            muted_text: gpui_color(colors.muted_text),
            focus: gpui_color(colors.focus),
            warning: gpui_color(colors.warning),
        }
    }
}

fn gpui_color(color: Rgb) -> Hsla {
    let encoded =
        (u32::from(color.red) << 16) | (u32::from(color.green) << 8) | u32::from(color.blue);
    rgb(encoded).into()
}

pub struct StartupView {
    projection: WorkbenchStartupProjection,
    theme: ThemePreference,
    retry_action: Option<RetryStartupAction>,
    retry_in_progress: bool,
    credential_input: Entity<SecureInput>,
    composer: Entity<Composer>,
    terminal_composer: Entity<Composer>,
    navigation_focus: FocusHandle,
    chat_focus: FocusHandle,
    inspection_focus: FocusHandle,
    terminal_focus: FocusHandle,
    files_focus: FocusHandle,
    command_sender: Option<tokio::sync::mpsc::Sender<WorkbenchCommand>>,
    cancellation_sender: Option<tokio::sync::mpsc::Sender<TurnId>>,
    approval_sender: Option<tokio::sync::mpsc::Sender<ApprovalResponse>>,
    snapshot: Option<WorkbenchSnapshot>,
    active_turn_id: Option<TurnId>,
    streamed_reasoning: String,
    streamed_text: String,
    trace: VecDeque<String>,
    pending_approval: Option<PendingApproval>,
    approval_response_pending: bool,
    workbench_error: Option<&'static str>,
    credential_dialog_open: bool,
    credential_operation_active: bool,
    credential_error: Option<&'static str>,
    workbench_events: Task<()>,
    _subscriptions: Vec<Subscription>,
}

#[derive(Clone)]
struct PendingApproval {
    turn_id: TurnId,
    approval_id: ApprovalId,
    tool_call_id: ToolCallId,
    effect_digest: String,
    summary: String,
}

pub type RetryStartupAction = Rc<
    dyn Fn(
        WorkbenchStartupProjection,
        gpui::WeakEntity<StartupView>,
        &mut Window,
        &mut Context<StartupView>,
    ),
>;

impl StartupView {
    pub fn new(
        projection: WorkbenchStartupProjection,
        theme: ThemePreference,
        retry_action: Option<RetryStartupAction>,
        credential_input: Entity<SecureInput>,
        composer: Entity<Composer>,
        terminal_composer: Entity<Composer>,
        cx: &mut Context<Self>,
    ) -> Self {
        let chat_subscription = cx.subscribe(&composer, |view, _, event, cx| {
            if let ComposerEvent::Submitted(text) = event {
                view.send_prompt(text.clone(), cx);
            }
        });
        let terminal_subscription = cx.subscribe(&terminal_composer, |view, _, event, cx| {
            if let ComposerEvent::Submitted(text) = event {
                view.send_terminal_input(text.clone(), cx);
            }
        });
        Self {
            projection,
            theme,
            retry_action,
            retry_in_progress: false,
            credential_input,
            composer,
            terminal_composer,
            navigation_focus: cx.focus_handle(),
            chat_focus: cx.focus_handle(),
            inspection_focus: cx.focus_handle(),
            terminal_focus: cx.focus_handle(),
            files_focus: cx.focus_handle(),
            command_sender: None,
            cancellation_sender: None,
            approval_sender: None,
            snapshot: None,
            active_turn_id: None,
            streamed_reasoning: String::new(),
            streamed_text: String::new(),
            trace: VecDeque::new(),
            pending_approval: None,
            approval_response_pending: false,
            workbench_error: None,
            credential_dialog_open: false,
            credential_operation_active: false,
            credential_error: None,
            workbench_events: Task::ready(()),
            _subscriptions: vec![chat_subscription, terminal_subscription],
        }
    }

    pub fn attach_workbench_runtime(
        &mut self,
        sender: tokio::sync::mpsc::Sender<WorkbenchCommand>,
        mut receiver: tokio::sync::mpsc::Receiver<WorkbenchControllerEvent>,
        cancellations: tokio::sync::mpsc::Sender<TurnId>,
        approvals: tokio::sync::mpsc::Sender<ApprovalResponse>,
        cx: &mut Context<Self>,
    ) {
        self.command_sender = Some(sender);
        self.cancellation_sender = Some(cancellations);
        self.approval_sender = Some(approvals);
        self.workbench_events = cx.spawn(async move |this, cx| {
            while let Some(event) = receiver.recv().await {
                if this
                    .update(cx, |view, cx| view.apply_controller_event(event, cx))
                    .is_err()
                {
                    break;
                }
            }
        });
        cx.notify();
    }

    pub fn replace_startup(
        &mut self,
        projection: WorkbenchStartupProjection,
        theme: ThemePreference,
        cx: &mut Context<Self>,
    ) {
        self.projection = projection;
        self.theme = theme;
        self.retry_in_progress = false;
        cx.notify();
    }

    pub fn begin_shutdown(&mut self, cx: &mut Context<Self>) -> Option<StartupGeneration> {
        self.credential_dialog_open = false;
        self.credential_operation_active = false;
        self.credential_error = None;
        self.credential_input
            .update(cx, |input, cx| input.clear(cx));
        let effect = reduce_startup(&mut self.projection, StartupEvent::ShutdownRequested);
        cx.notify();
        match effect {
            Some(StartupEffect::BeginShutdown { generation }) => Some(generation),
            _ => None,
        }
    }

    pub fn complete_shutdown(&mut self, generation: StartupGeneration, cx: &mut Context<Self>) {
        let _ = reduce_startup(
            &mut self.projection,
            StartupEvent::ShutdownCompleted { generation },
        );
        cx.notify();
    }

    fn apply_controller_event(&mut self, event: WorkbenchControllerEvent, cx: &mut Context<Self>) {
        match event {
            WorkbenchControllerEvent::Snapshot(snapshot) => {
                let generation = self.projection.generation;
                let _ = reduce_startup(
                    &mut self.projection,
                    StartupEvent::CredentialChanged {
                        generation,
                        state: snapshot.credentials,
                    },
                );
                let composer_enabled = snapshot.credentials == CredentialState::Ready
                    && snapshot.selected_session_id.is_some()
                    && !snapshot.session_read_only
                    && snapshot.workspace_available
                    && !snapshot.turn_active;
                self.composer.update(cx, |composer, cx| {
                    composer.set_enabled(composer_enabled, cx)
                });
                let terminal_enabled = matches!(
                    snapshot.terminal_status,
                    TerminalPanelStatus::Starting | TerminalPanelStatus::Running
                );
                self.terminal_composer.update(cx, |composer, cx| {
                    composer.set_enabled(terminal_enabled, cx)
                });
                if !snapshot.turn_active {
                    self.streamed_reasoning.clear();
                    self.streamed_text.clear();
                }
                self.snapshot = Some(*snapshot);
            }
            WorkbenchControllerEvent::Runtime(event) => self.apply_runtime_event(event, cx),
            WorkbenchControllerEvent::CommandFinished {
                kind,
                succeeded,
                code,
            } => match kind {
                WorkbenchCommandKind::Credential => {
                    self.credential_operation_active = false;
                    if succeeded {
                        self.credential_dialog_open = false;
                        self.credential_error = None;
                        self.credential_input
                            .update(cx, |input, cx| input.clear(cx));
                    } else {
                        self.credential_error =
                            Some("The credential operation did not complete. Review the status.");
                    }
                }
                WorkbenchCommandKind::Workspace
                | WorkbenchCommandKind::Session
                | WorkbenchCommandKind::Turn
                | WorkbenchCommandKind::Terminal => {
                    self.workbench_error = if succeeded {
                        None
                    } else {
                        Some(code.unwrap_or("operation_failed"))
                    };
                }
            },
        }
        cx.notify();
    }

    fn apply_runtime_event(&mut self, event: RuntimeEvent, cx: &mut Context<Self>) {
        match event {
            RuntimeEvent::CredentialChanged { state } => {
                let generation = self.projection.generation;
                let _ = reduce_startup(
                    &mut self.projection,
                    StartupEvent::CredentialChanged { generation, state },
                );
            }
            RuntimeEvent::TurnPrepared { turn_id } => {
                self.active_turn_id = Some(turn_id);
                self.streamed_reasoning.clear();
                self.streamed_text.clear();
                self.pending_approval = None;
                self.approval_response_pending = false;
                self.composer
                    .update(cx, |composer, cx| composer.set_enabled(false, cx));
                self.push_trace("Preparing turn");
            }
            RuntimeEvent::ModelStreamStarted { .. } => self.push_trace("Streaming model response"),
            RuntimeEvent::ReasoningDelta { text, .. } => {
                if self.streamed_reasoning.len().saturating_add(text.len()) <= 8 * 1024 * 1024 {
                    self.streamed_reasoning.push_str(&text);
                }
            }
            RuntimeEvent::TextDelta { text, .. } => {
                if self.streamed_text.len().saturating_add(text.len()) <= 8 * 1024 * 1024 {
                    self.streamed_text.push_str(&text);
                }
            }
            RuntimeEvent::AssistantPhaseCompleted { .. } => {
                self.push_trace("Assistant phase completed")
            }
            RuntimeEvent::ToolValidated { name, .. } => {
                self.push_trace(format!("Validated tool: {name}"))
            }
            RuntimeEvent::ApprovalRequested {
                turn_id,
                approval_id,
                tool_call_id,
                effect_digest,
                summary,
            } => {
                self.pending_approval = Some(PendingApproval {
                    turn_id,
                    approval_id,
                    tool_call_id,
                    effect_digest,
                    summary,
                });
                self.approval_response_pending = false;
                self.push_trace("Waiting for approval");
            }
            RuntimeEvent::ApprovalResolved { decision, .. } => {
                self.pending_approval = None;
                self.approval_response_pending = false;
                self.push_trace(format!("Approval: {decision:?}"));
            }
            RuntimeEvent::ToolStarted { name, .. } => {
                self.push_trace(format!("Running tool: {name}"))
            }
            RuntimeEvent::ToolCompleted {
                name,
                status,
                output,
                ..
            } => {
                self.push_trace(format!("Tool {name}: {status:?}"));
                if !output.is_empty() {
                    self.push_trace(bounded_display(&output, 8 * 1024));
                }
            }
            RuntimeEvent::ContinuationStarted { index, .. } => {
                self.push_trace(format!("Continuation {}", index + 1))
            }
            RuntimeEvent::LimitReached { limit, .. } => {
                self.push_trace(format!("Limit reached: {limit:?}"))
            }
            RuntimeEvent::UsageUpdated { usage, .. } => self.push_trace(format!(
                "Usage: {} input / {} output tokens",
                usage.prompt_tokens.unwrap_or(0),
                usage.output_tokens.unwrap_or(0)
            )),
            RuntimeEvent::TurnCompleted { .. } => self.finish_turn("Turn completed", cx),
            RuntimeEvent::TurnFailed { code, .. } => {
                self.workbench_error = Some(code);
                self.finish_turn("Turn failed", cx);
            }
            RuntimeEvent::TurnCancelled { .. } => self.finish_turn("Turn cancelled", cx),
            RuntimeEvent::TurnInterrupted { .. } => self.finish_turn("Turn interrupted", cx),
            RuntimeEvent::TurnUncertain { .. } => self.finish_turn("Turn outcome uncertain", cx),
            RuntimeEvent::StartupReady { .. } | RuntimeEvent::SessionLoaded { .. } => {}
        }
    }

    fn push_trace(&mut self, line: impl Into<String>) {
        if self.trace.len() >= 256 {
            self.trace.pop_front();
        }
        self.trace.push_back(line.into());
    }

    fn finish_turn(&mut self, label: &'static str, cx: &mut Context<Self>) {
        self.push_trace(label);
        self.active_turn_id = None;
        self.pending_approval = None;
        self.approval_response_pending = false;
        let enabled = self.snapshot.as_ref().is_some_and(|snapshot| {
            snapshot.credentials == CredentialState::Ready
                && snapshot.selected_session_id.is_some()
                && !snapshot.session_read_only
                && snapshot.workspace_available
        });
        self.composer
            .update(cx, |composer, cx| composer.set_enabled(enabled, cx));
    }

    fn open_credential_dialog(
        &mut self,
        _: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_credential_dialog(window, cx);
    }

    fn show_credential_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.command_sender.is_none() || self.credential_operation_active {
            return;
        }
        self.credential_dialog_open = true;
        self.credential_error = None;
        self.credential_input
            .read(cx)
            .focus_handle(cx)
            .focus(window, cx);
        cx.notify();
    }

    fn focus_navigation(
        &mut self,
        _: &FocusNavigation,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.navigation_focus.focus(window, cx);
    }

    fn focus_chat(&mut self, _: &FocusChat, window: &mut Window, cx: &mut Context<Self>) {
        self.chat_focus.focus(window, cx);
    }

    fn focus_inspection(
        &mut self,
        _: &FocusInspection,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.inspection_focus.focus(window, cx);
    }

    fn focus_terminal(&mut self, _: &FocusTerminal, window: &mut Window, cx: &mut Context<Self>) {
        self.terminal_focus.focus(window, cx);
    }

    fn focus_files(&mut self, _: &FocusFiles, window: &mut Window, cx: &mut Context<Self>) {
        self.files_focus.focus(window, cx);
    }

    fn open_credential_settings(
        &mut self,
        _: &OpenCredentialSettings,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_credential_dialog(window, cx);
    }

    fn dismiss_credential_dialog(
        &mut self,
        _: &gpui::ClickEvent,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.credential_operation_active {
            return;
        }
        self.credential_dialog_open = false;
        self.credential_error = None;
        self.credential_input
            .update(cx, |input, cx| input.clear(cx));
        cx.notify();
    }

    fn submit_credential(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.credential_operation_active {
            return;
        }
        let Some(sender) = self.command_sender.as_ref() else {
            return;
        };
        let Some(candidate) = self
            .credential_input
            .update(cx, |input, cx| input.take_secret(cx))
        else {
            self.credential_error = Some("Enter a credential before validating.");
            cx.notify();
            return;
        };
        match sender.try_send(WorkbenchCommand::InstallCredential { candidate }) {
            Ok(()) => {
                self.credential_operation_active = true;
                self.credential_error = None;
            }
            Err(error) => {
                drop(error);
                self.credential_error =
                    Some("Credential validation is busy or unavailable. Try again.");
            }
        }
        cx.notify();
    }

    fn remove_credential(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.credential_operation_active {
            return;
        }
        let Some(sender) = self.command_sender.as_ref() else {
            return;
        };
        match sender.try_send(WorkbenchCommand::RemoveCredential) {
            Ok(()) => {
                self.credential_operation_active = true;
                self.credential_error = None;
            }
            Err(error) => {
                drop(error);
                self.credential_error =
                    Some("Credential removal is busy or unavailable. Try again.");
            }
        }
        cx.notify();
    }

    fn send_prompt(&mut self, text: String, cx: &mut Context<Self>) {
        let Some(sender) = self.command_sender.as_ref() else {
            self.composer.update(cx, |composer, cx| {
                let _ = composer.set_text(text, cx);
            });
            self.workbench_error = Some("runtime_unavailable");
            return;
        };
        match sender.try_send(WorkbenchCommand::SendPrompt { text }) {
            Ok(()) => {
                self.workbench_error = None;
                self.composer
                    .update(cx, |composer, cx| composer.set_enabled(false, cx));
            }
            Err(error) => {
                let WorkbenchCommand::SendPrompt { text } = error.into_inner() else {
                    return;
                };
                self.composer.update(cx, |composer, cx| {
                    let _ = composer.set_text(text, cx);
                });
                self.workbench_error = Some("runtime_busy");
            }
        }
        cx.notify();
    }

    fn send_terminal_input(&mut self, text: String, cx: &mut Context<Self>) {
        let mut bytes = text.into_bytes();
        bytes.push(b'\n');
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::TerminalInput {
                    bytes: bytes.clone(),
                })
                .map_err(|_| ())
        });
        if result.is_err() {
            let text =
                String::from_utf8_lossy(&bytes[..bytes.len().saturating_sub(1)]).into_owned();
            self.terminal_composer.update(cx, |composer, cx| {
                let _ = composer.set_text(text, cx);
            });
            self.workbench_error = Some("terminal_busy");
        } else {
            self.workbench_error = None;
        }
        cx.notify();
    }

    fn start_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::StartTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn interrupt_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::InterruptTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn close_terminal(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::CloseTerminal)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "terminal_busy");
        cx.notify();
    }

    fn choose_workspace(
        &mut self,
        _: &gpui::ClickEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(sender) = self.command_sender.clone() else {
            return;
        };
        if self.active_turn_id.is_some() {
            self.workbench_error = Some("turn_active");
            cx.notify();
            return;
        }
        let selection = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Open workspace".into()),
        });
        cx.spawn_in(window, async move |this, window| {
            let path = selection.await.ok()?.ok()??.into_iter().next()?;
            this.update(window, |view, cx| {
                match sender.try_send(WorkbenchCommand::OpenWorkspace { path }) {
                    Ok(()) => view.workbench_error = None,
                    Err(_) => view.workbench_error = Some("runtime_busy"),
                }
                cx.notify();
            })
            .ok()
        })
        .detach();
    }

    fn new_session(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self.command_sender.as_ref().ok_or(()).and_then(|sender| {
            sender
                .try_send(WorkbenchCommand::NewSession)
                .map_err(|_| ())
        });
        self.workbench_error = result.err().map(|_| "runtime_busy");
        cx.notify();
    }

    fn cancel_turn(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        let result = self
            .active_turn_id
            .zip(self.cancellation_sender.as_ref())
            .ok_or(())
            .and_then(|(turn_id, sender)| sender.try_send(turn_id).map_err(|_| ()));
        if result.is_ok() {
            self.push_trace("Cancelling turn…");
        } else {
            self.workbench_error = Some("cancel_unavailable");
        }
        cx.notify();
    }

    fn approve(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.resolve_pending_approval(ApprovalDecision::Approved, cx);
    }

    fn deny(&mut self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>) {
        self.resolve_pending_approval(ApprovalDecision::Denied, cx);
    }

    fn resolve_pending_approval(&mut self, decision: ApprovalDecision, cx: &mut Context<Self>) {
        if self.approval_response_pending {
            return;
        }
        let Some(pending) = self.pending_approval.clone() else {
            self.workbench_error = Some("stale_approval");
            cx.notify();
            return;
        };
        let response = ApprovalResponse {
            turn_id: pending.turn_id,
            approval_id: pending.approval_id,
            tool_call_id: pending.tool_call_id,
            effect_digest: pending.effect_digest,
            decision,
        };
        let result = self
            .approval_sender
            .as_ref()
            .ok_or(())
            .and_then(|sender| sender.try_send(response).map_err(|_| ()));
        if result.is_ok() {
            // Keep the exact card visible until the runtime emits ApprovalResolved. Submission
            // only proves that the bounded UI channel accepted the response, not that the
            // coordinator accepted its identities or decision.
            self.approval_response_pending = true;
            self.push_trace("Approval response submitted; awaiting confirmation");
        } else {
            self.workbench_error = Some("approval_unavailable");
        }
        cx.notify();
    }

    fn retry_lock(&mut self, _: &gpui::ClickEvent, window: &mut Window, cx: &mut Context<Self>) {
        if self.retry_in_progress {
            return;
        }
        let Some(retry_action) = self.retry_action.clone() else {
            return;
        };
        if reduce_startup(&mut self.projection, StartupEvent::RetryLock).is_none() {
            return;
        }
        self.retry_in_progress = true;
        cx.notify();
        retry_action(self.projection.clone(), cx.entity().downgrade(), window, cx);
    }

    fn status_text(&self) -> &'static str {
        if self.retry_in_progress {
            return "Retrying the local application-state lock…";
        }
        if matches!(
            self.projection.state,
            NativeStartupState::ReadyOffline
                | NativeStartupState::NeedsCredential
                | NativeStartupState::CredentialUnavailable
                | NativeStartupState::Ready
        ) && let Some(snapshot) = self.snapshot.as_ref()
        {
            return match snapshot.credentials {
                CredentialState::Ready
                    if snapshot.selected_session_id.is_some() && snapshot.workspace_available =>
                {
                    "Pho Code is ready."
                }
                CredentialState::Ready => "Local workbench ready. Select a session to send.",
                CredentialState::Installing | CredentialState::Validating => {
                    "Validating the DeepSeek credential…"
                }
                CredentialState::Missing
                | CredentialState::Invalid
                | CredentialState::Malformed => {
                    "Local workbench ready. A DeepSeek credential is required to send."
                }
                CredentialState::TemporarilyUnavailable | CredentialState::RemovalFailed => {
                    "Local workbench ready. Credential service is temporarily unavailable."
                }
            };
        }
        match self.projection.state {
            NativeStartupState::Booting => "Starting Pho Code…",
            NativeStartupState::LockUnavailable => {
                "Another Pho Code process owns local application state."
            }
            NativeStartupState::LoadingPreferences => "Loading workbench preferences…",
            NativeStartupState::ScanningSessions => "Scanning local sessions…",
            NativeStartupState::InspectingCredentials => "Inspecting credential status…",
            NativeStartupState::RestoringSelection => "Restoring local selection…",
            NativeStartupState::ReadyOffline => "Local workbench ready. Select a session to send.",
            NativeStartupState::NeedsCredential => {
                "Local workbench ready. A DeepSeek credential is required to send."
            }
            NativeStartupState::CredentialUnavailable => {
                "Local workbench ready. Credential service is temporarily unavailable."
            }
            NativeStartupState::Ready => "Pho Code is ready.",
            NativeStartupState::ShuttingDown => "Shutting down safely…",
            NativeStartupState::Terminated => "Pho Code stopped.",
            NativeStartupState::Failed => "Pho Code could not initialize local services.",
        }
    }
}

impl Render for StartupView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        window.set_window_title("Pho Code");
        let palette = SemanticPalette::for_window(self.theme, window.appearance());
        let layout = layout_for_width(window.viewport_size().width.as_f32());
        let navigation_width = if layout.navigation_collapsed {
            COLLAPSED_REGION_WIDTH
        } else {
            NAVIGATION_PREFERRED_WIDTH
        };
        let file_tree_width = if layout.file_tree_collapsed {
            COLLAPSED_REGION_WIDTH
        } else {
            FILE_TREE_PREFERRED_WIDTH
        };
        div()
            .id("pho-workbench")
            .aria_label("Pho Code native workbench")
            .size_full()
            .flex()
            .flex_col()
            .bg(palette.background)
            .text_color(palette.text)
            .on_action(cx.listener(Self::focus_navigation))
            .on_action(cx.listener(Self::focus_chat))
            .on_action(cx.listener(Self::focus_inspection))
            .on_action(cx.listener(Self::focus_terminal))
            .on_action(cx.listener(Self::focus_files))
            .on_action(cx.listener(Self::open_credential_settings))
            .child(
                div()
                    .id("workbench-status")
                    .aria_label(self.status_text())
                    .h(px(36.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .px_4()
                    .bg(palette.raised)
                    .border_b_1()
                    .border_color(palette.border)
                    .text_sm()
                    .justify_between()
                    .child(self.status_text())
                    .when(
                        self.projection.state == NativeStartupState::LockUnavailable,
                        |header| {
                            header.child(
                                div()
                                    .id("retry-application-lock")
                                    .role(gpui::Role::Button)
                                    .aria_label("Retry opening Pho Code")
                                    .px_3()
                                    .py_1()
                                    .rounded_sm()
                                    .border_1()
                                    .border_color(palette.border)
                                    .when(self.retry_in_progress, |button| {
                                        button.text_color(palette.muted_text)
                                    })
                                    .when(!self.retry_in_progress, |button| {
                                        button
                                            .cursor_pointer()
                                            .hover(move |style| style.bg(palette.surface))
                                            .on_click(cx.listener(Self::retry_lock))
                                    })
                                    .child(if self.retry_in_progress {
                                        "Retrying…"
                                    } else {
                                        "Retry"
                                    }),
                            )
                        },
                    )
                    .when(
                        matches!(
                            self.projection.state,
                            NativeStartupState::ReadyOffline
                                | NativeStartupState::NeedsCredential
                                | NativeStartupState::CredentialUnavailable
                                | NativeStartupState::Ready
                        ) && self.command_sender.is_some(),
                        |header| {
                            header.child(
                                div()
                                    .id("open-credential-dialog")
                                    .role(gpui::Role::Button)
                                    .aria_label("Open DeepSeek credential settings")
                                    .px_3()
                                    .py_1()
                                    .rounded_sm()
                                    .border_1()
                                    .border_color(palette.border)
                                    .cursor_pointer()
                                    .hover(move |style| style.bg(palette.surface))
                                    .on_click(cx.listener(Self::open_credential_dialog))
                                    .child("Credential"),
                            )
                        },
                    ),
            )
            .child(
                div()
                    .id("workbench-regions")
                    .aria_label("Workbench regions")
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child({
                        let workspaces = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.workspaces.clone());
                        let sessions = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.sessions.clone());
                        let mut navigation = pane_header(
                            if layout.navigation_collapsed {
                                "W"
                            } else {
                                "Navigation"
                            },
                            "Registered workspaces and recent sessions",
                            palette,
                        )
                        .w(px(navigation_width))
                        .track_focus(&self.navigation_focus)
                        .flex_none()
                        .border_r_1()
                        .border_color(palette.border);
                        if !layout.navigation_collapsed {
                            navigation = navigation.child(
                                div()
                                    .p_2()
                                    .flex()
                                    .flex_col()
                                    .gap_2()
                                    .child(
                                        div()
                                            .id("open-workspace")
                                            .role(gpui::Role::Button)
                                            .aria_label("Open workspace folder")
                                            .px_3()
                                            .py_2()
                                            .rounded_sm()
                                            .border_1()
                                            .border_color(palette.border)
                                            .cursor_pointer()
                                            .hover(move |style| style.bg(palette.raised))
                                            .on_click(cx.listener(Self::choose_workspace))
                                            .child("Open workspace…"),
                                    )
                                    .children(workspaces.into_iter().map(|workspace| {
                                        let sender = self.command_sender.clone();
                                        div()
                                            .id(workspace.registration_id.to_string())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!(
                                                "Select workspace {}",
                                                workspace.display_name
                                            ))
                                            .px_2()
                                            .py_1()
                                            .rounded_sm()
                                            .when(workspace.selected, |row| row.bg(palette.raised))
                                            .cursor_pointer()
                                            .on_click(move |_, _, _| {
                                                if let Some(sender) = sender.as_ref() {
                                                    let _ = sender.try_send(
                                                        WorkbenchCommand::SelectWorkspace {
                                                            registration_id:
                                                                workspace.registration_id,
                                                        },
                                                    );
                                                }
                                            })
                                            .child(workspace.display_name)
                                    }))
                                    .when(
                                        self.snapshot
                                            .as_ref()
                                            .is_some_and(|snapshot| {
                                                snapshot.selected_registration_id.is_some()
                                            }),
                                        |list| {
                                            list.child(
                                                div()
                                                    .id("new-session")
                                                    .role(gpui::Role::Button)
                                                    .aria_label("Create new chat session")
                                                    .px_3()
                                                    .py_2()
                                                    .rounded_sm()
                                                    .border_1()
                                                    .border_color(palette.border)
                                                    .cursor_pointer()
                                                    .on_click(cx.listener(Self::new_session))
                                                    .child("New chat"),
                                            )
                                        },
                                    )
                                    .children(sessions.into_iter().map(|session| {
                                        let sender = self.command_sender.clone();
                                        div()
                                            .id(session.session_id.to_string())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!(
                                                "Open chat session {}",
                                                session.title
                                            ))
                                            .px_2()
                                            .py_1()
                                            .rounded_sm()
                                            .when(session.selected, |row| row.bg(palette.raised))
                                            .when(session.read_only, |row| {
                                                row.text_color(palette.muted_text)
                                            })
                                            .cursor_pointer()
                                            .on_click(move |_, _, _| {
                                                if let Some(sender) = sender.as_ref() {
                                                    let _ = sender.try_send(
                                                        WorkbenchCommand::OpenSession {
                                                            session_id: session.session_id,
                                                        },
                                                    );
                                                }
                                            })
                                            .child(session.title)
                                    })),
                            );
                        }
                        navigation
                    })
                    .child({
                        let messages = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.messages.clone());
                        let streamed = self.streamed_text.clone();
                        let reasoning_bytes = self.streamed_reasoning.len();
                        let trace = self.trace.iter().cloned().collect::<Vec<_>>();
                        let approval = self.pending_approval.clone();
                        let approval_response_pending = self.approval_response_pending;
                        pane_header("Chat", "Chat execution trace and composer", palette)
                            .track_focus(&self.chat_focus)
                            .flex_1()
                            .min_w(px(280.0))
                            .border_r_1()
                            .border_color(palette.border)
                            .child(
                                div()
                                    .id("chat-transcript")
                                    .aria_label("Chat transcript")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_scroll()
                                    .p_3()
                                    .flex()
                                    .flex_col()
                                    .gap_3()
                                    .children(messages.into_iter().filter_map(|message| {
                                        render_backend_message(message, palette)
                                    }))
                                    .when(reasoning_bytes > 0, |transcript| {
                                        transcript.child(
                                            div()
                                                .text_sm()
                                                .text_color(palette.muted_text)
                                                .child(format!(
                                                    "Provider reasoning streaming ({} bytes)",
                                                    reasoning_bytes
                                                )),
                                        )
                                    })
                                    .when(!streamed.is_empty(), |transcript| {
                                        transcript.child(
                                            transcript_bubble(
                                                "assistant-streaming".to_owned(),
                                                "Assistant · streaming",
                                                safe_markdown_source(&streamed, false),
                                                palette,
                                                false,
                                            ),
                                        )
                                    })
                                    .children(trace.into_iter().map(|line| {
                                        div()
                                            .text_sm()
                                            .text_color(palette.muted_text)
                                            .child(line)
                                    }))
                                    .when_some(approval, |transcript, approval| {
                                        transcript.child(
                                            div()
                                                .id("approval-card")
                                                .aria_label("Tool approval required")
                                                .p_3()
                                                .flex()
                                                .flex_col()
                                                .gap_2()
                                                .rounded_md()
                                                .border_1()
                                                .border_color(palette.warning)
                                                .child(
                                                    div()
                                                        .text_sm()
                                                        .child("Approval required"),
                                                )
                                                .child(
                                                    div()
                                                        .text_sm()
                                                        .text_color(palette.muted_text)
                                                        .child(bounded_display(
                                                            &approval.summary,
                                                            4 * 1024,
                                                        )),
                                                )
                                                .child(
                                                    div()
                                                        .flex()
                                                        .gap_2()
                                                        .child(
                                                            div()
                                                                .id("deny-tool")
                                                                .role(gpui::Role::Button)
                                                                .aria_label("Deny tool")
                                                                .px_3()
                                                                .py_2()
                                                                .border_1()
                                                                .border_color(palette.border)
                                                                .cursor_pointer()
                                                                .on_click(cx.listener(Self::deny))
                                                                .child(if approval_response_pending {
                                                                    "Awaiting confirmation"
                                                                } else {
                                                                    "Deny"
                                                                }),
                                                        )
                                                        .child(
                                                            div()
                                                                .id("approve-tool-once")
                                                                .role(gpui::Role::Button)
                                                                .aria_label("Approve tool once")
                                                                .px_3()
                                                                .py_2()
                                                                .bg(palette.focus)
                                                                .text_color(palette.background)
                                                                .cursor_pointer()
                                                                .on_click(cx.listener(Self::approve))
                                                                .child(if approval_response_pending {
                                                                    "Awaiting confirmation"
                                                                } else {
                                                                    "Approve once"
                                                                }),
                                                        ),
                                                ),
                                        )
                                    }),
                            )
                            .when_some(self.workbench_error, |chat, error| {
                                chat.child(
                                    div()
                                        .px_3()
                                        .py_1()
                                        .text_sm()
                                        .text_color(palette.warning)
                                        .child(error),
                                )
                            })
                            .child(
                                div()
                                    .p_2()
                                    .flex_none()
                                    .border_t_1()
                                    .border_color(palette.border)
                                    .flex()
                                    .gap_2()
                                    .child(
                                        div()
                                            .h(px(88.0))
                                            .flex_1()
                                            .rounded_sm()
                                            .border_1()
                                            .border_color(palette.border)
                                            .child(self.composer.clone()),
                                    )
                                    .when(self.active_turn_id.is_some(), |composer| {
                                        composer.child(
                                            div()
                                                .id("cancel-turn")
                                                .role(gpui::Role::Button)
                                                .aria_label("Cancel active turn")
                                                .px_3()
                                                .flex()
                                                .items_center()
                                                .rounded_sm()
                                                .border_1()
                                                .border_color(palette.border)
                                                .cursor_pointer()
                                                .on_click(cx.listener(Self::cancel_turn))
                                                .child("Cancel"),
                                        )
                                    }),
                            )
                    })
                    .child(
                        div()
                            .id("inspection-region")
                            .aria_label("Inspection")
                            .track_focus(&self.inspection_focus)
                            .flex_1()
                            .min_w(px(280.0))
                            .flex()
                            .flex_col()
                            .border_r_1()
                            .border_color(palette.border)
                            .child({
                                let file = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.file.clone());
                                let git = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.git.clone());
                                let git_diff = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.git_diff.clone());
                                let git_sender = self.command_sender.clone();
                                let diff_sender = self.command_sender.clone();
                                pane_header(
                                    "Viewer",
                                    "Read-only file and Git viewer",
                                    palette,
                                )
                                .flex_1()
                                .border_b_1()
                                .border_color(palette.border)
                                .child(
                                    div()
                                        .px_2()
                                        .py_1()
                                        .flex()
                                        .items_center()
                                        .justify_between()
                                        .border_b_1()
                                        .border_color(palette.border)
                                        .child(git.as_ref().map_or_else(
                                            || "Git status not loaded".to_owned(),
                                            |git| {
                                                format!(
                                                    "Git {:?} · {}",
                                                    git.state,
                                                    git.branch
                                                        .as_deref()
                                                        .unwrap_or("detached")
                                                )
                                            },
                                        ))
                                        .child(
                                            div()
                                                .flex()
                                                .gap_2()
                                                .child(
                                                    div()
                                                .id("refresh-git")
                                                .role(gpui::Role::Button)
                                                .aria_label("Refresh Git status")
                                                .px_2()
                                                .py_1()
                                                .border_1()
                                                .border_color(palette.border)
                                                .cursor_pointer()
                                                .on_click(move |_, _, _| {
                                                    if let Some(sender) = git_sender.as_ref() {
                                                        let _ = sender.try_send(
                                                            WorkbenchCommand::RefreshGit,
                                                        );
                                                    }
                                                })
                                                .child("Refresh Git"),
                                                )
                                                .child(
                                                    div()
                                                        .id("refresh-git-diff")
                                                        .role(gpui::Role::Button)
                                                        .aria_label("Load uncommitted Git diff")
                                                        .px_2()
                                                        .py_1()
                                                        .border_1()
                                                        .border_color(palette.border)
                                                        .cursor_pointer()
                                                        .on_click(move |_, _, _| {
                                                            if let Some(sender) =
                                                                diff_sender.as_ref()
                                                            {
                                                                let _ = sender.try_send(
                                                                    WorkbenchCommand::RefreshGitDiff,
                                                                );
                                                            }
                                                        })
                                                        .child("Load diff"),
                                                ),
                                        ),
                                )
                                .child(
                                    div()
                                        .id("file-viewer")
                                        .aria_label("Read-only file content")
                                        .flex_1()
                                        .min_h_0()
                                        .overflow_scroll()
                                        .p_3()
                                        .text_sm()
                                        .whitespace_normal()
                                        .child(file.map_or_else(
                                            || "Select a file from the file tree.".to_owned(),
                                            |file| {
                                                format!(
                                                    "{}\n\n{}",
                                                    file.relative_path,
                                                    bounded_display(
                                                        &file.source_utf8,
                                                        512 * 1024
                                                    )
                                                )
                                            },
                                        ))
                                        .when_some(git_diff, |viewer, diff| {
                                            let preview = diff
                                                .sections
                                                .iter()
                                                .map(|section| {
                                                    format!(
                                                        "{}{}\n{}",
                                                        if section.staged {
                                                            "staged · "
                                                        } else {
                                                            "unstaged · "
                                                        },
                                                        section.path,
                                                        section.preview
                                                    )
                                                })
                                                .collect::<Vec<_>>()
                                                .join("\n\n");
                                            viewer.child(format!(
                                                "\n\nUncommitted diff · {:?}\n\n{}",
                                                diff.state,
                                                bounded_display(&preview, 512 * 1024)
                                            ))
                                        }),
                                )
                            })
                            .child({
                                let terminal_status = self
                                    .snapshot
                                    .as_ref()
                                    .map_or(TerminalPanelStatus::Inactive, |snapshot| {
                                        snapshot.terminal_status
                                    });
                                let terminal_rows = self
                                    .snapshot
                                    .as_ref()
                                    .and_then(|snapshot| snapshot.terminal.as_ref())
                                    .map_or_else(Vec::new, |terminal| {
                                        terminal.visible_rows.clone()
                                    });
                                let can_start = self
                                    .snapshot
                                    .as_ref()
                                    .is_some_and(|snapshot| snapshot.workspace_available)
                                    && matches!(
                                        terminal_status,
                                        TerminalPanelStatus::Inactive
                                            | TerminalPanelStatus::Closed
                                    );
                                let can_control = matches!(
                                    terminal_status,
                                    TerminalPanelStatus::Starting
                                        | TerminalPanelStatus::Running
                                );
                                div()
                                    .id("terminal-pane")
                                    .aria_label("User terminal")
                                    .track_focus(&self.terminal_focus)
                                    .h(px(220.0))
                                    .flex_none()
                                    .min_h_0()
                                    .flex()
                                    .flex_col()
                                    .bg(palette.surface)
                                    .child(
                                        div()
                                            .h(px(34.0))
                                            .flex_none()
                                            .flex()
                                            .items_center()
                                            .justify_between()
                                            .px_3()
                                            .bg(palette.raised)
                                            .border_b_1()
                                            .border_color(palette.border)
                                            .text_sm()
                                            .child(format!(
                                                "Terminal · {}",
                                                terminal_status_label(terminal_status)
                                            ))
                                            .child(
                                                div()
                                                    .flex()
                                                    .gap_2()
                                                    .child(
                                                        div()
                                                            .id("start-terminal")
                                                            .role(gpui::Role::Button)
                                                            .aria_label("Start or restart terminal")
                                                            .px_2()
                                                            .py_1()
                                                            .border_1()
                                                            .border_color(palette.border)
                                                            .when(can_start, |button| {
                                                                button
                                                                    .cursor_pointer()
                                                                    .on_click(cx.listener(
                                                                        Self::start_terminal,
                                                                    ))
                                                            })
                                                            .when(!can_start, |button| {
                                                                button.text_color(
                                                                    palette.muted_text,
                                                                )
                                                            })
                                                            .child("Start"),
                                                    )
                                                    .child(
                                                        div()
                                                            .id("interrupt-terminal")
                                                            .role(gpui::Role::Button)
                                                            .aria_label("Interrupt terminal command")
                                                            .px_2()
                                                            .py_1()
                                                            .border_1()
                                                            .border_color(palette.border)
                                                            .when(can_control, |button| {
                                                                button
                                                                    .cursor_pointer()
                                                                    .on_click(cx.listener(
                                                                        Self::interrupt_terminal,
                                                                    ))
                                                            })
                                                            .when(!can_control, |button| {
                                                                button.text_color(
                                                                    palette.muted_text,
                                                                )
                                                            })
                                                            .child("Interrupt"),
                                                    )
                                                    .child(
                                                        div()
                                                            .id("close-terminal")
                                                            .role(gpui::Role::Button)
                                                            .aria_label("Close terminal")
                                                            .px_2()
                                                            .py_1()
                                                            .border_1()
                                                            .border_color(palette.border)
                                                            .when(can_control, |button| {
                                                                button
                                                                    .cursor_pointer()
                                                                    .on_click(cx.listener(
                                                                        Self::close_terminal,
                                                                    ))
                                                            })
                                                            .when(!can_control, |button| {
                                                                button.text_color(
                                                                    palette.muted_text,
                                                                )
                                                            })
                                                            .child("Close"),
                                                    ),
                                            ),
                                    )
                                    .child(
                                        div()
                                            .id("terminal-output")
                                            .aria_label("Terminal output")
                                            .flex_1()
                                            .min_h_0()
                                            .overflow_scroll()
                                            .px_2()
                                            .py_1()
                                            .text_sm()
                                            .children(terminal_rows.into_iter().map(|row| {
                                                div().child(if row.is_empty() {
                                                    " ".to_owned()
                                                } else {
                                                    row
                                                })
                                            })),
                                    )
                                    .when(can_control, |terminal| {
                                        terminal.child(
                                            div()
                                                .h(px(38.0))
                                                .flex_none()
                                                .border_t_1()
                                                .border_color(palette.border)
                                                .child(self.terminal_composer.clone()),
                                        )
                                    })
                            }),
                    )
                    .child({
                        let directories = self
                            .snapshot
                            .as_ref()
                            .map_or_else(Vec::new, |snapshot| snapshot.directories.clone());
                        let entries = flatten_directory_entries(&directories);
                        let refresh_sender = self.command_sender.clone();
                        let mut files = pane_header(
                            if layout.file_tree_collapsed {
                                "F"
                            } else {
                                "Files"
                            },
                            "Workspace file tree",
                            palette,
                        )
                        .w(px(file_tree_width))
                        .track_focus(&self.files_focus)
                        .flex_none();
                        if !layout.file_tree_collapsed {
                            files = files.child(
                                div()
                                    .id("file-tree-list")
                                    .flex_1()
                                    .min_h_0()
                                    .overflow_scroll()
                                    .p_2()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(
                                        div()
                                            .id("refresh-files")
                                            .role(gpui::Role::Button)
                                            .aria_label("Refresh workspace files")
                                            .px_2()
                                            .py_1()
                                            .border_1()
                                            .border_color(palette.border)
                                            .cursor_pointer()
                                            .on_click(move |_, _, _| {
                                                if let Some(sender) = refresh_sender.as_ref() {
                                                    let _ = sender.try_send(
                                                        WorkbenchCommand::RefreshWorkspace,
                                                    );
                                                }
                                            })
                                            .child("Refresh"),
                                    )
                                    .children(entries.into_iter().map(|(entry, depth, expanded)| {
                                        let is_file = entry.kind
                                            == crate::app::workspace_inspection::TreeEntryKind::File;
                                        let is_directory = entry.kind
                                            == crate::app::workspace_inspection::TreeEntryKind::Directory;
                                        let sender = self.command_sender.clone();
                                        let path = entry.relative_path.clone();
                                        div()
                                            .id(entry.relative_path.clone())
                                            .role(gpui::Role::Button)
                                            .aria_label(format!(
                                                "{:?} {}",
                                                entry.kind, entry.display_name
                                            ))
                                            .px_2()
                                            .py_1()
                                            .rounded_sm()
                                            .pl(px(8.0 + depth as f32 * 14.0))
                                            .when(!is_file && !is_directory, |row| {
                                                row.text_color(palette.muted_text)
                                            })
                                            .when(is_file || is_directory, |row| {
                                                row.cursor_pointer().on_click(move |_, _, _| {
                                                    if let Some(sender) = sender.as_ref() {
                                                        let command = if is_file {
                                                            WorkbenchCommand::OpenFile {
                                                                relative_path: path.clone(),
                                                            }
                                                        } else {
                                                            WorkbenchCommand::ExpandDirectory {
                                                                relative_path: path.clone(),
                                                            }
                                                        };
                                                        let _ = sender.try_send(command);
                                                    }
                                                })
                                            })
                                            .child(format!(
                                                "{}{}",
                                                if is_file {
                                                    ""
                                                } else if expanded {
                                                    "▾ "
                                                } else {
                                                    "▸ "
                                                },
                                                entry.display_name
                                            ))
                                    })),
                            );
                        }
                        files
                    }),
            )
            .when(self.credential_dialog_open, |root| {
                root.child(
                    div()
                        .id("credential-dialog-backdrop")
                        .absolute()
                        .inset_0()
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(gpui::black().opacity(0.55))
                        .child(
                            div()
                                .id("credential-dialog")
                                .aria_label("DeepSeek credential settings")
                                .w(px(520.0))
                                .p_5()
                                .flex()
                                .flex_col()
                                .gap_3()
                                .rounded_md()
                                .border_1()
                                .border_color(palette.border)
                                .bg(palette.surface)
                                .child(
                                    div()
                                        .text_lg()
                                        .child("DeepSeek credential"),
                                )
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(palette.muted_text)
                                        .child(
                                            "The key is validated and stored in macOS Keychain. It is never written to workbench preferences.",
                                        ),
                                )
                                .child(
                                    div()
                                        .border_1()
                                        .border_color(palette.border)
                                        .rounded_sm()
                                        .child(self.credential_input.clone()),
                                )
                                .when_some(self.credential_error, |dialog, error| {
                                    dialog.child(
                                        div()
                                            .id("credential-error")
                                            .aria_label(error)
                                            .text_sm()
                                            .text_color(palette.warning)
                                            .child(error),
                                    )
                                })
                                .when(self.credential_operation_active, |dialog| {
                                    dialog.child(
                                        div()
                                            .id("credential-validation-status")
                                            .aria_label("Credential validation in progress")
                                            .text_sm()
                                            .text_color(palette.muted_text)
                                            .child("Validating credential…"),
                                    )
                                })
                                .child(
                                    div()
                                        .flex()
                                        .justify_between()
                                        .child(
                                            div()
                                                .id("remove-credential")
                                                .role(gpui::Role::Button)
                                                .aria_label("Remove stored DeepSeek credential")
                                                .px_3()
                                                .py_2()
                                                .rounded_sm()
                                                .border_1()
                                                .border_color(palette.border)
                                                .when(!self.credential_operation_active, |button| {
                                                    button
                                                        .cursor_pointer()
                                                        .on_click(cx.listener(Self::remove_credential))
                                                })
                                                .child("Remove stored key"),
                                        )
                                        .child(
                                            div()
                                                .flex()
                                                .gap_2()
                                                .child(
                                                    div()
                                                        .id("dismiss-credential-dialog")
                                                        .role(gpui::Role::Button)
                                                        .aria_label("Cancel credential changes")
                                                        .px_3()
                                                        .py_2()
                                                        .rounded_sm()
                                                        .border_1()
                                                        .border_color(palette.border)
                                                        .when(
                                                            !self.credential_operation_active,
                                                            |button| {
                                                                button.cursor_pointer().on_click(
                                                                    cx.listener(Self::dismiss_credential_dialog),
                                                                )
                                                            },
                                                        )
                                                        .child("Cancel"),
                                                )
                                                .child(
                                                    div()
                                                        .id("validate-credential")
                                                        .role(gpui::Role::Button)
                                                        .aria_label("Validate and save DeepSeek credential")
                                                        .px_3()
                                                        .py_2()
                                                        .rounded_sm()
                                                        .bg(palette.focus)
                                                        .text_color(palette.background)
                                                        .when(
                                                            !self.credential_operation_active,
                                                            |button| {
                                                                button.cursor_pointer().on_click(
                                                                    cx.listener(Self::submit_credential),
                                                                )
                                                            },
                                                        )
                                                        .child("Validate and save"),
                                                ),
                                        ),
                                ),
                        ),
                )
            })
    }
}

fn pane_header(
    title: &'static str,
    accessible_label: &'static str,
    palette: SemanticPalette,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(title)
        .aria_label(accessible_label)
        .min_h_0()
        .flex()
        .flex_col()
        .bg(palette.surface)
        .child(
            div()
                .h(px(34.0))
                .flex_none()
                .flex()
                .items_center()
                .px_3()
                .bg(palette.raised)
                .border_b_1()
                .border_color(palette.border)
                .text_sm()
                .child(title),
        )
}

fn terminal_status_label(status: TerminalPanelStatus) -> &'static str {
    match status {
        TerminalPanelStatus::Inactive => "not started",
        TerminalPanelStatus::Starting => "starting",
        TerminalPanelStatus::Running => "running",
        TerminalPanelStatus::Exited => "exited",
        TerminalPanelStatus::Closing => "closing",
        TerminalPanelStatus::Closed => "closed",
        TerminalPanelStatus::Failed => "failed",
        TerminalPanelStatus::Uncertain => "cleanup uncertain",
    }
}

fn flatten_directory_entries(
    directories: &[crate::app::workspace_inspection::DirectorySnapshot],
) -> Vec<(crate::app::workspace_inspection::TreeEntry, usize, bool)> {
    fn append(
        relative_directory: &str,
        depth: usize,
        directories: &[crate::app::workspace_inspection::DirectorySnapshot],
        rows: &mut Vec<(crate::app::workspace_inspection::TreeEntry, usize, bool)>,
    ) {
        let Some(directory) = directories
            .iter()
            .find(|directory| directory.relative_directory == relative_directory)
        else {
            return;
        };
        for entry in &directory.entries {
            let expanded = entry.kind == crate::app::workspace_inspection::TreeEntryKind::Directory
                && directories
                    .iter()
                    .any(|directory| directory.relative_directory == entry.relative_path);
            rows.push((entry.clone(), depth, expanded));
            if expanded {
                append(
                    &entry.relative_path,
                    depth.saturating_add(1),
                    directories,
                    rows,
                );
            }
        }
    }

    let mut rows = Vec::new();
    append(".", 0, directories, &mut rows);
    rows
}

fn render_backend_message(
    message: crate::backend::BackendMessage,
    palette: SemanticPalette,
) -> Option<gpui::Stateful<gpui::Div>> {
    match message {
        crate::backend::BackendMessage::User(message) => Some(transcript_bubble(
            format!("user-{}", message.item_id),
            "You",
            message.text,
            palette,
            true,
        )),
        crate::backend::BackendMessage::Assistant(phase) => {
            phase.text.filter(|text| !text.is_empty()).map(|text| {
                transcript_bubble(
                    format!("assistant-{}", phase.item_id),
                    "Assistant",
                    safe_markdown_source(&text, true),
                    palette,
                    false,
                )
            })
        }
        crate::backend::BackendMessage::Tool(result) => Some(transcript_bubble(
            format!("tool-{}", result.tool_call_id),
            "Tool result",
            bounded_display(&result.output, 16 * 1024),
            palette,
            false,
        )),
    }
}

fn transcript_bubble(
    id: String,
    label: &'static str,
    text: String,
    palette: SemanticPalette,
    user: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .aria_label(label)
        .p_3()
        .flex()
        .flex_col()
        .gap_2()
        .rounded_md()
        .border_1()
        .border_color(palette.border)
        .when(user, |bubble| bubble.bg(palette.raised))
        .child(div().text_sm().text_color(palette.muted_text).child(label))
        .child(div().text_sm().whitespace_normal().child(text))
}

fn safe_markdown_source(source: &str, complete: bool) -> String {
    // GPUI receives plain text only. Parsing first applies the bounded inert-content policy and
    // preserves the exact source for literal TeX and every malformed/unsupported construct.
    let document = MarkdownDocument::parse(source, complete);
    bounded_display(document.source(), MAX_MARKDOWN_SOURCE_BYTES)
}

fn bounded_display(value: &str, maximum_bytes: usize) -> String {
    if value.len() <= maximum_bytes {
        return value.to_owned();
    }
    let mut end = maximum_bytes.min(value.len());
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_profiles_keep_text_and_background_distinct() {
        for theme in [
            ThemePreference::System,
            ThemePreference::Light,
            ThemePreference::Dark,
            ThemePreference::HighContrast,
        ] {
            let palette = SemanticPalette::for_theme(theme);
            assert_ne!(palette.text, palette.background);
            assert_ne!(palette.focus, palette.background);
        }
        assert_eq!(
            SemanticPalette::for_window(ThemePreference::System, WindowAppearance::Dark),
            SemanticPalette::for_theme(ThemePreference::Dark)
        );
        assert_eq!(
            SemanticPalette::for_window(ThemePreference::System, WindowAppearance::Light),
            SemanticPalette::for_theme(ThemePreference::Light)
        );
    }

    #[test]
    fn window_and_pane_minima_are_explicit() {
        const {
            assert!(DEFAULT_WINDOW_WIDTH >= MINIMUM_WINDOW_WIDTH);
            assert!(DEFAULT_WINDOW_HEIGHT >= MINIMUM_WINDOW_HEIGHT);
            assert!(NAVIGATION_PREFERRED_WIDTH < MINIMUM_WINDOW_WIDTH);
            assert!(FILE_TREE_PREFERRED_WIDTH < MINIMUM_WINDOW_WIDTH);
        }
    }

    #[test]
    fn layout_collapses_file_tree_before_navigation() {
        assert_eq!(
            layout_for_width(DEFAULT_WINDOW_WIDTH),
            LayoutDecision {
                navigation_collapsed: false,
                file_tree_collapsed: false,
            }
        );
        assert_eq!(
            layout_for_width(MINIMUM_WINDOW_WIDTH),
            LayoutDecision {
                navigation_collapsed: false,
                file_tree_collapsed: true,
            }
        );
        assert_eq!(
            layout_for_width(NAVIGATION_COLLAPSE_WIDTH - 1.0),
            LayoutDecision {
                navigation_collapsed: true,
                file_tree_collapsed: true,
            }
        );
    }
}
