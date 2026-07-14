use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write as _};
use std::os::fd::AsRawFd as _;

pub fn read_secret(prompt: &str, maximum_bytes: usize) -> io::Result<String> {
    let mut terminal = open_terminal()?;
    terminal.write_all(prompt.as_bytes())?;
    terminal.flush()?;
    let guard = EchoGuard::disable(&terminal)?;
    let result = read_bounded(&mut terminal, maximum_bytes);
    drop(guard);
    terminal.write_all(b"\n")?;
    terminal.flush()?;
    result
}

pub fn read_prompt(maximum_bytes: usize) -> io::Result<String> {
    let mut terminal = open_terminal()?;
    terminal.write_all(b"Prompt: ")?;
    terminal.flush()?;
    read_bounded(&mut terminal, maximum_bytes)
}

pub fn read_stdin_prompt(maximum_bytes: usize) -> io::Result<String> {
    read_bounded(&mut io::stdin().lock(), maximum_bytes)
}

fn open_terminal() -> io::Result<File> {
    OpenOptions::new().read(true).write(true).open("/dev/tty")
}

fn read_bounded(reader: &mut impl Read, maximum_bytes: usize) -> io::Result<String> {
    let mut bytes = Vec::with_capacity(maximum_bytes.min(4096));
    let mut one = [0_u8; 1];
    loop {
        let count = reader.read(&mut one)?;
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
}
