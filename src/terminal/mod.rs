//! Bounded, user-operated PTY terminals.
//!
//! This module deliberately has no GPUI, session, tool, or provider dependency.  A terminal
//! owns a direct user shell and its bytes never become model or journal data.  The blocking PTY
//! reader and emulator worker are isolated from the coordinator; views consume only immutable
//! snapshots and typed lifecycle events.

use std::collections::HashMap;
use std::ffi::CStr;
use std::fmt;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};

use crate::app::workbench_preferences::WorkspaceRegistrationId;
use crate::app::workbench_state::WorkspaceGeneration;

pub const MAX_TERMINALS: usize = 8;
pub const MAX_COLUMNS: u16 = 512;
pub const MAX_ROWS: u16 = 256;
pub const MAX_INPUT_FRAME_BYTES: usize = 64 * 1024;
pub const MAX_QUEUED_INPUT_BYTES: usize = 256 * 1024;
pub const MAX_OUTPUT_READ_BYTES: usize = 16 * 1024;
pub const MAX_SCROLLBACK_ROWS: usize = 20_000;
pub const MAX_SCROLLBACK_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_AGGREGATE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_LIFECYCLE_EVENTS: usize = 128;
pub const MAX_TERMINAL_ENV_BYTES: usize = 64 * 1024;
pub const MAX_ENV_VALUE_BYTES: usize = 8 * 1024;
pub const DEFAULT_COLUMNS: u16 = 80;
pub const DEFAULT_ROWS: u16 = 24;
const CLOSE_GRACE: Duration = Duration::from_millis(350);
const CLOSE_TERM_GRACE: Duration = Duration::from_millis(350);
const CLOSE_DEADLINE: Duration = Duration::from_secs(2);
const INPUT_QUEUE_FRAMES: usize = 8;
// Eight bytes per cell conservatively covers UTF-8 content plus emulator bookkeeping. The
// effective row cap satisfies both the per-terminal and aggregate byte budgets at MAX_COLUMNS.
const ESTIMATED_CELL_BYTES: usize = 8;
const ROW_BYTES_AT_MAX_WIDTH: usize = MAX_COLUMNS as usize * ESTIMATED_CELL_BYTES;
const ROWS_BY_TERMINAL_BYTES: usize = MAX_SCROLLBACK_BYTES / ROW_BYTES_AT_MAX_WIDTH;
const ROWS_BY_AGGREGATE_BYTES: usize = MAX_AGGREGATE_BYTES / MAX_TERMINALS / ROW_BYTES_AT_MAX_WIDTH;
const EFFECTIVE_SCROLLBACK_ROWS: usize = if ROWS_BY_TERMINAL_BYTES < ROWS_BY_AGGREGATE_BYTES {
    ROWS_BY_TERMINAL_BYTES
} else {
    ROWS_BY_AGGREGATE_BYTES
};

static TERMINAL_ID: AtomicU64 = AtomicU64::new(1);

/// Opaque terminal identity, independent of tab order.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TerminalId(u64);

impl TerminalId {
    pub fn new() -> Self {
        Self(TERMINAL_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for TerminalId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for TerminalId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("TerminalId").field(&self.0).finish()
    }
}

/// A monotonically increasing shell generation. Restarting never reuses a generation.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TerminalGeneration(u64);

impl TerminalGeneration {
    pub fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        Self(NEXT.fetch_add(1, Ordering::Relaxed))
    }

    pub fn next(self) -> Self {
        Self(self.0.saturating_add(1))
    }
}

impl Default for TerminalGeneration {
    fn default() -> Self {
        Self::new()
    }
}

/// A terminal-local event sequence used to reject stale snapshots.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TerminalEventSequence(u64);

impl TerminalEventSequence {
    fn next(&mut self) -> Self {
        self.0 = self.0.saturating_add(1);
        *self
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct TerminalIdentity {
    pub terminal_id: TerminalId,
    pub generation: TerminalGeneration,
}

/// Workspace authority retained by a terminal for its entire lifetime.
#[derive(Clone, Eq, PartialEq)]
pub struct TerminalBinding {
    pub registration_id: WorkspaceRegistrationId,
    pub workspace_generation: WorkspaceGeneration,
    pub workspace_root: PathBuf,
    pub initial_relative_cwd: String,
}

impl fmt::Debug for TerminalBinding {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TerminalBinding")
            .field("registration_id", &self.registration_id)
            .field("workspace_generation", &self.workspace_generation)
            .field("initial_relative_cwd", &self.initial_relative_cwd)
            .finish_non_exhaustive()
    }
}

impl TerminalBinding {
    pub fn new(
        registration_id: WorkspaceRegistrationId,
        workspace_generation: WorkspaceGeneration,
        workspace_root: PathBuf,
        initial_relative_cwd: impl Into<String>,
    ) -> Result<Self, TerminalError> {
        let root = std::fs::canonicalize(&workspace_root).map_err(|_| TerminalError::InvalidCwd)?;
        let metadata = std::fs::metadata(&root).map_err(|_| TerminalError::InvalidCwd)?;
        if !root.is_absolute() || !metadata.is_dir() {
            return Err(TerminalError::InvalidCwd);
        }
        let relative = initial_relative_cwd.into();
        validate_relative_path(&relative)?;
        let cwd = root.join(&relative);
        let canonical = std::fs::canonicalize(&cwd).map_err(|_| TerminalError::InvalidCwd)?;
        if !canonical.starts_with(&root)
            || !std::fs::metadata(&canonical)
                .map(|metadata| metadata.is_dir())
                .unwrap_or(false)
        {
            return Err(TerminalError::InvalidCwd);
        }
        Ok(Self {
            registration_id,
            workspace_generation,
            workspace_root: root,
            initial_relative_cwd: relative,
        })
    }

    fn cwd(&self) -> Result<PathBuf, TerminalError> {
        let cwd = std::fs::canonicalize(self.workspace_root.join(&self.initial_relative_cwd))
            .map_err(|_| TerminalError::InvalidCwd)?;
        if !cwd.starts_with(&self.workspace_root)
            || !std::fs::metadata(&cwd)
                .map(|metadata| metadata.is_dir())
                .unwrap_or(false)
        {
            return Err(TerminalError::InvalidCwd);
        }
        Ok(cwd)
    }
}

#[derive(Clone)]
pub struct TerminalLaunchOptions {
    /// An explicit executable override is accepted only when it is an absolute executable file.
    pub shell: Option<PathBuf>,
    pub columns: u16,
    pub rows: u16,
    pub pixel_width: u16,
    pub pixel_height: u16,
}

impl fmt::Debug for TerminalLaunchOptions {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TerminalLaunchOptions")
            .field("shell_override", &self.shell.is_some())
            .field("columns", &self.columns)
            .field("rows", &self.rows)
            .field("pixel_width", &self.pixel_width)
            .field("pixel_height", &self.pixel_height)
            .finish()
    }
}

