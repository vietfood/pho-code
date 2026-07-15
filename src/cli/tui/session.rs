use std::fs::{File, OpenOptions};
use std::io::{self, Write as _};
use std::os::fd::AsRawFd as _;

use crossterm::cursor::{Hide, Show};
use crossterm::event::{DisableBracketedPaste, EnableBracketedPaste};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;

use super::{TerminalViewModel, render};

const MINIMUM_WIDTH: u16 = 40;
const MINIMUM_HEIGHT: u16 = 8;
type TtyTerminal = Terminal<CrosstermBackend<File>>;

pub(super) struct TerminalSession {
    terminal: Option<TtyTerminal>,
    descriptor: i32,
    original_flags: i32,
    flags_changed: bool,
    raw_enabled: bool,
    controls_enabled: bool,
}

impl TerminalSession {
    pub(super) fn enter() -> io::Result<Self> {
        let mut tty = OpenOptions::new().read(true).write(true).open("/dev/tty")?;
        let descriptor = tty.as_raw_fd();
        let original_flags = descriptor_flags(descriptor)?;
        let (width, height) = crossterm::terminal::size()?;
        ensure_supported_size(width, height)?;

        let mut session = Self {
            terminal: None,
            descriptor,
            original_flags,
            flags_changed: false,
            raw_enabled: false,
            controls_enabled: false,
        };
        enable_raw_mode()?;
        session.raw_enabled = true;
        session.controls_enabled = true;
        execute!(tty, EnterAlternateScreen, EnableBracketedPaste, Hide)?;
        tty.flush()?;

        let terminal = Terminal::new(CrosstermBackend::new(tty))?;
        session.terminal = Some(terminal);
        set_nonblocking(descriptor, original_flags)?;
        session.flags_changed = true;
        Ok(session)
    }

    pub(super) fn draw(&mut self, model: &TerminalViewModel) -> io::Result<()> {
        let terminal = self
            .terminal
            .as_mut()
            .ok_or_else(|| io::Error::other("terminal is already restored"))?;
        terminal.autoresize()?;
        let area = terminal.size()?;
        ensure_supported_size(area.width, area.height)?;
        terminal.draw(|frame| render(frame, model))?;
        Ok(())
    }

    pub(super) fn restore(&mut self) -> io::Result<()> {
        let mut first_error = None;
        if let Some(terminal) = self.terminal.as_mut() {
            if self.controls_enabled {
                record(
                    &mut first_error,
                    execute!(
                        terminal.backend_mut(),
                        DisableBracketedPaste,
                        LeaveAlternateScreen,
                        Show
                    ),
                );
                record(&mut first_error, terminal.backend_mut().flush());
                self.controls_enabled = false;
            }
            if self.flags_changed {
                record(
                    &mut first_error,
                    restore_descriptor_flags(self.descriptor, self.original_flags),
                );
                self.flags_changed = false;
            }
            self.terminal.take();
        } else if self.controls_enabled {
            match OpenOptions::new().write(true).open("/dev/tty") {
                Ok(mut tty) => {
                    record(
                        &mut first_error,
                        execute!(tty, DisableBracketedPaste, LeaveAlternateScreen, Show),
                    );
                    record(&mut first_error, tty.flush());
                }
                Err(error) => record(&mut first_error, Err(error)),
            }
            self.controls_enabled = false;
        }
        if self.raw_enabled {
            record(&mut first_error, disable_raw_mode());
            self.raw_enabled = false;
        }
        first_error.map_or(Ok(()), Err)
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

fn ensure_supported_size(width: u16, height: u16) -> io::Result<()> {
    if width < MINIMUM_WIDTH || height < MINIMUM_HEIGHT {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "terminal viewport is too small (minimum 40x8)",
        ))
    } else {
        Ok(())
    }
}

fn descriptor_flags(descriptor: i32) -> io::Result<i32> {
    // SAFETY: fcntl observes flags on the live controlling-terminal descriptor.
    let flags = unsafe { libc::fcntl(descriptor, libc::F_GETFL) };
    if flags < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(flags)
    }
}

fn set_nonblocking(descriptor: i32, original_flags: i32) -> io::Result<()> {
    // SAFETY: the descriptor remains owned by the terminal session and existing flags are kept.
    if unsafe { libc::fcntl(descriptor, libc::F_SETFL, original_flags | libc::O_NONBLOCK) } < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn restore_descriptor_flags(descriptor: i32, original_flags: i32) -> io::Result<()> {
    // SAFETY: restoration targets the same descriptor while the terminal backend is still alive.
    if unsafe { libc::fcntl(descriptor, libc::F_SETFL, original_flags) } < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn record(slot: &mut Option<io::Error>, result: io::Result<()>) {
    if let Err(error) = result
        && slot.is_none()
    {
        *slot = Some(error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiny_viewports_are_rejected_explicitly() {
        assert_eq!(
            ensure_supported_size(39, 20).unwrap_err().kind(),
            io::ErrorKind::Unsupported
        );
        assert_eq!(
            ensure_supported_size(80, 7).unwrap_err().kind(),
            io::ErrorKind::Unsupported
        );
        ensure_supported_size(40, 8).unwrap();
    }
}
