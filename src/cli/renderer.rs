use std::io::{self, Write};

use crate::app::action::RuntimeEvent;
use crate::backend::profile::estimate_cost;

const DEFAULT_MAXIMUM_SINK_BYTES: usize = 16 * 1024 * 1024;

#[cfg(unix)]
struct NonblockingWriter<W: Write + std::os::fd::AsRawFd> {
    inner: W,
    descriptor: i32,
    original_flags: i32,
}

#[cfg(unix)]
impl<W: Write + std::os::fd::AsRawFd> NonblockingWriter<W> {
    fn new(inner: W, original_flags: i32) -> io::Result<Self> {
        let descriptor = inner.as_raw_fd();
        // SAFETY: the descriptor remains live for this wrapper and existing flags are preserved.
        if unsafe { libc::fcntl(descriptor, libc::F_SETFL, original_flags | libc::O_NONBLOCK) } < 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            inner,
            descriptor,
            original_flags,
        })
    }
}

#[cfg(unix)]
fn descriptor_flags(descriptor: i32) -> io::Result<i32> {
    // SAFETY: fcntl observes flags on a descriptor owned by a live stdio handle.
    let flags = unsafe { libc::fcntl(descriptor, libc::F_GETFL) };
    if flags < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(flags)
    }
}

#[cfg(unix)]
impl<W: Write + std::os::fd::AsRawFd> Write for NonblockingWriter<W> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.inner.write(bytes)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

#[cfg(unix)]
impl<W: Write + std::os::fd::AsRawFd> Drop for NonblockingWriter<W> {
    fn drop(&mut self) {
        // SAFETY: restoration targets the same descriptor while `inner` is still live.
        unsafe {
            libc::fcntl(self.descriptor, libc::F_SETFL, self.original_flags);
        }
    }
}

struct BoundedWriter {
    inner: Box<dyn Write>,
    written: usize,
    maximum: usize,
}

impl BoundedWriter {
    fn new(inner: Box<dyn Write>, maximum: usize) -> Self {
        Self {
            inner,
            written: 0,
            maximum,
        }
    }
}

impl Write for BoundedWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let remaining = self.maximum.saturating_sub(self.written);
        if bytes.len() > remaining {
            return Err(io::Error::new(
                io::ErrorKind::OutOfMemory,
                "renderer sink byte limit reached",
            ));
        }
        let written = self.inner.write(bytes)?;
        self.written = self.written.checked_add(written).ok_or_else(|| {
            io::Error::new(io::ErrorKind::OutOfMemory, "renderer byte count overflow")
        })?;
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

pub struct Renderer {
    stdout: BoundedWriter,
    stderr: BoundedWriter,
    reasoning_started: bool,
    text_started: bool,
}

impl Renderer {
    pub fn stdio() -> io::Result<Self> {
        #[cfg(unix)]
        {
            let stdout = io::stdout();
            let stderr = io::stderr();
            // Capture both states before changing either descriptor because callers may have
            // duplicated stdout and stderr from the same open file description.
            let stdout_flags = descriptor_flags(std::os::fd::AsRawFd::as_raw_fd(&stdout))?;
            let stderr_flags = descriptor_flags(std::os::fd::AsRawFd::as_raw_fd(&stderr))?;
            let stdout = NonblockingWriter::new(stdout, stdout_flags)?;
            let stderr = NonblockingWriter::new(stderr, stderr_flags)?;
            Ok(Self::new(Box::new(stdout), Box::new(stderr)))
        }
        #[cfg(not(unix))]
        {
            Ok(Self::new(Box::new(io::stdout()), Box::new(io::stderr())))
        }
    }

    pub fn new(stdout: Box<dyn Write>, stderr: Box<dyn Write>) -> Self {
        Self::new_bounded(
            stdout,
            stderr,
            DEFAULT_MAXIMUM_SINK_BYTES,
            DEFAULT_MAXIMUM_SINK_BYTES,
        )
    }