impl Default for TerminalLaunchOptions {
    fn default() -> Self {
        Self {
            shell: None,
            columns: DEFAULT_COLUMNS,
            rows: DEFAULT_ROWS,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TerminalState {
    Dormant,
    Opening,
    Running,
    Draining,
    Exited,
    Closing,
    Closed,
    Failed,
    Uncertain,
    Restarting,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExitClass {
    Success,
    Failure,
    Signaled,
    Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CloseReason {
    User,
    Restart,
    ApplicationShutdown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TerminalEventKind {
    Opening,
    Ready,
    SnapshotChanged,
    OutputTruncated {
        omitted_rows: usize,
        omitted_bytes: usize,
    },
    InputBackpressure,
    ChildExited {
        status: ExitClass,
    },
    Closing {
        reason: CloseReason,
    },
    Closed {
        cleanup: CleanupProof,
    },
    Failed {
        code: &'static str,
    },
    Uncertain {
        code: &'static str,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerminalEvent {
    pub identity: TerminalIdentity,
    pub sequence: TerminalEventSequence,
    pub kind: TerminalEventKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CleanupProof {
    Reaped {
        process_group_absent: bool,
        child_absent: bool,
    },
    Uncertain {
        waited: bool,
        process_group_absent: bool,
        child_absent: bool,
    },
}

#[derive(Clone, Eq, PartialEq)]
pub struct TerminalSnapshot {
    pub identity: TerminalIdentity,
    pub sequence: TerminalEventSequence,
    pub columns: u16,
    pub rows: u16,
    pub visible_rows: Vec<String>,
    pub scrollback_rows: usize,
    pub truncated_rows: usize,
    pub title_hint: Option<String>,
    pub cwd_hint: Option<String>,
}

impl fmt::Debug for TerminalSnapshot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let visible_bytes = self.visible_rows.iter().map(String::len).sum::<usize>();
        formatter
            .debug_struct("TerminalSnapshot")
            .field("identity", &self.identity)
            .field("sequence", &self.sequence)
            .field("columns", &self.columns)
            .field("rows", &self.rows)
            .field("visible_row_count", &self.visible_rows.len())
            .field("visible_bytes", &visible_bytes)
            .field("scrollback_rows", &self.scrollback_rows)
            .field("truncated_rows", &self.truncated_rows)
            .field("title_hint_present", &self.title_hint.is_some())
            .field("cwd_hint_present", &self.cwd_hint.is_some())
            .finish()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TerminalError {
    LimitReached,
    UnknownTerminal,
    StaleIdentity,
    InvalidDimensions,
    InvalidInput,
    InputBackpressure,
    InvalidCwd,
    InvalidShell,
    WorkspaceChanged,
    NotRunning,
    RestartRequiresAcknowledgement,
    AlreadyClosed,
    SpawnFailed,
    IoFailed,
    ShutdownDeadline,
}

/// Typed actor protocol used by coordinators and native views.  No command carries raw PTY
/// handles, process IDs, environment, or terminal bytes beyond the bounded input frame.
#[derive(Clone)]
pub enum TerminalCommand {
    Create {
        binding: TerminalBinding,
        options: TerminalLaunchOptions,
    },
    WriteInput {
        identity: TerminalIdentity,
        bytes: Vec<u8>,
    },
    Resize {
        identity: TerminalIdentity,
        columns: u16,
        rows: u16,
        pixel_width: u16,
        pixel_height: u16,
    },
    SendInterrupt {
        identity: TerminalIdentity,
    },
    Close {
        identity: TerminalIdentity,
        reason: CloseReason,
    },
    Restart {
        identity: TerminalIdentity,
        options: TerminalLaunchOptions,
    },
    RequestSnapshot {
        identity: TerminalIdentity,
        after_sequence: Option<TerminalEventSequence>,
    },
    AcknowledgeUncertain {
        identity: TerminalIdentity,
    },
    ShutdownAll {
        deadline: Duration,
    },
}

impl fmt::Debug for TerminalCommand {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Create { binding, options } => formatter
                .debug_struct("Create")
                .field("binding", binding)
                .field("options", options)
                .finish(),
            Self::WriteInput { identity, bytes } => formatter
                .debug_struct("WriteInput")
                .field("identity", identity)
                .field("byte_count", &bytes.len())
                .finish(),
            Self::Resize {
                identity,
                columns,
                rows,
                pixel_width,
                pixel_height,
            } => formatter
                .debug_struct("Resize")
                .field("identity", identity)
                .field("columns", columns)
                .field("rows", rows)
                .field("pixel_width", pixel_width)
                .field("pixel_height", pixel_height)
                .finish(),
            Self::SendInterrupt { identity } => formatter
                .debug_struct("SendInterrupt")
                .field("identity", identity)
                .finish(),
            Self::Close { identity, reason } => formatter
                .debug_struct("Close")
                .field("identity", identity)
                .field("reason", reason)
                .finish(),
            Self::Restart { identity, options } => formatter
                .debug_struct("Restart")
                .field("identity", identity)
                .field("options", options)
                .finish(),
            Self::RequestSnapshot {
                identity,
                after_sequence,
            } => formatter
                .debug_struct("RequestSnapshot")
                .field("identity", identity)
                .field("after_sequence", after_sequence)
                .finish(),
            Self::AcknowledgeUncertain { identity } => formatter
                .debug_struct("AcknowledgeUncertain")
                .field("identity", identity)
                .finish(),
            Self::ShutdownAll { deadline } => formatter
                .debug_struct("ShutdownAll")
                .field("deadline", deadline)
                .finish(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TerminalCommandResult {
    None,
    Created(TerminalIdentity),
    Restarted(TerminalIdentity),
    Snapshot(Option<TerminalSnapshot>),
    ShutdownProven(bool),
}

impl fmt::Display for TerminalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::LimitReached => "terminal limit reached",
            Self::UnknownTerminal => "unknown terminal",
            Self::StaleIdentity => "stale terminal identity",
            Self::InvalidDimensions => "invalid terminal dimensions",
            Self::InvalidInput => "invalid terminal input",
            Self::InputBackpressure => "terminal input backpressure",
            Self::InvalidCwd => "invalid terminal workspace cwd",
            Self::InvalidShell => "invalid terminal shell",
            Self::WorkspaceChanged => "terminal workspace changed",
            Self::NotRunning => "terminal is not running",
            Self::RestartRequiresAcknowledgement => "terminal cleanup requires acknowledgement",
            Self::AlreadyClosed => "terminal is already closed",
            Self::SpawnFailed => "terminal process could not be started",
            Self::IoFailed => "terminal I/O failed",
            Self::ShutdownDeadline => "terminal shutdown deadline exceeded",
        })
    }
}

impl std::error::Error for TerminalError {}

#[derive(Debug)]
struct ProcessControl {
    pid: u32,
    pgid: Option<libc::pid_t>,
    closing: AtomicBool,
    escalation_started: AtomicBool,
}

impl ProcessControl {
    fn signal_group(&self, signal: libc::c_int) -> bool {
        let Some(pgid) = self.pgid.filter(|pgid| *pgid > 1) else {
            return false;
        };
        // Negative pid targets the process group.  We never signal a persisted or unrelated PID;
        // the group leader came from this live PTY master immediately before spawn.
        unsafe { libc::kill(-pgid, signal) == 0 }
    }

    fn process_group_absent(&self) -> bool {
        let Some(pgid) = self.pgid.filter(|pgid| *pgid > 1) else {
            return false;
        };
        let result = unsafe { libc::kill(-pgid, 0) };
        if result == 0 {
            return false;
        }
        matches!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH))
    }

    fn child_absent(&self) -> bool {
        let result = unsafe { libc::kill(self.pid as libc::pid_t, 0) };
        result != 0 && matches!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH))
    }
}

struct WorkerShared {
    snapshot: Option<TerminalSnapshot>,
    next_sequence: TerminalEventSequence,
    pending_size: Option<(u16, u16)>,
}

struct TerminalEntry {
    identity: TerminalIdentity,
    binding: TerminalBinding,
    state: TerminalState,
    control: Arc<ProcessControlWithMaster>,
    input_tx: Option<mpsc::SyncSender<Vec<u8>>>,
    queued_input: Arc<AtomicUsize>,
    shared: Arc<Mutex<WorkerShared>>,
    _writer: Option<thread::JoinHandle<()>>,
    sequence: TerminalEventSequence,
}

/// The coordinator-facing terminal actor.  It is intentionally synchronous at the API boundary;
/// callers can run it on the application background executor while PTY workers remain blocking.
pub struct TerminalManager {
    entries: HashMap<TerminalId, TerminalEntry>,
    lifecycle_rx: mpsc::Receiver<TerminalEvent>,
    lifecycle_tx: mpsc::SyncSender<TerminalEvent>,
    snapshot_rx: mpsc::Receiver<TerminalEvent>,
    snapshot_tx: mpsc::SyncSender<TerminalEvent>,
}

pub type TerminalActor = TerminalManager;

impl fmt::Debug for TerminalManager {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TerminalManager")
            .field("terminal_count", &self.entries.len())
            .finish()
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        if !self.entries.is_empty() {
            let _ = self.shutdown_all(CLOSE_DEADLINE);
        }
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        let (lifecycle_tx, lifecycle_rx) = mpsc::sync_channel(MAX_LIFECYCLE_EVENTS);
        let (snapshot_tx, snapshot_rx) = mpsc::sync_channel(MAX_LIFECYCLE_EVENTS);
        Self {
            entries: HashMap::new(),
            lifecycle_rx,
            lifecycle_tx,
            snapshot_rx,
            snapshot_tx,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn dispatch(
        &mut self,
        command: TerminalCommand,
    ) -> Result<TerminalCommandResult, TerminalError> {
        match command {
            TerminalCommand::Create { binding, options } => self
                .create_terminal(binding, options)
                .map(TerminalCommandResult::Created),
            TerminalCommand::WriteInput { identity, bytes } => {
                self.write_input(identity, &bytes)?;
                Ok(TerminalCommandResult::None)
            }
            TerminalCommand::Resize {
                identity,
                columns,
                rows,
                pixel_width,
                pixel_height,
            } => {
                self.resize(identity, columns, rows, pixel_width, pixel_height)?;
                Ok(TerminalCommandResult::None)
            }
            TerminalCommand::SendInterrupt { identity } => {
                self.send_interrupt(identity)?;
                Ok(TerminalCommandResult::None)
            }
            TerminalCommand::Close { identity, reason } => {
                self.close(identity, reason)?;
                Ok(TerminalCommandResult::None)
            }
            TerminalCommand::Restart { identity, options } => self
                .restart(identity, options)
                .map(TerminalCommandResult::Restarted),
            TerminalCommand::RequestSnapshot {
                identity,
                after_sequence,
            } => self
                .snapshot(identity, after_sequence)
                .map(TerminalCommandResult::Snapshot),
            TerminalCommand::AcknowledgeUncertain { identity } => {
                self.acknowledge_uncertain(identity)?;
                Ok(TerminalCommandResult::None)
            }
            TerminalCommand::ShutdownAll { deadline } => Ok(TerminalCommandResult::ShutdownProven(
                self.shutdown_all(deadline),
            )),
        }
    }

    pub fn create_terminal(
        &mut self,
        binding: TerminalBinding,
        options: TerminalLaunchOptions,
    ) -> Result<TerminalIdentity, TerminalError> {
        if self.entries.len() >= MAX_TERMINALS {
            return Err(TerminalError::LimitReached);
        }
        let size = clamp_size(&options)?;
        binding.cwd()?;
        let identity = TerminalIdentity {
            terminal_id: TerminalId::new(),
            generation: TerminalGeneration::new(),
        };
        let shared = Arc::new(Mutex::new(WorkerShared {
            snapshot: None,
            next_sequence: TerminalEventSequence(0),
            pending_size: None,
        }));
        let control = spawn_terminal(
            identity,
            &binding,
            &options,
            size,
            Arc::clone(&shared),
            self.lifecycle_tx.clone(),
            self.snapshot_tx.clone(),
        )?;
        let queued_input = Arc::new(AtomicUsize::new(0));
        let (input_tx, writer) = match spawn_writer(
            control.clone(),
            identity,
            Arc::clone(&queued_input),
            self.lifecycle_tx.clone(),
        ) {
            Ok(writer) => writer,
            Err(error) => {
                if !cleanup_failed_spawn(&control) {
                    return Err(TerminalError::ShutdownDeadline);
                }
                return Err(error);
            }
        };
        let writer = Some(writer);
        self.entries.insert(
            identity.terminal_id,
            TerminalEntry {
                identity,
                binding,
                state: TerminalState::Opening,
                control,
                input_tx: Some(input_tx),
                queued_input,
                shared,
                _writer: writer,
                sequence: TerminalEventSequence(0),
            },
        );
        Ok(identity)
    }

    /// Queue at most one bounded input frame.  A full queue is reported and bytes are not dropped.
    pub fn write_input(
        &mut self,
        identity: TerminalIdentity,
        bytes: &[u8],
    ) -> Result<(), TerminalError> {
        if bytes.is_empty() || bytes.len() > MAX_INPUT_FRAME_BYTES {
            return Err(TerminalError::InvalidInput);
        }
        let (tx, queued_input) = {
            let entry = self.entry_mut(identity)?;
            if !matches!(entry.state, TerminalState::Running | TerminalState::Opening) {
                return Err(TerminalError::NotRunning);
            }
            let Some(tx) = entry.input_tx.as_ref() else {
                return Err(TerminalError::NotRunning);
            };
            (tx.clone(), Arc::clone(&entry.queued_input))
        };
        let queued = queued_input.load(Ordering::Acquire);
        if queued.saturating_add(bytes.len()) > MAX_QUEUED_INPUT_BYTES {
            self.emit(identity, TerminalEventKind::InputBackpressure);
            return Err(TerminalError::InputBackpressure);
        }
        queued_input.fetch_add(bytes.len(), Ordering::AcqRel);
        if tx.try_send(bytes.to_vec()).is_err() {
            queued_input.fetch_sub(bytes.len(), Ordering::AcqRel);
            self.emit(identity, TerminalEventKind::InputBackpressure);
            return Err(TerminalError::InputBackpressure);
        }
        Ok(())
    }

    pub fn resize(
        &mut self,
        identity: TerminalIdentity,
        columns: u16,
        rows: u16,
        pixel_width: u16,
        pixel_height: u16,
    ) -> Result<(), TerminalError> {
        let entry = self.entry_mut(identity)?;
        if !matches!(entry.state, TerminalState::Running | TerminalState::Opening) {
            return Err(TerminalError::NotRunning);
        }
        let size = clamp_size_values(columns, rows, pixel_width, pixel_height)?;
        entry
            .control
            .master
            .lock()
            .map_err(|_| TerminalError::IoFailed)?
            .as_ref()
            .ok_or(TerminalError::NotRunning)?
            .resize(size)
            .map_err(|_| TerminalError::IoFailed)?;
        if let Ok(mut shared) = entry.shared.lock() {
            shared.pending_size = Some((size.rows, size.cols));
            if let Some(snapshot) = shared.snapshot.as_mut() {
                snapshot.columns = size.cols;
                snapshot.rows = size.rows;
            }
        }
        Ok(())
    }

    pub fn send_interrupt(&mut self, identity: TerminalIdentity) -> Result<(), TerminalError> {
        self.write_input(identity, &[3])
    }

    pub fn close(
        &mut self,
        identity: TerminalIdentity,
        reason: CloseReason,
    ) -> Result<(), TerminalError> {
        let control = {
            let entry = self.entry_mut(identity)?;
            if matches!(entry.state, TerminalState::Closed | TerminalState::Exited) {
                return Err(TerminalError::AlreadyClosed);
            }
            if matches!(entry.state, TerminalState::Uncertain) {
                return Err(TerminalError::RestartRequiresAcknowledgement);
            }
            entry.state = TerminalState::Closing;
            entry.input_tx.take();
            let control = Arc::clone(&entry.control);
            entry.control.base.closing.store(true, Ordering::Release);
            entry.control.base.signal_group(libc::SIGHUP);
            control
        };
        self.emit(identity, TerminalEventKind::Closing { reason });
        start_escalation(control);
        Ok(())
    }

    pub fn acknowledge_uncertain(
        &mut self,
        identity: TerminalIdentity,
    ) -> Result<(), TerminalError> {
        let entry = self.entry_mut(identity)?;
        if !matches!(entry.state, TerminalState::Uncertain) {
            return Err(TerminalError::NotRunning);
        }
        entry.state = TerminalState::Closed;
        Ok(())
    }

    pub fn restart(
        &mut self,
        identity: TerminalIdentity,
        options: TerminalLaunchOptions,
    ) -> Result<TerminalIdentity, TerminalError> {
        let (binding, generation) = {
            let entry = self.entry_mut(identity)?;
            if matches!(entry.state, TerminalState::Uncertain) {
                return Err(TerminalError::RestartRequiresAcknowledgement);
            }
            if !matches!(entry.state, TerminalState::Closed) {
                return Err(TerminalError::NotRunning);
            }
            (entry.binding.clone(), entry.identity.generation)
        };
        let next = TerminalIdentity {
            terminal_id: identity.terminal_id,
            generation: generation.next(),
        };
        let _ = self.entries.remove(&identity.terminal_id);
        self.create_terminal_with_identity(next, binding, options)
    }

    pub fn snapshot(
        &self,
        identity: TerminalIdentity,
        after_sequence: Option<TerminalEventSequence>,
    ) -> Result<Option<TerminalSnapshot>, TerminalError> {
        let entry = self
            .entries
            .get(&identity.terminal_id)
            .ok_or(TerminalError::UnknownTerminal)?;
        if entry.identity.generation != identity.generation {
            return Err(TerminalError::StaleIdentity);
        }
        let snapshot = entry
            .shared
            .lock()
            .map_err(|_| TerminalError::IoFailed)?
            .snapshot
            .clone();
        Ok(
            snapshot
                .filter(|snapshot| after_sequence.is_none_or(|after| snapshot.sequence > after)),
        )
    }

    pub fn try_recv_event(&mut self) -> Option<TerminalEvent> {
        if let Some(identity) = self.entries.values().find_map(|entry| {
            matches!(
                entry.state,
                TerminalState::Closing | TerminalState::Exited | TerminalState::Failed
            )
            .then_some(entry)
            .filter(|entry| {
                entry.control.base.process_group_absent() && entry.control.base.child_absent()
            })
            .map(|entry| entry.identity)
        }) && let Some(entry) = self.entries.get_mut(&identity.terminal_id)
        {
            entry.state = TerminalState::Closed;
            let sequence = entry.sequence.next();
            return Some(TerminalEvent {
                identity,
                sequence,
                kind: TerminalEventKind::Closed {
                    cleanup: CleanupProof::Reaped {
                        process_group_absent: true,
                        child_absent: true,
                    },
                },
            });
        }

        loop {
            let mut event = self
                .lifecycle_rx
                .try_recv()
                .or_else(|_| self.snapshot_rx.try_recv())
                .ok()?;
            if let Some(entry) = self.entries.get_mut(&event.identity.terminal_id)
                && entry.identity.generation == event.identity.generation
            {
                // Once absence has been proven, delayed reader/snapshot notifications cannot
                // regress the terminal back to Exited, Running, Failed, or Uncertain.
                if matches!(entry.state, TerminalState::Closed)
                    && !matches!(&event.kind, TerminalEventKind::Closed { .. })
                {
                    continue;
                }
                entry.sequence.next();
                event.sequence = entry.sequence;
                if matches!(&event.kind, TerminalEventKind::SnapshotChanged)
                    && let Ok(mut shared) = entry.shared.lock()
                    && let Some(snapshot) = shared.snapshot.as_mut()
                {
                    snapshot.sequence = event.sequence;
                }
                match &event.kind {
                    TerminalEventKind::Ready => entry.state = TerminalState::Running,
                    TerminalEventKind::ChildExited { .. } => entry.state = TerminalState::Exited,
                    TerminalEventKind::Closed { .. } => entry.state = TerminalState::Closed,
                    TerminalEventKind::Failed { .. } => entry.state = TerminalState::Failed,
                    TerminalEventKind::Uncertain { .. } => entry.state = TerminalState::Uncertain,
                    _ => {}
                }
            }
            return Some(event);
        }
    }

    /// Close all live children and wait for proof, returning false when a child is still uncertain.
    pub fn shutdown_all(&mut self, deadline: Duration) -> bool {
        let identities = self
            .entries
            .values()
            .filter(|entry| !matches!(entry.state, TerminalState::Closed))
            .map(|entry| entry.identity)
            .collect::<Vec<_>>();
        for identity in identities {
            let _ = self.close(identity, CloseReason::ApplicationShutdown);
        }
        let until = Instant::now() + deadline.min(CLOSE_DEADLINE);
        while Instant::now() < until {
            while self.try_recv_event().is_some() {}
            if self
                .entries
                .values()
                .all(|entry| matches!(entry.state, TerminalState::Closed))
            {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        let uncertain = self
            .entries
            .values_mut()
            .filter_map(|entry| {
                if matches!(entry.state, TerminalState::Closed) {
                    None
                } else {
                    entry.state = TerminalState::Uncertain;
                    Some(entry.identity)
                }
            })
            .collect::<Vec<_>>();
        for identity in uncertain {
            self.emit(
                identity,
                TerminalEventKind::Uncertain {
                    code: "shutdown_deadline",
                },
            );
        }
        false
    }

    fn create_terminal_with_identity(
        &mut self,
        identity: TerminalIdentity,
        binding: TerminalBinding,
        options: TerminalLaunchOptions,
    ) -> Result<TerminalIdentity, TerminalError> {
        if self.entries.len() >= MAX_TERMINALS {
            return Err(TerminalError::LimitReached);
        }
        let size = clamp_size(&options)?;
        binding.cwd()?;
        let shared = Arc::new(Mutex::new(WorkerShared {
            snapshot: None,
            next_sequence: TerminalEventSequence(0),
            pending_size: None,
        }));
        let control = spawn_terminal(
            identity,
            &binding,
            &options,
            size,
            Arc::clone(&shared),
            self.lifecycle_tx.clone(),
            self.snapshot_tx.clone(),
        )?;
        let queued_input = Arc::new(AtomicUsize::new(0));
        let (input_tx, writer) = match spawn_writer(
            control.clone(),
            identity,
            Arc::clone(&queued_input),
            self.lifecycle_tx.clone(),
        ) {
            Ok(writer) => writer,
            Err(error) => {
                if !cleanup_failed_spawn(&control) {
                    return Err(TerminalError::ShutdownDeadline);
                }
                return Err(error);
            }
        };
        self.entries.insert(
            identity.terminal_id,
            TerminalEntry {
                identity,
                binding,
                state: TerminalState::Restarting,
                control,
                input_tx: Some(input_tx),
                queued_input,
                shared,
                _writer: Some(writer),
                sequence: TerminalEventSequence(0),
            },
        );
        Ok(identity)
    }

    fn entry_mut(
        &mut self,
        identity: TerminalIdentity,
    ) -> Result<&mut TerminalEntry, TerminalError> {
        let entry = self
            .entries
            .get_mut(&identity.terminal_id)
            .ok_or(TerminalError::UnknownTerminal)?;
        if entry.identity.generation != identity.generation {
            return Err(TerminalError::StaleIdentity);
        }
        Ok(entry)
    }

    fn emit(&mut self, identity: TerminalIdentity, kind: TerminalEventKind) {
        let Some(entry) = self.entries.get_mut(&identity.terminal_id) else {
            return;
        };
        if entry.identity.generation != identity.generation {
            return;
        }
        entry.sequence.next();
        let event = TerminalEvent {
            identity,
            sequence: entry.sequence,
            kind,
        };
        // Lifecycle truth is lossless within the bounded channel. Snapshot notifications use the
        // independent coalescing channel and can never consume this capacity.
        let _ = self.lifecycle_tx.send(event);
    }
}

/// Internal process state.  The master is shared for resize and process-group qualification while
/// the worker owns the reader and child wait handles.
struct ProcessControlWithMaster {
    base: ProcessControl,
    master: Mutex<Option<Box<dyn MasterPty>>>,
}

impl fmt::Debug for ProcessControlWithMaster {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ProcessControl")
            .field("pid_present", &true)
            .field("process_group_present", &self.base.pgid.is_some())
            .finish()
    }
}

fn spawn_terminal(
    identity: TerminalIdentity,
    binding: &TerminalBinding,
    options: &TerminalLaunchOptions,
    size: PtySize,
    shared: Arc<Mutex<WorkerShared>>,
    lifecycle_tx: mpsc::SyncSender<TerminalEvent>,
    snapshot_tx: mpsc::SyncSender<TerminalEvent>,
) -> Result<Arc<ProcessControlWithMaster>, TerminalError> {
    let shell = resolve_shell(options.shell.as_deref())?;
    let cwd = binding.cwd()?;
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(size)
        .map_err(|_| TerminalError::SpawnFailed)?;
    let master = pair.master;
    let slave = pair.slave;
    let mut command = CommandBuilder::new(&shell);
    command.arg("-l");
    command.arg("-i");
    command.cwd(&cwd);
    configure_environment(&mut command, &cwd, &shell)?;
    let child = slave
        .spawn_command(command)
        .map_err(|_| TerminalError::SpawnFailed)?;
    drop(slave);
    let pid = child.process_id().ok_or(TerminalError::SpawnFailed)?;
    let pgid = master.process_group_leader();
    let control = Arc::new(ProcessControlWithMaster {
        base: ProcessControl {
            pid,
            pgid,
            closing: AtomicBool::new(false),
            escalation_started: AtomicBool::new(false),
        },
        master: Mutex::new(Some(master)),
    });
    let reader = control
        .master
        .lock()
        .map_err(|_| TerminalError::SpawnFailed)?
        .as_ref()
        .ok_or(TerminalError::SpawnFailed)?
        .try_clone_reader()
        .map_err(|_| TerminalError::SpawnFailed)?;
    send_lifecycle(&lifecycle_tx, identity, TerminalEventKind::Opening);
    let worker_control = Arc::clone(&control);
    let worker_events = WorkerEventSenders {
        lifecycle: lifecycle_tx,
        snapshots: snapshot_tx,
    };
    thread::Builder::new()
        .name("pho-terminal-reader".into())
        .spawn(move || {
            run_reader(
                identity,
                reader,
                child,
                worker_control,
                size,
                shared,
                worker_events,
            )
        })
        .map_err(|_| TerminalError::SpawnFailed)?;
    Ok(control)
}

fn spawn_writer(
    control: Arc<ProcessControlWithMaster>,
    identity: TerminalIdentity,
    queued: Arc<AtomicUsize>,
    lifecycle_tx: mpsc::SyncSender<TerminalEvent>,
) -> Result<(mpsc::SyncSender<Vec<u8>>, thread::JoinHandle<()>), TerminalError> {
    let writer = control
        .master
        .lock()
        .map_err(|_| TerminalError::SpawnFailed)?
        .as_ref()
        .ok_or(TerminalError::NotRunning)?
        .take_writer()
        .map_err(|_| TerminalError::SpawnFailed)?;
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(INPUT_QUEUE_FRAMES);
    let queued_for_thread = Arc::clone(&queued);
    let handle = thread::Builder::new()
        .name("pho-terminal-writer".into())
        .spawn(move || {
            let mut writer = writer;
            while let Ok(bytes) = rx.recv() {
                let result = writer.write_all(&bytes).and_then(|_| writer.flush());
                queued_for_thread.fetch_sub(bytes.len(), Ordering::AcqRel);
                if result.is_err() {
                    let _ = lifecycle_tx.try_send(TerminalEvent {
                        identity,
                        sequence: TerminalEventSequence(0),
                        kind: TerminalEventKind::Failed {
                            code: "input_write",
                        },
                    });
                    break;
                }
                if control.base.closing.load(Ordering::Acquire) {
                    break;
                }
            }
        })
        .map_err(|_| TerminalError::SpawnFailed)?;
    Ok((tx, handle))
}

struct WorkerEventSenders {
    lifecycle: mpsc::SyncSender<TerminalEvent>,
    snapshots: mpsc::SyncSender<TerminalEvent>,
}

fn run_reader(
    identity: TerminalIdentity,
    mut reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
    control: Arc<ProcessControlWithMaster>,
    initial_size: PtySize,
    shared: Arc<Mutex<WorkerShared>>,
    events: WorkerEventSenders,
) {
    let mut parser = vt100::Parser::new(
        initial_size.rows,
        initial_size.cols,
        EFFECTIVE_SCROLLBACK_ROWS,
    );
    send_lifecycle(&events.lifecycle, identity, TerminalEventKind::Ready);
    let mut buffer = vec![0_u8; MAX_OUTPUT_READ_BYTES];
    let mut read_failed = false;
    let mut seen_rows = 0_usize;
    let mut truncation_reported = false;
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => {
                if let Ok(mut state) = shared.lock()
                    && let Some((rows, columns)) = state.pending_size.take()
                {
                    parser.screen_mut().set_size(rows, columns);
                }
                seen_rows = seen_rows
                    .saturating_add(buffer[..size].iter().filter(|byte| **byte == b'\n').count());
                parser.process(&buffer[..size]);
                let sequence = {
                    let mut state = match shared.lock() {
                        Ok(state) => state,
                        Err(_) => return,
                    };
                    state.next_sequence.next();
                    let (rows, cols) = parser.screen().size();
                    let visible_rows = parser
                        .screen()
                        .rows(0, cols)
                        .map(|row| truncate_row(&row))
                        .collect::<Vec<_>>();
                    let snapshot = TerminalSnapshot {
                        identity,
                        sequence: state.next_sequence,
                        columns: cols,
                        rows,
                        visible_rows,
                        scrollback_rows: parser.screen().scrollback(),
                        truncated_rows: seen_rows.saturating_sub(
                            EFFECTIVE_SCROLLBACK_ROWS.saturating_add(rows as usize),
                        ),
                        title_hint: None,
                        cwd_hint: None,
                    };
                    state.snapshot = Some(snapshot);
                    state.next_sequence
                };
                let _ = events.snapshots.try_send(TerminalEvent {
                    identity,
                    sequence: TerminalEventSequence(0),
                    kind: TerminalEventKind::SnapshotChanged,
                });
                let omitted_rows = seen_rows.saturating_sub(
                    EFFECTIVE_SCROLLBACK_ROWS.saturating_add(parser.screen().size().0 as usize),
                );
                if omitted_rows > 0 && !truncation_reported {
                    truncation_reported = true;
                    send_lifecycle(
                        &events.lifecycle,
                        identity,
                        TerminalEventKind::OutputTruncated {
                            omitted_rows,
                            omitted_bytes: 0,
                        },
                    );
                }
                let _ = sequence;
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(_) => {
                read_failed = true;
                break;
            }
        }
    }
    if read_failed && !control.base.closing.load(Ordering::Acquire) {
        control.base.closing.store(true, Ordering::Release);
        control.base.signal_group(libc::SIGHUP);
        start_escalation(Arc::clone(&control));
        send_lifecycle(
            &events.lifecycle,
            identity,
            TerminalEventKind::Failed { code: "pty_read" },
        );
    }
    let status = child
        .try_wait()
        .ok()
        .flatten()
        .or_else(|| child.wait().ok());
    let status_kind = status
        .as_ref()
        .map(classify_exit)
        .unwrap_or(ExitClass::Unknown);
    send_lifecycle(
        &events.lifecycle,
        identity,
        TerminalEventKind::ChildExited {
            status: status_kind,
        },
    );
    let waited = status.is_some();
    let absent = control.base.process_group_absent();
    let child_absent = control.base.child_absent();
    if waited && absent && child_absent {
        send_lifecycle(
            &events.lifecycle,
            identity,
            TerminalEventKind::Closed {
                cleanup: CleanupProof::Reaped {
                    process_group_absent: absent,
                    child_absent,
                },
            },
        );
    } else {
        send_lifecycle(
            &events.lifecycle,
            identity,
            TerminalEventKind::Uncertain {
                code: "cleanup_unproven",
            },
        );
    }
}

fn cleanup_failed_spawn(control: &Arc<ProcessControlWithMaster>) -> bool {
    control.base.closing.store(true, Ordering::Release);
    control.base.signal_group(libc::SIGHUP);
    start_escalation(Arc::clone(control));
    let deadline = Instant::now() + CLOSE_DEADLINE;
    while Instant::now() < deadline {
        if control.base.process_group_absent() && control.base.child_absent() {
            return true;
        }
        thread::sleep(Duration::from_millis(10));
    }
    false
}

fn classify_exit(status: &portable_pty::ExitStatus) -> ExitClass {
    if status.success() {
        ExitClass::Success
    } else if status.signal().is_some() {
        ExitClass::Signaled
    } else {
        ExitClass::Failure
    }
}

fn start_escalation(control: Arc<ProcessControlWithMaster>) {
    if control.base.escalation_started.swap(true, Ordering::AcqRel) {
        return;
    }
    thread::Builder::new()
        .name("pho-terminal-close".into())
        .spawn(move || {
            thread::sleep(CLOSE_GRACE);
            if control.base.process_group_absent() {
                return;
            }
            control.base.signal_group(libc::SIGTERM);
            thread::sleep(CLOSE_TERM_GRACE);
            if !control.base.process_group_absent() {
                control.base.signal_group(libc::SIGKILL);
            }
        })
        .ok();
}

fn send_lifecycle(
    sender: &mpsc::SyncSender<TerminalEvent>,
    identity: TerminalIdentity,
    kind: TerminalEventKind,
) {
    // Lifecycle notifications are lossless within the bounded channel. Snapshot notifications
    // use a separate nonblocking channel so output flood cannot block process cleanup truth.
    let _ = sender.send(TerminalEvent {
        identity,
        sequence: TerminalEventSequence(0),
        kind,
    });
}

fn clamp_size(options: &TerminalLaunchOptions) -> Result<PtySize, TerminalError> {
    clamp_size_values(
        options.columns,
        options.rows,
        options.pixel_width,
        options.pixel_height,
    )
}

fn clamp_size_values(
    columns: u16,
    rows: u16,
    pixel_width: u16,
    pixel_height: u16,
) -> Result<PtySize, TerminalError> {
    if columns == 0 || rows == 0 || columns > MAX_COLUMNS || rows > MAX_ROWS {
        return Err(TerminalError::InvalidDimensions);
    }
    if pixel_width > 4096 || pixel_height > 4096 {
        return Err(TerminalError::InvalidDimensions);
    }
    Ok(PtySize {
        rows,
        cols: columns,
        pixel_width,
        pixel_height,
    })
}

fn validate_relative_path(value: &str) -> Result<(), TerminalError> {
    if value.len() > 4096 || value.contains('\0') || value.chars().any(char::is_control) {
        return Err(TerminalError::InvalidCwd);
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(TerminalError::InvalidCwd);
    }
    Ok(())
}

fn resolve_shell(explicit: Option<&Path>) -> Result<PathBuf, TerminalError> {
    let path = if let Some(path) = explicit {
        path.to_path_buf()
    } else {
        account_login_shell().unwrap_or_else(|| PathBuf::from("/bin/zsh"))
    };
    let metadata = std::fs::metadata(&path).map_err(|_| TerminalError::InvalidShell)?;
    if !path.is_absolute() || !metadata.is_file() || !is_executable(&metadata) {
        return Err(TerminalError::InvalidShell);
    }
    Ok(path)
}

#[cfg(unix)]
fn is_executable(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_metadata: &std::fs::Metadata) -> bool {
    true
}

#[cfg(unix)]
fn account_login_shell() -> Option<PathBuf> {
    // SAFETY: getpwuid returns a process-owned pointer valid until the next account lookup. We
    // copy the NUL-terminated shell string immediately and never retain the pointer.
    let record = unsafe { libc::getpwuid(libc::getuid()) };
    let shell = unsafe { record.as_ref() }?.pw_shell;
    if shell.is_null() {
        return None;
    }
    let shell = unsafe { CStr::from_ptr(shell) }.to_str().ok()?;
    (!shell.is_empty()).then(|| PathBuf::from(shell))
}

#[cfg(not(unix))]
fn account_login_shell() -> Option<PathBuf> {
    None
}

fn configure_environment(
    command: &mut CommandBuilder,
    cwd: &Path,
    shell: &Path,
) -> Result<(), TerminalError> {
    command.env_clear();
    let allowlist = [
        "HOME",
        "USER",
        "LOGNAME",
        "PATH",
        "LANG",
        "TMPDIR",
        "TERM_PROGRAM",
    ];
    let mut total = 0_usize;
    for key in allowlist {
        if is_sensitive_env_name(key) {
            continue;
        }
        if let Some(value) = std::env::var_os(key) {
            let value_bytes = value.to_string_lossy();
            if value_bytes.len() > MAX_ENV_VALUE_BYTES {
                continue;
            }
            total = total.saturating_add(key.len() + value_bytes.len());
            if total > MAX_TERMINAL_ENV_BYTES {
                break;
            }
            command.env(key, value);
        }
    }
    command.env("SHELL", shell);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Pho Code");
    command.env("PWD", cwd);
    Ok(())
}

fn is_sensitive_env_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    upper.starts_with("PHO_")
        || upper.contains("DEEPSEEK")
        || upper.contains("OPENAI_API_KEY")
        || upper.contains("API_KEY")
        || upper.contains("ACCESS_TOKEN")
        || upper.contains("SECRET")
        || upper.contains("CREDENTIAL")
        || upper.contains("KEYCHAIN")
}

fn truncate_row(row: &str) -> String {
    let mut bytes = 0_usize;
    let mut result = String::new();
    for character in row.chars() {
        let width = character.len_utf8();
        if bytes.saturating_add(width) > MAX_COLUMNS as usize * 4 {
            break;
        }
        result.push(character);
        bytes += width;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn binding(root: &Path) -> TerminalBinding {
        TerminalBinding::new(
            WorkspaceRegistrationId::new(),
            WorkspaceGeneration::new(),
            root.to_path_buf(),
            "",
        )
        .expect("valid binding")
    }

    #[test]
    fn dimensions_and_input_are_bounded() {
        assert!(clamp_size_values(0, 24, 0, 0).is_err());
        assert!(clamp_size_values(513, 24, 0, 0).is_err());
        assert!(clamp_size_values(80, 257, 0, 0).is_err());
        assert!(clamp_size_values(80, 24, 4097, 0).is_err());
    }

    #[test]
    fn binding_rejects_escape_and_non_directory() {
        let root = tempfile::tempdir().expect("tempdir");
        assert!(
            TerminalBinding::new(
                WorkspaceRegistrationId::new(),
                WorkspaceGeneration::new(),
                root.path().to_path_buf(),
                "../outside",
            )
            .is_err()
        );
        let file = root.path().join("file");
        fs::write(&file, "x").expect("write fixture");
        assert!(
            TerminalBinding::new(
                WorkspaceRegistrationId::new(),
                WorkspaceGeneration::new(),
                file,
                "",
            )
            .is_err()
        );
    }

    #[test]
    fn vt100_parser_handles_ansi_unicode_and_malformed_input() {
        let mut parser = vt100::Parser::new(4, 20, 32);
        parser.process(b"\x1b[31mhello\x1b[0m \xF0\x9F\x8C\x8D\x1b[999;999H\x1b[");
        assert!(parser.screen().contents().contains("hello"));
        assert_eq!(parser.screen().size(), (4, 20));
    }

    #[test]
    fn terminal_manager_rejects_stale_identity() {
        let root = tempfile::tempdir().expect("tempdir");
        let mut manager = TerminalManager::new();
        let identity = manager
            .create_terminal(binding(root.path()), TerminalLaunchOptions::default())
            .expect("spawn shell");
        let stale = TerminalIdentity {
            terminal_id: identity.terminal_id,
            generation: identity.generation.next(),
        };
        assert_eq!(
            manager.write_input(stale, b"echo no\n"),
            Err(TerminalError::StaleIdentity)
        );
        let _ = manager.close(identity, CloseReason::User);
        let _ = manager.shutdown_all(Duration::from_secs(3));
    }

    #[test]
    fn terminal_manager_enforces_eight_terminal_and_aggregate_bounds() {
        let root = tempfile::tempdir().expect("tempdir");
        let mut manager = TerminalManager::new();
        for _ in 0..MAX_TERMINALS {
            manager
                .create_terminal(binding(root.path()), TerminalLaunchOptions::default())
                .expect("spawn bounded terminal");
        }
        assert_eq!(manager.len(), MAX_TERMINALS);
        assert_eq!(
            manager.create_terminal(binding(root.path()), TerminalLaunchOptions::default()),
            Err(TerminalError::LimitReached)
        );
        assert!(
            EFFECTIVE_SCROLLBACK_ROWS
                .saturating_mul(ROW_BYTES_AT_MAX_WIDTH)
                .saturating_mul(MAX_TERMINALS)
                <= MAX_AGGREGATE_BYTES
        );
        assert!(manager.shutdown_all(Duration::from_secs(2)));
    }

    #[test]
    fn terminal_manager_runs_command_and_proves_cleanup() {
        let root = tempfile::tempdir().expect("tempdir");
        let mut manager = TerminalManager::new();
        let identity = manager
            .create_terminal(binding(root.path()), TerminalLaunchOptions::default())
            .expect("spawn shell");
        let ready_deadline = Instant::now() + Duration::from_secs(3);
        let mut ready = false;
        while Instant::now() < ready_deadline {
            while let Some(event) = manager.try_recv_event() {
                if event.identity == identity && matches!(event.kind, TerminalEventKind::Ready) {
                    ready = true;
                }
            }
            if ready {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(ready, "terminal did not become ready");
        manager
            .write_input(identity, b"printf 'PHO_TERMINAL_OK\\n'; exit\n")
            .expect("write command");
        let output_deadline = Instant::now() + Duration::from_secs(3);
        let mut observed = false;
        while Instant::now() < output_deadline {
            while manager.try_recv_event().is_some() {}
            observed = manager
                .snapshot(identity, None)
                .expect("snapshot")
                .is_some_and(|snapshot| {
                    snapshot
                        .visible_rows
                        .iter()
                        .any(|row| row.contains("PHO_TERMINAL_OK"))
                });
            if observed {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(observed, "terminal output was not projected");
        assert!(manager.shutdown_all(Duration::from_secs(2)));
    }

    #[test]
    fn terminal_resize_updates_pty_and_emulator_dimensions() {
        let root = tempfile::tempdir().expect("tempdir");
        let mut manager = TerminalManager::new();
        let identity = manager
            .create_terminal(binding(root.path()), TerminalLaunchOptions::default())
            .expect("spawn shell");
        let ready_deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < ready_deadline {
            if std::iter::from_fn(|| manager.try_recv_event()).any(|event| {
                event.identity == identity && matches!(event.kind, TerminalEventKind::Ready)
            }) {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        manager
            .resize(identity, 100, 30, 0, 0)
            .expect("resize terminal");
        manager
            .write_input(identity, b"printf 'PHO_RESIZED\\n'\n")
            .expect("trigger emulator update");
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut resized = false;
        while Instant::now() < deadline {
            while manager.try_recv_event().is_some() {}
            resized = manager
                .snapshot(identity, None)
                .expect("snapshot")
                .is_some_and(|snapshot| {
                    snapshot.columns == 100
                        && snapshot.rows == 30
                        && snapshot
                            .visible_rows
                            .iter()
                            .any(|row| row.contains("PHO_RESIZED"))
                });
            if resized {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(resized, "PTY and emulator did not publish the resized grid");
        assert!(manager.shutdown_all(Duration::from_secs(2)));
    }

    #[test]
    fn shell_environment_does_not_copy_known_credentials() {
        assert!(is_sensitive_env_name("DEEPSEEK_API_KEY"));
        assert!(is_sensitive_env_name("PHO_CODE_TEST_SECRET"));
        assert!(!is_sensitive_env_name("LANG"));
    }

    #[test]
    fn command_and_snapshot_debug_redact_terminal_bytes() {
        let identity = TerminalIdentity {
            terminal_id: TerminalId::new(),
            generation: TerminalGeneration::new(),
        };
        let command = TerminalCommand::WriteInput {
            identity,
            bytes: b"private-terminal-input".to_vec(),
        };
        let rendered = format!("{command:?}");
        assert!(!rendered.contains("private-terminal-input"));
        let snapshot = TerminalSnapshot {
            identity,
            sequence: TerminalEventSequence(1),
            columns: 80,
            rows: 24,
            visible_rows: vec!["private-terminal-output".into()],
            scrollback_rows: 0,
            truncated_rows: 0,
            title_hint: None,
            cwd_hint: None,
        };
        assert!(!format!("{snapshot:?}").contains("private-terminal-output"));
    }
}
