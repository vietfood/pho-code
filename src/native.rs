#[cfg(target_os = "macos")]
mod macos {
    use std::rc::Rc;
    use std::sync::{Arc, Mutex, RwLock};
    use std::time::Duration;

    use gpui::{
        AnyWindowHandle, App, AppContext as _, BorrowAppContext as _, Bounds, Global, KeyBinding,
        Menu, MenuItem, WindowBounds, WindowOptions, point, px, size,
    };

    use crate::agent::types::TurnId;
    use crate::app::action::RuntimeEvent;
    use crate::app::runtime::AppRuntime;
    use crate::app::services::{ApplicationPaths, ApplicationServicesFactory, ServiceFactoryError};
    use crate::app::window_geometry::{VisibleScreen, WindowSize, restore_window_frame};
    use crate::app::workbench_controller::{
        NATIVE_APPROVAL_CAPACITY, NATIVE_CANCELLATION_CAPACITY, NATIVE_COMMAND_CAPACITY,
        NATIVE_EVENT_CAPACITY, WorkbenchCommand, WorkbenchController, WorkbenchControllerEvent,
        resolve_approval,
    };
    use crate::app::workbench_lifecycle::{
        NativeStartupState, StartupEvent, StartupFailure, WorkbenchStartupProjection,
        reduce_startup,
    };
    use crate::app::workbench_preferences::{
        ThemePreference, WindowFrame, WorkbenchPreferencesStore,
    };
    use crate::tools::ApprovalResponse;
    use crate::tools::approval::InteractiveApprovalPolicy;
    use crate::ui::composer::{
        Backspace as ComposerBackspace, Composer, Delete as ComposerDelete, End as ComposerEnd,
        Home as ComposerHome, Left as ComposerLeft, Newline as ComposerNewline,
        Paste as ComposerPaste, Right as ComposerRight, Submit as ComposerSubmit,
    };
    use crate::ui::secure_input::{Backspace, Delete, End, Home, Left, Paste, Right, SecureInput};
    use crate::ui::startup::{
        DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH, FocusChat, FocusFiles, FocusInspection,
        FocusNavigation, MINIMUM_WINDOW_HEIGHT, MINIMUM_WINDOW_WIDTH, OpenCredentialSettings,
        RetryStartupAction, StartupView, ToggleTerminalSurface,
    };
    use tokio::sync::{mpsc, watch};
    use tokio_util::sync::CancellationToken;

    gpui::actions!(pho_native, [Quit]);

    struct ActiveNativeApplication {
        command_cancellation: CancellationToken,
        command_tasks: Vec<tokio::task::JoinHandle<()>>,
        window_frame: watch::Sender<Option<WindowFrame>>,
        runtime: Option<AppRuntime>,
    }

    struct NativeApplicationOwner {
        active: Option<ActiveNativeApplication>,
    }

    struct NativeWindowOwner {
        application: NativeApplicationOwner,
        root: Option<gpui::WeakEntity<StartupView>>,
        window: Option<AnyWindowHandle>,
        shutdown_started: bool,
    }

    impl Global for NativeWindowOwner {}

    impl ActiveNativeApplication {
        fn shutdown(mut self) {
            self.command_cancellation.cancel();
            if let Some(runtime) = self.runtime.as_ref() {
                for task in self.command_tasks.drain(..) {
                    let _ = runtime.handle().block_on(async {
                        tokio::time::timeout(Duration::from_secs(2), task).await
                    });
                }
            }
            self.runtime.take();
        }
    }

    impl NativeApplicationOwner {
        fn remember_window_frame(&mut self, frame: WindowFrame) {
            let Some(active) = self.active.as_mut() else {
                return;
            };
            let _ = active.window_frame.send(Some(frame));
        }

        fn install(&mut self, active: ActiveNativeApplication) {
            if self.active.is_none() {
                self.active = Some(active);
            }
        }

        fn shutdown(&mut self) {
            if let Some(active) = self.active.take() {
                active.shutdown();
            }
        }
    }

