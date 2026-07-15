use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write as _};
use std::os::fd::AsRawFd as _;
use std::time::Duration;

use tokio_util::sync::CancellationToken;

pub fn read_secret(
    prompt: &str,
    maximum_bytes: usize,
    cancellation: &CancellationToken,
) -> io::Result<String> {
    let mut terminal = open_terminal()?;
    terminal.write_all(prompt.as_bytes())?;
    terminal.flush()?;
    let guard = EchoGuard::disable(&terminal)?;
    let result = read_bounded_cancellable(&mut terminal, maximum_bytes, cancellation);
    drop(guard);
    terminal.write_all(b"\n")?;
    terminal.flush()?;
    result
}

pub fn read_prompt(maximum_bytes: usize, cancellation: &CancellationToken) -> io::Result<String> {
    let mut terminal = open_terminal()?;
    terminal.write_all(b"Prompt: ")?;
    terminal.flush()?;
    read_bounded_cancellable(&mut terminal, maximum_bytes, cancellation)
}

pub fn read_stdin_prompt(
    maximum_bytes: usize,
    cancellation: &CancellationToken,
) -> io::Result<String> {
    let mut input = OpenOptions::new().read(true).open("/dev/stdin")?;
    read_bounded_cancellable(&mut input, maximum_bytes, cancellation)
}

pub fn read_approval(summary: &str, cancellation: &CancellationToken) -> io::Result<bool> {
    let mut terminal = open_terminal()?;
    terminal.write_all(b"\nApproval required\n")?;
    let safe_summary = control_safe_terminal_text(summary);
    terminal.write_all(safe_summary.as_bytes())?;
    terminal.write_all(b"\nApprove once? Type `yes` to approve: ")?;
    terminal.flush()?;
    let response = read_bounded_cancellable(&mut terminal, 16, cancellation)?;
    Ok(response.eq_ignore_ascii_case("yes"))
}

fn control_safe_terminal_text(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for character in input.chars() {
        if character == '\n' {
            output.push(character);
        } else if character.is_control()
            || matches!(character as u32, 0x7f..=0x9f | 0x202a..=0x202e | 0x2066..=0x2069)
        {
            output.extend(character.escape_default());
        } else {
            output.push(character);
        }
    }
    output
}

fn open_terminal() -> io::Result<File> {
    OpenOptions::new().read(true).write(true).open("/dev/tty")
}

#[cfg(test)]
fn read_bounded(reader: &mut impl Read, maximum_bytes: usize) -> io::Result<String> {
    read_bounded_with(reader, maximum_bytes, || false)
}

fn read_bounded_cancellable(
    reader: &mut File,
    maximum_bytes: usize,
    cancellation: &CancellationToken,
) -> io::Result<String> {
    let _nonblocking = NonblockingGuard::enable(reader)?;
    read_bounded_with(reader, maximum_bytes, || cancellation.is_cancelled())
}

fn read_bounded_with(
    reader: &mut impl Read,
    maximum_bytes: usize,
    cancelled: impl Fn() -> bool,
) -> io::Result<String> {
    let mut bytes = Vec::with_capacity(maximum_bytes.min(4096));
    let mut one = [0_u8; 1];
    loop {
        if cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "input cancelled",
            ));
        }
        let count = match reader.read(&mut one) {
            Ok(count) => count,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(10));
                continue;
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        if count == 0 || one[0] == b'\n' {
            break;
        }
        if bytes.len() == maximum_bytes {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "input is too large",
            ));
        }
        bytes.push(one[0]);
    }
    if bytes.last() == Some(&b'\r') {
        bytes.pop();
    }
    if bytes.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "input is empty"));
    }
    String::from_utf8(bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "input is not UTF-8"))
}

struct NonblockingGuard {
    descriptor: i32,
    original_flags: i32,
}

impl NonblockingGuard {
    fn enable(file: &File) -> io::Result<Self> {
        let descriptor = file.as_raw_fd();
        // SAFETY: fcntl observes and updates flags on the live descriptor owned by `file`.
        let original_flags = unsafe { libc::fcntl(descriptor, libc::F_GETFL) };
        if original_flags < 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: the descriptor remains live for the guard lifetime and the flag mask preserves
        // all existing status flags while adding nonblocking reads.
        if unsafe { libc::fcntl(descriptor, libc::F_SETFL, original_flags | libc::O_NONBLOCK) } < 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            descriptor,
            original_flags,
        })
    }
}

impl Drop for NonblockingGuard {
    fn drop(&mut self) {
        // SAFETY: restoration targets the same live descriptor before its owning file is dropped.
        unsafe {
            libc::fcntl(self.descriptor, libc::F_SETFL, self.original_flags);
        }
    }
}

struct EchoGuard {
    descriptor: i32,
    original: libc::termios,
}

impl EchoGuard {
    fn disable(file: &File) -> io::Result<Self> {
        let descriptor = file.as_raw_fd();
        let mut original = std::mem::MaybeUninit::<libc::termios>::uninit();
        // SAFETY: tcgetattr initializes the provided termios for this live terminal descriptor.
        if unsafe { libc::tcgetattr(descriptor, original.as_mut_ptr()) } != 0 {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: the successful call above initialized the value.
        let original = unsafe { original.assume_init() };
        let mut hidden = original;
        hidden.c_lflag &= !libc::ECHO;
        // SAFETY: descriptor is live and hidden is a valid termios copied from the terminal.
        if unsafe { libc::tcsetattr(descriptor, libc::TCSAFLUSH, &hidden) } != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            descriptor,
            original,
        })
    }
}

impl Drop for EchoGuard {
    fn drop(&mut self) {
        // SAFETY: restoration uses the same live descriptor and the exact termios captured before mutation.
        unsafe {
            libc::tcsetattr(self.descriptor, libc::TCSAFLUSH, &self.original);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_reader_rejects_empty_invalid_utf8_and_excess() {
        assert!(read_bounded(&mut &b"\n"[..], 8).is_err());
        assert!(read_bounded(&mut &[0xff, b'\n'][..], 8).is_err());
        assert!(read_bounded(&mut &b"12345\n"[..], 4).is_err());
        assert_eq!(read_bounded(&mut &b"hello\n"[..], 8).unwrap(), "hello");
    }

    #[test]
    fn approval_text_preserves_newlines_and_escapes_terminal_controls() {
        assert_eq!(
            control_safe_terminal_text("first\nsecond\r\u{1b}[2J\u{202e}"),
            "first\nsecond\\r\\u{1b}[2J\\u{202e}"
        );
    }
}
