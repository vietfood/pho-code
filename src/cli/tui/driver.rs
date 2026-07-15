use std::cell::{Cell, RefCell};
use std::io;
use std::time::Duration;

use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers};
use futures_util::StreamExt as _;
use tokio_util::sync::CancellationToken;

use crate::app::action::Intent;
use crate::app::runtime::{ApplicationCoordinator, CoordinatorError};
use crate::auth::CredentialState;

use super::input::EditOutcome;
use super::session::TerminalSession;
use super::{ActivityView, NoticeSeverity, TerminalViewModel};

const REDRAW_INTERVAL: Duration = Duration::from_millis(16);
const PRESENTATION_CANCELLATION_TIMEOUT: Duration = Duration::from_secs(5);
const SCROLL_PAGE_ROWS: u16 = 6;

#[derive(Debug)]
pub(crate) enum TuiError {
    TerminalUnavailable,
    MissingCredential,
    Cancelled,
    Runtime,
}

pub(crate) async fn run(mut application: ApplicationCoordinator) -> Result<(), TuiError> {
    let mut terminal = TerminalSession::enter().map_err(classify_terminal_error)?;
    let mut events = EventStream::new();
    let mut model = TerminalViewModel::new();
    terminal.draw(&model).map_err(|_| TuiError::Cancelled)?;

    let mut interrupts = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())
        .map_err(|_| TuiError::Runtime)?;

    loop {
        let event = tokio::select! {
            biased;
            _ = interrupts.recv() => return Err(TuiError::Cancelled),
            event = events.next() => event,
        };
        let Some(event) = event else {
            return Err(TuiError::Cancelled);
        };
        let event = event.map_err(|_| TuiError::Cancelled)?;
        match event {
            Event::Key(key) => match model.composer.handle_key(key) {
                EditOutcome::Submit(prompt) => {
                    model.begin_turn(prompt.clone());
                    terminal.draw(&model).map_err(|_| TuiError::Cancelled)?;
                    let outcome = run_turn(
                        &mut application,
                        prompt,
                        &mut terminal,
                        &mut events,
                        &mut model,
                        &mut interrupts,
                    )
                    .await?;
                    if outcome == TurnOutcome::ExternalInterrupt {
                        return Err(TuiError::Cancelled);
                    }
                    if application.state.credentials != CredentialState::Ready {
                        return Err(TuiError::MissingCredential);
                    }
                }
                EditOutcome::ToggleReasoning => model.toggle_reasoning(),
                EditOutcome::ScrollUp => model.scroll_up(SCROLL_PAGE_ROWS),
                EditOutcome::ScrollDown => model.scroll_down(SCROLL_PAGE_ROWS),
                EditOutcome::RejectedLimit => model.notice(
                    "Prompt limit",
                    "input is limited to 256 KiB",
                    NoticeSeverity::Warning,
                ),
                EditOutcome::Exit => {
                    terminal.restore().map_err(|_| TuiError::Runtime)?;
                    if cfg!(debug_assertions)
                        && std::env::var_os("PHO_CODE_TEST_TUI_RESTORE_READY").is_some()
                    {
                        eprintln!("pho-test-tui-restored");
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                    return Ok(());
                }
                EditOutcome::Changed | EditOutcome::Clear | EditOutcome::Ignored => {}
            },
            Event::Paste(value) if model.composer.paste(&value) == EditOutcome::RejectedLimit => {
                model.notice(
                    "Prompt limit",
                    "paste rejected; input is limited to 256 KiB",
                    NoticeSeverity::Warning,
                );
            }
            Event::Paste(_) => {}
            Event::Resize(_, _) => {}
            _ => {}
        }
        terminal.draw(&model).map_err(|_| TuiError::Cancelled)?;
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TurnOutcome {
    Finished,
    ExternalInterrupt,
}

async fn run_turn(
    application: &mut ApplicationCoordinator,
    prompt: String,
    terminal: &mut TerminalSession,
    events: &mut EventStream,
    model: &mut TerminalViewModel,
    interrupts: &mut tokio::signal::unix::Signal,
) -> Result<TurnOutcome, TuiError> {
    let cancellation = CancellationToken::new();
    let view = RefCell::new(model);
    let dirty = Cell::new(false);
    let dispatch = application.dispatch_cancellable(
        Intent::SendEphemeralPrompt { text: prompt },
        cancellation.clone(),
        |event| {
            view.borrow_mut().apply_event(&event);
            dirty.set(true);
        },
    );
    tokio::pin!(dispatch);
    let mut redraw = tokio::time::interval(REDRAW_INTERVAL);
    redraw.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut external_interrupt = false;
    let mut presentation_failed = false;
    let result = loop {
        tokio::select! {
            biased;
            _ = interrupts.recv() => {
                external_interrupt = true;
                cancellation.cancel();
                view.borrow_mut().activity = ActivityView::Cancelling;
                dirty.set(true);
            }
            result = &mut dispatch => break result,
            event = events.next(), if !presentation_failed => {
                match event {
                    Some(Ok(event)) => handle_running_event(
                        event,
                        &cancellation,
                        &mut view.borrow_mut(),
                        &dirty,
                    ),
                    Some(Err(_)) | None => {
                        presentation_failed = true;
                        cancellation.cancel();
                    }
                }
            }
            _ = redraw.tick(), if dirty.get() && !presentation_failed => {
                if terminal.draw(&view.borrow()).is_err() {
                    presentation_failed = true;
                    cancellation.cancel();
                } else {
                    dirty.set(false);
                }
            }
            _ = tokio::time::sleep(PRESENTATION_CANCELLATION_TIMEOUT), if presentation_failed => {
                return Err(TuiError::Cancelled);
            }
        }
    };
    if presentation_failed {
        return Err(TuiError::Cancelled);
    }
    terminal
        .draw(&view.borrow())
        .map_err(|_| TuiError::Cancelled)?;
    match result {
        Ok(()) | Err(CoordinatorError::Cancelled) => {}
        Err(CoordinatorError::Rejected) => return Err(TuiError::Runtime),
        Err(_) => {
            // The coordinator emitted the authoritative TurnFailed event before returning.
        }
    }
    Ok(if external_interrupt {
        TurnOutcome::ExternalInterrupt
    } else {
        TurnOutcome::Finished
    })
}

fn handle_running_event(
    event: Event,
    cancellation: &CancellationToken,
    model: &mut TerminalViewModel,
    dirty: &Cell<bool>,
) {
    match event {
        Event::Key(key)
            if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat)
                && key.modifiers.contains(KeyModifiers::CONTROL)
                && key.code == KeyCode::Char('c') =>
        {
            cancellation.cancel();
            model.activity = ActivityView::Cancelling;
            dirty.set(true);
        }
        Event::Key(key)
            if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat)
                && key.modifiers.contains(KeyModifiers::CONTROL)
                && key.code == KeyCode::Char('o') =>
        {
            model.toggle_reasoning();
            dirty.set(true);
        }
        Event::Key(key)
            if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat)
                && key.code == KeyCode::PageUp =>
        {
            model.scroll_up(SCROLL_PAGE_ROWS);
            dirty.set(true);
        }
        Event::Key(key)
            if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat)
                && key.code == KeyCode::PageDown =>
        {
            model.scroll_down(SCROLL_PAGE_ROWS);
            dirty.set(true);
        }
        Event::Resize(_, _) => dirty.set(true),
        _ => {}
    }
}

fn classify_terminal_error(error: io::Error) -> TuiError {
    let missing_tty = matches!(
        error.raw_os_error(),
        Some(code) if code == libc::ENXIO || code == libc::ENOTTY
    );
    if missing_tty
        || matches!(
            error.kind(),
            io::ErrorKind::NotFound
                | io::ErrorKind::NotConnected
                | io::ErrorKind::Unsupported
                | io::ErrorKind::PermissionDenied
        )
    {
        TuiError::TerminalUnavailable
    } else {
        TuiError::Runtime
    }
}

#[cfg(test)]
mod tests {
    use crossterm::event::KeyEvent;

    use super::*;

    #[test]
    fn running_controls_cancel_toggle_and_scroll_without_editing() {
        let cancellation = CancellationToken::new();
        let mut model = TerminalViewModel::new();
        let dirty = Cell::new(false);
        handle_running_event(
            Event::Key(KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL)),
            &cancellation,
            &mut model,
            &dirty,
        );
        assert!(cancellation.is_cancelled());
        assert!(matches!(model.activity, ActivityView::Cancelling));
        assert!(dirty.get());
    }
}