    struct Bootstrap {
        projection: WorkbenchStartupProjection,
        theme: ThemePreference,
        window_frame: Option<WindowFrame>,
        retry_paths: Option<ApplicationPaths>,
        workbench_sender: Option<mpsc::Sender<WorkbenchCommand>>,
        workbench_events: Option<mpsc::Receiver<WorkbenchControllerEvent>>,
        cancellation_sender: Option<mpsc::Sender<TurnId>>,
        approval_sender: Option<mpsc::Sender<ApprovalResponse>>,
        owner: Option<ActiveNativeApplication>,
    }

    pub fn run() -> i32 {
        if std::env::args_os().len() != 1 {
            eprintln!("pho-native: launch arguments are not supported");
            return 2;
        }
        let application = gpui_platform::application();
        application.run(|cx| {
            crate::ui::fonts::register_packaged_fonts(cx);
            cx.activate(true);
            cx.on_action(request_quit);
            cx.bind_keys([
                KeyBinding::new("cmd-q", Quit, None),
                KeyBinding::new("cmd-1", FocusNavigation, None),
                KeyBinding::new("cmd-2", FocusChat, None),
                KeyBinding::new("cmd-3", FocusInspection, None),
                KeyBinding::new("cmd-4", FocusFiles, None),
                KeyBinding::new("ctrl-`", ToggleTerminalSurface, None),
                KeyBinding::new("cmd-,", OpenCredentialSettings, None),
                KeyBinding::new("backspace", Backspace, Some("SecureInput")),
                KeyBinding::new("delete", Delete, Some("SecureInput")),
                KeyBinding::new("left", Left, Some("SecureInput")),
                KeyBinding::new("right", Right, Some("SecureInput")),
                KeyBinding::new("home", Home, Some("SecureInput")),
                KeyBinding::new("end", End, Some("SecureInput")),
                KeyBinding::new("cmd-v", Paste, Some("SecureInput")),
                KeyBinding::new("ctrl-v", Paste, Some("SecureInput")),
                KeyBinding::new("backspace", ComposerBackspace, Some("ComposerInput")),
                KeyBinding::new("delete", ComposerDelete, Some("ComposerInput")),
                KeyBinding::new("left", ComposerLeft, Some("ComposerInput")),
                KeyBinding::new("right", ComposerRight, Some("ComposerInput")),
                KeyBinding::new("home", ComposerHome, Some("ComposerInput")),
                KeyBinding::new("end", ComposerEnd, Some("ComposerInput")),
                KeyBinding::new("enter", ComposerSubmit, Some("ComposerInput")),
                KeyBinding::new("shift-enter", ComposerNewline, Some("ComposerInput")),
                KeyBinding::new("cmd-v", ComposerPaste, Some("ComposerInput")),
                KeyBinding::new("ctrl-v", ComposerPaste, Some("ComposerInput")),
            ]);
            cx.set_menus([Menu::new("Pho Code").items([MenuItem::action("Quit Pho Code", Quit)])]);
            cx.set_global(NativeWindowOwner {
                application: NativeApplicationOwner { active: None },
                root: None,
                window: None,
                shutdown_started: false,
            });
            std::mem::forget(cx.on_app_quit(|cx| {
                let mut owner = cx.remove_global::<NativeWindowOwner>();
                async move {
                    owner.application.shutdown();
                }
            }));
            std::mem::forget(cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            }));
            let executor = cx.background_executor().clone();
            cx.spawn(async move |cx| {
                let bootstrap = executor.spawn(async move { bootstrap() }).await;
                cx.update(move |cx| open_native_window(bootstrap, cx))
            })
            .detach();
        });
        0
    }

    fn open_native_window(mut bootstrap: Bootstrap, cx: &mut App) {
        let restored_frame = restored_window_frame(bootstrap.window_frame, cx);
        let retry_action = bootstrap.retry_paths.clone().map(native_retry_action);
        let workbench_sender = bootstrap.workbench_sender.take();
        let workbench_events = bootstrap.workbench_events.take();
        let cancellation_sender = bootstrap.cancellation_sender.take();
        let approval_sender = bootstrap.approval_sender.take();
        let bounds = Bounds::new(
            point(px(restored_frame.x as f32), px(restored_frame.y as f32)),
            size(
                px(restored_frame.width as f32),
                px(restored_frame.height as f32),
            ),
        );
        let opened = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                window_min_size: Some(size(px(MINIMUM_WINDOW_WIDTH), px(MINIMUM_WINDOW_HEIGHT))),
                app_id: Some("com.pho-code.native".into()),
                ..Default::default()
            },
            |window, cx| {
                window.set_window_title("Pho Code");
                window.on_window_should_close(cx, |_, cx| {
                    begin_shutdown(cx);
                    false
                });
                let credential_input = cx.new(SecureInput::new);
                let composer = cx.new(Composer::new);
                let terminal_composer = cx.new(Composer::terminal);
                let view = cx.new(|cx| {
                    StartupView::new(
                        bootstrap.projection,
                        bootstrap.theme,
                        retry_action,
                        credential_input,
                        composer,
                        terminal_composer,
                        cx,
                    )
                });
                view.update(cx, |_, cx| {
                    cx.observe_window_bounds(window, |_, window, cx| {
                        let frame = frame_from_window(window);
                        cx.update_global::<NativeWindowOwner, _>(|owner, _| {
                            owner.application.remember_window_frame(frame);
                        });
                    })
                    .detach();
                });
                if let (Some(sender), Some(events), Some(cancellations), Some(approvals)) = (
                    workbench_sender,
                    workbench_events,
                    cancellation_sender,
                    approval_sender,
                ) {
                    view.update(cx, |view, cx| {
                        view.attach_workbench_runtime(sender, events, cancellations, approvals, cx);
                    });
                }
                view
            },
        );
        match opened {
            Ok(window) => {
                let root = window.entity(cx).ok().map(|root| root.downgrade());
                cx.update_global::<NativeWindowOwner, _>(|owner, _| {
                    owner.application.active = bootstrap.owner;
                    owner.root = root;
                    owner.window = Some(window.into());
                });
            }
            Err(_) => {
                if let Some(active) = bootstrap.owner {
                    active.shutdown();
                }
                cx.quit();
            }
        }
    }

    fn request_quit(_: &Quit, cx: &mut App) {
        begin_shutdown(cx);
    }

    fn begin_shutdown(cx: &mut App) {
        let mut owner = cx.remove_global::<NativeWindowOwner>();
        if owner.shutdown_started {
            cx.set_global(owner);
            return;
        }
        owner.shutdown_started = true;
        let root = owner.root.clone();
        let window = owner.window;
        let generation = root
            .as_ref()
            .and_then(|root| root.update(cx, |view, cx| view.begin_shutdown(cx)).ok())
            .flatten();
        let active = owner.application.active.take();
        cx.set_global(owner);
        let executor = cx.background_executor().clone();
        cx.spawn(async move |cx| {
            executor
                .spawn(async move {
                    if let Some(active) = active {
                        active.shutdown();
                    }
                })
                .await;
            cx.update(move |cx| {
                if let (Some(root), Some(generation)) = (root, generation) {
                    let _ = root.update(cx, |view, cx| {
                        view.complete_shutdown(generation, cx);
                    });
                }
                if let Some(window) = window {
                    let _ = window.update(cx, |_, window, _| window.remove_window());
                }
                cx.quit();
            })
        })
        .detach();
    }

    fn bootstrap() -> Bootstrap {
        let mut projection = WorkbenchStartupProjection::new(128);
        let _ = reduce_startup(&mut projection, StartupEvent::Begin);
        let paths = match ApplicationPaths::from_home() {
            Ok(paths) => paths,
            Err(_) => return failed(projection, StartupFailure::ApplicationRoot),
        };
        bootstrap_with_paths(projection, paths)
    }

    fn bootstrap_with_paths(
        mut projection: WorkbenchStartupProjection,
        paths: ApplicationPaths,
    ) -> Bootstrap {
        let factory = match ApplicationServicesFactory::production(paths.clone()) {
            Ok(factory) => factory,
            Err(_) => return failed(projection, StartupFailure::Services),
        };
        let locked = match factory.acquire() {
            Ok(locked) => {
                let generation = projection.generation;
                let _ = reduce_startup(&mut projection, StartupEvent::LockAcquired { generation });
                locked
            }
            Err(ServiceFactoryError::LockUnavailable) => {
                let generation = projection.generation;
                let _ = reduce_startup(&mut projection, StartupEvent::LockContended { generation });
                return Bootstrap {
                    projection,
                    theme: ThemePreference::Dark,
                    window_frame: None,
                    retry_paths: Some(paths),
                    workbench_sender: None,
                    workbench_events: None,
                    cancellation_sender: None,
                    approval_sender: None,
                    owner: None,
                };
            }
            Err(_) => return failed(projection, StartupFailure::Services),
        };

        let mut preferences =
            match WorkbenchPreferencesStore::load(locked.paths().workbench_preferences_path()) {
                Ok(preferences) => preferences,
                Err(_) => return failed(projection, StartupFailure::Preferences),
            };
        let theme = preferences.preferences().theme;
        let window_frame = preferences.preferences().window_frame;
        if !preferences.overwrite_blocked() {
            preferences.preferences_mut().clean_shutdown = false;
            if preferences.save().is_err() {
                return failed(projection, StartupFailure::Preferences);
            }
        }
        let generation = projection.generation;
        let _ = reduce_startup(
            &mut projection,
            StartupEvent::PreferencesLoaded {
                generation,
                recovery_diagnostic: preferences.diagnostic().is_some(),
            },
        );

        let local = match locked.open_local() {
            Ok(local) => local,
            Err(_) => return failed(projection, StartupFailure::Sessions),
        };
        if local.sessions().list().is_err() {
            return failed(projection, StartupFailure::Sessions);
        }
        let _ = reduce_startup(
            &mut projection,
            StartupEvent::SessionsScanned { generation },
        );

        let runtime = match AppRuntime::new() {
            Ok(runtime) => runtime,
            Err(_) => return failed(projection, StartupFailure::Services),
        };
        let services = match local.activate() {
            Ok(services) => Arc::new(services),
            Err(_) => return failed(projection, StartupFailure::Credentials),
        };
        let controller = runtime
            .handle()
            .block_on(WorkbenchController::restore(services, preferences));
        let snapshot = controller.snapshot();
        let _ = reduce_startup(
            &mut projection,
            StartupEvent::CredentialsInspected {
                generation,
                state: snapshot.credentials,
            },
        );
        let agent_context_ready =
            snapshot.selected_session_id.is_some() && snapshot.workspace_available;
        let command_runtime = start_command_runtime(&runtime, controller, window_frame);
        let _ = reduce_startup(
            &mut projection,
            StartupEvent::SelectionRestored {
                generation,
                local_inspection_ready: true,
                agent_context_ready,
            },
        );
        Bootstrap {
            projection,
            theme,
            window_frame,
            retry_paths: None,
            workbench_sender: Some(command_runtime.sender),
            workbench_events: Some(command_runtime.events),
            cancellation_sender: Some(command_runtime.cancellations),
            approval_sender: Some(command_runtime.approvals),
            owner: Some(ActiveNativeApplication {
                command_cancellation: command_runtime.cancellation,
                command_tasks: command_runtime.tasks,
                window_frame: command_runtime.window_frame,
                runtime: Some(runtime),
            }),
        }
    }

    fn failed(mut projection: WorkbenchStartupProjection, failure: StartupFailure) -> Bootstrap {
        let generation = projection.generation;
        let _ = reduce_startup(
            &mut projection,
            StartupEvent::Failed {
                generation,
                failure,
            },
        );
        if projection.state != NativeStartupState::Failed {
            projection.state = NativeStartupState::Failed;
            projection.failure = Some(failure);
        }
        Bootstrap {
            projection,
            theme: ThemePreference::Dark,
            window_frame: None,
            retry_paths: None,
            workbench_sender: None,
            workbench_events: None,
            cancellation_sender: None,
            approval_sender: None,
            owner: None,
        }
    }

    fn native_retry_action(paths: ApplicationPaths) -> RetryStartupAction {
        Rc::new(move |projection, view, window, cx| {
            let paths = paths.clone();
            let current_frame = frame_from_window(window);
            let executor = cx.background_executor().clone();
            cx.spawn(async move |_, cx| {
                let mut bootstrap = executor
                    .spawn(async move { bootstrap_with_paths(projection, paths) })
                    .await;
                view.update(cx, |view, cx| {
                    if let Some(active) = bootstrap.owner.take() {
                        let _ = active.window_frame.send(Some(current_frame));
                        cx.update_global::<NativeWindowOwner, _>(|owner, _| {
                            owner.application.install(active);
                        });
                    }
                    view.replace_startup(bootstrap.projection, bootstrap.theme, cx);
                    if let (Some(sender), Some(events), Some(cancellations), Some(approvals)) = (
                        bootstrap.workbench_sender.take(),
                        bootstrap.workbench_events.take(),
                        bootstrap.cancellation_sender.take(),
                        bootstrap.approval_sender.take(),
                    ) {
                        view.attach_workbench_runtime(sender, events, cancellations, approvals, cx);
                    }
                })
                .ok();
            })
            .detach();
        })
    }

    struct CommandRuntime {
        sender: mpsc::Sender<WorkbenchCommand>,
        events: mpsc::Receiver<WorkbenchControllerEvent>,
        cancellations: mpsc::Sender<TurnId>,
        approvals: mpsc::Sender<ApprovalResponse>,
        window_frame: watch::Sender<Option<WindowFrame>>,
        cancellation: CancellationToken,
        tasks: Vec<tokio::task::JoinHandle<()>>,
    }

    fn start_command_runtime(
        runtime: &AppRuntime,
        mut controller: WorkbenchController,
        initial_frame: Option<WindowFrame>,
    ) -> CommandRuntime {
        let (sender, mut commands) = mpsc::channel(NATIVE_COMMAND_CAPACITY);
        let (event_sender, events) = mpsc::channel(NATIVE_EVENT_CAPACITY);
        let (cancellation_sender, mut cancellation_requests) =
            mpsc::channel(NATIVE_CANCELLATION_CAPACITY);
        let (approval_sender, mut approval_responses) = mpsc::channel(NATIVE_APPROVAL_CAPACITY);
        let (window_frame, window_frames) = watch::channel(initial_frame);
        let cancellation = CancellationToken::new();
        let active_turn: Arc<Mutex<Option<(TurnId, CancellationToken)>>> =
            Arc::new(Mutex::new(None));
        let approval_policy: Arc<RwLock<Option<Arc<InteractiveApprovalPolicy>>>> =
            Arc::new(RwLock::new(controller.approval_policy()));

        let command_cancellation = cancellation.clone();
        let command_active_turn = active_turn.clone();
        let command_approval_policy = approval_policy.clone();
        let approval_event_sender = event_sender.clone();
        let task = runtime.handle().spawn(async move {
            let mut terminal_poll = tokio::time::interval(Duration::from_millis(50));
            terminal_poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            let _ = event_sender
                .send(WorkbenchControllerEvent::Snapshot(Box::new(
                    controller.snapshot(),
                )))
                .await;
            loop {
                let command = tokio::select! {
                    _ = command_cancellation.cancelled() => break,
                    _ = terminal_poll.tick() => {
                        if controller.poll_terminal()
                            && event_sender
                                .send(WorkbenchControllerEvent::Snapshot(Box::new(
                                    controller.snapshot(),
                                )))
                                .await
                                .is_err()
                        {
                            break;
                        }
                        continue;
                    }
                    command = commands.recv() => match command {
                        Some(command) => command,
                        None => break,
                    },
                };
                let operation_cancellation = command_cancellation.child_token();
                let sink_cancellation = operation_cancellation.clone();
                controller
                    .dispatch(command, operation_cancellation, |event| {
                        if let WorkbenchControllerEvent::Runtime(RuntimeEvent::TurnPrepared {
                            turn_id,
                        }) = &event
                        {
                            if let Ok(mut active) = command_active_turn.lock() {
                                *active = Some((*turn_id, sink_cancellation.clone()));
                            }
                        } else if let WorkbenchControllerEvent::Runtime(
                            RuntimeEvent::TurnCompleted { turn_id }
                            | RuntimeEvent::TurnFailed { turn_id, .. }
                            | RuntimeEvent::TurnCancelled { turn_id }
                            | RuntimeEvent::TurnInterrupted { turn_id }
                            | RuntimeEvent::TurnUncertain { turn_id },
                        ) = &event
                            && let Ok(mut active) = command_active_turn.lock()
                            && active
                                .as_ref()
                                .is_some_and(|(active_turn, _)| active_turn == turn_id)
                        {
                            active.take();
                        }
                        if event_sender.try_send(event).is_err() {
                            sink_cancellation.cancel();
                        }
                    })
                    .await;
                if let Ok(mut active) = command_active_turn.lock() {
                    active.take();
                }
                if let Ok(mut policy) = command_approval_policy.write() {
                    *policy = controller.approval_policy();
                }
            }
            if let Ok(mut active) = command_active_turn.lock()
                && let Some((_, token)) = active.take()
            {
                token.cancel();
            }
            let final_window_frame = *window_frames.borrow();
            controller.shutdown(final_window_frame).await;
        });

        let cancellation_task_cancellation = cancellation.clone();
        let cancellation_active_turn = active_turn.clone();
        let cancellation_task = runtime.handle().spawn(async move {
            loop {
                let turn_id = tokio::select! {
                    _ = cancellation_task_cancellation.cancelled() => break,
                    request = cancellation_requests.recv() => match request {
                        Some(request) => request,
                        None => break,
                    },
                };
                if let Ok(active) = cancellation_active_turn.lock()
                    && let Some((active_turn, token)) = active.as_ref()
                    && *active_turn == turn_id
                {
                    token.cancel();
                }
            }
        });

        let approval_task_cancellation = cancellation.clone();
        let approval_task_policy = approval_policy;
        let approval_task = runtime.handle().spawn(async move {
            loop {
                let response = tokio::select! {
                    _ = approval_task_cancellation.cancelled() => break,
                    response = approval_responses.recv() => match response {
                        Some(response) => response,
                        None => break,
                    },
                };
                let policy = approval_task_policy
                    .read()
                    .ok()
                    .and_then(|policy| policy.clone());
                if let Err(code) = resolve_approval(policy, response).await {
                    let _ = approval_event_sender
                        .send(WorkbenchControllerEvent::CommandFinished {
                            kind: crate::app::workbench_controller::WorkbenchCommandKind::Turn,
                            succeeded: false,
                            code: Some(code),
                        })
                        .await;
                }
            }
        });
        CommandRuntime {
            sender,
            events,
            cancellations: cancellation_sender,
            approvals: approval_sender,
            window_frame,
            cancellation,
            tasks: vec![task, cancellation_task, approval_task],
        }
    }

    fn frame_from_window(window: &gpui::Window) -> WindowFrame {
        let bounds = window.bounds();
        WindowFrame {
            x: f64::from(bounds.origin.x.as_f32()),
            y: f64::from(bounds.origin.y.as_f32()),
            width: f64::from(bounds.size.width.as_f32()),
            height: f64::from(bounds.size.height.as_f32()),
        }
    }

    fn restored_window_frame(frame: Option<WindowFrame>, cx: &App) -> WindowFrame {
        let screens: Vec<_> = cx
            .displays()
            .into_iter()
            .map(|display| {
                let bounds = display.visible_bounds();
                VisibleScreen {
                    x: f64::from(bounds.origin.x.as_f32()),
                    y: f64::from(bounds.origin.y.as_f32()),
                    width: f64::from(bounds.size.width.as_f32()),
                    height: f64::from(bounds.size.height.as_f32()),
                }
            })
            .collect();
        restore_window_frame(
            frame,
            &screens,
            WindowSize {
                width: f64::from(MINIMUM_WINDOW_WIDTH),
                height: f64::from(MINIMUM_WINDOW_HEIGHT),
            },
            WindowSize {
                width: f64::from(DEFAULT_WINDOW_WIDTH),
                height: f64::from(DEFAULT_WINDOW_HEIGHT),
            },
        )
        .frame
    }
}

#[cfg(target_os = "macos")]
pub use macos::run;

#[cfg(not(target_os = "macos"))]
pub fn run() -> i32 {
    eprintln!("pho-native: the native workbench is supported only on macOS");
    1
}