    pub fn new_bounded(
        stdout: Box<dyn Write>,
        stderr: Box<dyn Write>,
        maximum_stdout_bytes: usize,
        maximum_stderr_bytes: usize,
    ) -> Self {
        Self {
            stdout: BoundedWriter::new(stdout, maximum_stdout_bytes),
            stderr: BoundedWriter::new(stderr, maximum_stderr_bytes),
            reasoning_started: false,
            text_started: false,
        }
    }

    pub fn render(&mut self, event: &RuntimeEvent) -> io::Result<()> {
        match event {
            RuntimeEvent::CredentialChanged { state } => {
                writeln!(self.stderr, "credential: {state:?}")
            }
            RuntimeEvent::ReasoningDelta { text, .. } => {
                if !self.reasoning_started {
                    write!(self.stderr, "reasoning: ")?;
                    self.reasoning_started = true;
                }
                write!(self.stderr, "{text}")
            }
            RuntimeEvent::TextDelta { text, .. } => {
                self.text_started = true;
                write!(self.stdout, "{text}")
            }
            RuntimeEvent::UsageUpdated { usage, .. } => {
                self.finish_reasoning_line()?;
                write!(
                    self.stderr,
                    "usage (turn total): prompt={:?} cache_hit={:?} cache_miss={:?} output={:?} reasoning={:?} total={:?}",
                    usage.prompt_tokens,
                    usage.cache_hit_tokens,
                    usage.cache_miss_tokens,
                    usage.output_tokens,
                    usage.reasoning_tokens,
                    usage.total_tokens
                )?;
                match estimate_cost(usage) {
                    Ok(Some(cost)) => writeln!(
                        self.stderr,
                        "; estimated USD ${}.{:09} (rates observed {}; provider ledger is authoritative)",
                        cost.nano_usd / 1_000_000_000,
                        cost.nano_usd % 1_000_000_000,
                        cost.observed_on
                    ),
                    Ok(None) => {
                        writeln!(self.stderr, "; estimated cost unknown (usage incomplete)")
                    }
                    Err(error) => writeln!(
                        self.stderr,
                        "; estimated cost unknown ({error}; rates observed {})",
                        crate::backend::profile::PRICE_OBSERVED_ON
                    ),
                }
            }
            RuntimeEvent::ToolValidated { name, mutating, .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "tool: {name} (mutating={mutating})")
            }
            RuntimeEvent::ApprovalRequested { summary, .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "approval requested: {summary}")
            }
            RuntimeEvent::ApprovalResolved { decision, .. } => {
                writeln!(self.stderr, "approval: {decision:?}")
            }
            RuntimeEvent::ToolStarted { name, .. } => writeln!(self.stderr, "tool started: {name}"),
            RuntimeEvent::ToolCompleted {
                name,
                output,
                executed,
                ..
            } => writeln!(
                self.stderr,
                "tool result: {name} executed={executed} {output}"
            ),
            RuntimeEvent::LimitReached { limit, .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "limit reached: {limit:?}")
            }
            RuntimeEvent::TurnFailed { code, .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "turn failed: {code}")
            }
            RuntimeEvent::TurnCancelled { .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "turn cancelled")
            }
            RuntimeEvent::TurnUncertain { .. } => {
                self.finish_reasoning_line()?;
                writeln!(self.stderr, "turn outcome uncertain")
            }
            _ => Ok(()),
        }
    }

    fn finish_reasoning_line(&mut self) -> io::Result<()> {
        if self.reasoning_started {
            writeln!(self.stderr)?;
            self.reasoning_started = false;
        }
        Ok(())
    }

    pub fn finish(&mut self) -> io::Result<()> {
        if self.text_started {
            writeln!(self.stdout)?;
        }
        self.stdout.flush()?;
        self.stderr.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sink_capacity_is_enforced_before_output_is_written() {
        let mut renderer =
            Renderer::new_bounded(Box::new(Vec::<u8>::new()), Box::new(Vec::<u8>::new()), 3, 3);
        let error = renderer
            .render(&RuntimeEvent::TextDelta {
                turn_id: crate::agent::types::TurnId::new(),
                text: "four".into(),
            })
            .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::OutOfMemory);
    }
}
