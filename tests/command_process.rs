use std::io::{BufRead as _, BufReader, Write as _};
use std::os::unix::process::CommandExt as _;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

fn pho() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_pho"));
    command.env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "missing");
    command
}

#[test]
fn help_version_and_invalid_command_do_not_require_runtime_startup() {
    let help = pho().arg("--help").env_remove("HOME").output().unwrap();
    assert!(help.status.success());
    assert!(String::from_utf8_lossy(&help.stdout).contains("pho chat --stdin"));
    assert!(String::from_utf8_lossy(&help.stdout).contains("pho chat --raw"));

    let version = pho().arg("--version").env_remove("HOME").output().unwrap();
    assert!(version.status.success());

    let invalid = pho()
        .args(["chat", "seeded-prompt-marker"])
        .env_remove("HOME")
        .output()
        .unwrap();
    assert_eq!(invalid.status.code(), Some(2));
    let diagnostic = String::from_utf8_lossy(&invalid.stderr);
    assert!(!diagnostic.contains("seeded-prompt-marker"));
}

#[test]
fn interactive_chat_never_guesses_a_mode_without_a_controlling_terminal() {
    let directory = tempfile::tempdir().unwrap();
    let mut command = pho();
    command
        .arg("chat")
        .env("HOME", directory.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // SAFETY: this runs after fork and before exec, performs only the async-signal-safe setsid
    // syscall, and intentionally detaches the child from the test runner's terminal.
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() < 0 {
                Err(std::io::Error::last_os_error())
            } else {
                Ok(())
            }
        });
    }
    let output = command.output().unwrap();
    assert_eq!(
        output.status.code(),
        Some(2),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stdout.is_empty());
    let diagnostic = String::from_utf8_lossy(&output.stderr);
    assert!(diagnostic.contains("controlling terminal"));
    assert!(diagnostic.contains("pho chat --stdin"));
    assert!(!diagnostic.contains("\u{1b}["));
}

#[test]
fn login_rejects_secret_argument_and_non_tty_input() {
    let argument = pho().args(["login", "seeded-key-marker"]).output().unwrap();
    assert_eq!(argument.status.code(), Some(2));
    assert!(!String::from_utf8_lossy(&argument.stderr).contains("seeded-key-marker"));

    let directory = tempfile::tempdir().unwrap();
    let no_tty = pho()
        .arg("login")
        .env("HOME", directory.path())
        .stdin(Stdio::piped())
        .output()
        .unwrap();
    assert_eq!(no_tty.status.code(), Some(2));
}

#[test]
fn explicit_stdin_is_bounded_but_missing_credential_wins_before_prompt_read() {
    let directory = tempfile::tempdir().unwrap();
    let mut child = pho()
        .args(["chat", "--stdin"])
        .env("HOME", directory.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"seeded-prompt-marker\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert_eq!(output.status.code(), Some(3));
    assert!(!String::from_utf8_lossy(&output.stderr).contains("seeded-prompt-marker"));
}

#[test]
fn sigint_cancels_while_waiting_for_stdin_prompt() {
    let directory = tempfile::tempdir().unwrap();
    let mut child = pho()
        .args(["chat", "--stdin"])
        .env("HOME", directory.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env("PHO_CODE_TEST_INPUT_READY", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let input = child.stdin.take().unwrap();
    let mut stderr = BufReader::new(child.stderr.take().unwrap());
    let mut ready = String::new();
    stderr.read_line(&mut ready).unwrap();
    assert_eq!(ready.trim(), "pho-test-input-ready");
    // SAFETY: the child PID names the live process owned by this test.
    assert_eq!(unsafe { libc::kill(child.id() as i32, libc::SIGINT) }, 0);
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("pho did not stop after pre-send SIGINT");
        }
        thread::sleep(Duration::from_millis(20));
    };
    drop(input);
    assert_eq!(status.code(), Some(130));
}

#[cfg(target_os = "macos")]
#[test]
fn full_screen_chat_restores_exact_terminal_mode_on_idle_exit() {
    use std::fs::File;
    use std::io::Read as _;
    use std::os::fd::{AsRawFd as _, FromRawFd as _};

    let mut master_fd = -1;
    let mut slave_fd = -1;
    let mut window_size = libc::winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    // SAFETY: openpty initializes both descriptors; null termios requests system defaults and the
    // provided window size creates a supported 80x24 terminal.
    assert_eq!(
        unsafe {
            libc::openpty(
                &mut master_fd,
                &mut slave_fd,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut window_size,
            )
        },
        0
    );
    // SAFETY: openpty returned unique owned descriptors.
    let mut master = unsafe { File::from_raw_fd(master_fd) };
    // SAFETY: openpty returned unique owned descriptors.
    let slave = unsafe { File::from_raw_fd(slave_fd) };
    let original = terminal_attributes(slave.as_raw_fd());
    let directory = tempfile::tempdir().unwrap();
    let mut command = pho();
    command
        .arg("chat")
        .env("HOME", directory.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env("PHO_CODE_TEST_TUI_RESTORE_READY", "1");
    let child_master = master.as_raw_fd();
    let child_slave = slave.as_raw_fd();
    // SAFETY: the closure performs only async-signal-safe session, ioctl, dup2, and close syscalls
    // between fork and exec. The parent retains its own references to both descriptors.
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() < 0 || libc::ioctl(child_slave, libc::TIOCSCTTY.into(), 0) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            for target in [libc::STDIN_FILENO, libc::STDOUT_FILENO, libc::STDERR_FILENO] {
                if libc::dup2(child_slave, target) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
            }
            libc::close(child_master);
            if child_slave > libc::STDERR_FILENO {
                libc::close(child_slave);
            }
            Ok(())
        });
    }
    let mut child = command.spawn().unwrap();

    let master_flags = unsafe { libc::fcntl(master.as_raw_fd(), libc::F_GETFL) };
    assert!(master_flags >= 0);
    // SAFETY: the live master descriptor keeps its flags and gains nonblocking reads for the
    // minimal terminal-emulation loop and final drain.
    assert_eq!(
        unsafe {
            libc::fcntl(
                master.as_raw_fd(),
                libc::F_SETFL,
                master_flags | libc::O_NONBLOCK,
            )
        },
        0
    );

    let raw_deadline = Instant::now() + Duration::from_secs(3);
    let mut startup_output = Vec::new();
    let mut cursor_queries_answered = 0_usize;
    loop {
        let mut bytes = [0_u8; 4096];
        loop {
            match master.read(&mut bytes) {
                Ok(0) => break,
                Ok(count) => startup_output.extend_from_slice(&bytes[..count]),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(error) => panic!("failed to read PTY startup output: {error}"),
            }
        }
        let cursor_queries = startup_output
            .windows(4)
            .filter(|window| *window == b"\x1b[6n")
            .count();
        while cursor_queries_answered < cursor_queries {
            master.write_all(b"\x1b[1;1R").unwrap();
            cursor_queries_answered += 1;
        }
        if let Some(status) = child.try_wait().unwrap() {
            let _ = master.read_to_end(&mut startup_output);
            panic!(
                "TUI exited before raw mode: {status:?}: {}",
                String::from_utf8_lossy(&startup_output)
            );
        }
        let current = terminal_attributes(slave.as_raw_fd());
        if current.local_flags & (libc::ICANON | libc::ECHO) == 0 {
            break;
        }
        assert!(
            Instant::now() < raw_deadline,
            "TUI did not enter raw mode; output: {}",
            String::from_utf8_lossy(&startup_output)
        );
        thread::sleep(Duration::from_millis(10));
    }
    master.write_all(&[0x04]).unwrap();

    let restore_deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let mut bytes = [0_u8; 4096];
        match master.read(&mut bytes) {
            Ok(count) => startup_output.extend_from_slice(&bytes[..count]),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(error) => panic!("failed to read restoration marker: {error}"),
        }
        let cursor_queries = startup_output
            .windows(4)
            .filter(|window| *window == b"\x1b[6n")
            .count();
        while cursor_queries_answered < cursor_queries {
            master.write_all(b"\x1b[1;1R").unwrap();
            cursor_queries_answered += 1;
        }
        if startup_output
            .windows(b"pho-test-tui-restored".len())
            .any(|window| window == b"pho-test-tui-restored")
        {
            break;
        }
        assert!(
            Instant::now() < restore_deadline,
            "TUI did not report restoration; output: {}",
            String::from_utf8_lossy(&startup_output)
        );
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(terminal_attributes(slave.as_raw_fd()), original);
    assert!(
        startup_output
            .windows(b"\x1b[?1049h".len())
            .any(|window| window == b"\x1b[?1049h"),
        "TUI did not enter the alternate screen"
    );
    assert!(
        startup_output
            .windows(b"\x1b[?1049l".len())
            .any(|window| window == b"\x1b[?1049l"),
        "TUI did not leave the alternate screen"
    );

    let exit_deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= exit_deadline {
            child.kill().unwrap();
            panic!("interactive chat did not exit after idle Ctrl+D");
        }
        thread::sleep(Duration::from_millis(10));
    };
    assert!(status.success(), "{status:?}");

    let mut output = startup_output;
    match master.read_to_end(&mut output) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
        Err(error) => panic!("failed to drain PTY output: {error}"),
    }
    assert!(
        output.contains(&0x1b),
        "interactive output contained no terminal controls"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn raw_chat_uses_the_controlling_terminal_without_cursor_sequences() {
    use std::io::Write as _;
    use std::os::fd::AsRawFd as _;

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_http_request_body(&mut stream);
        let body = concat!(
            "data: {\"id\":\"raw-fixture\",\"model\":\"deepseek-v4-flash\",",
            "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"raw-final\"},",
            "\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,",
            "\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":1,",
            "\"completion_tokens\":1,\"total_tokens\":2}}\n\n",
            "data: [DONE]\n\n"
        );
        write!(
            stream,
            "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        request
    });

    let (mut master, slave) = open_test_pty();
    let directory = tempfile::tempdir().unwrap();
    let mut command = pho();
    command
        .args(["chat", "--raw"])
        .env("HOME", directory.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        );
    attach_to_pty(&mut command, master.as_raw_fd(), slave.as_raw_fd());
    let mut child = command.spawn().unwrap();

    let flags = unsafe { libc::fcntl(master.as_raw_fd(), libc::F_GETFL) };
    assert!(flags >= 0);
    // SAFETY: the live master descriptor keeps its flags and gains nonblocking reads for driving
    // and draining this PTY fixture.
    assert_eq!(
        unsafe { libc::fcntl(master.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) },
        0
    );
    let mut output = Vec::new();
    let prompt_deadline = Instant::now() + Duration::from_secs(3);
    loop {
        drain_nonblocking(&mut master, &mut output);
        if output
            .windows(b"Prompt: ".len())
            .any(|bytes| bytes == b"Prompt: ")
        {
            break;
        }
        if let Some(status) = child.try_wait().unwrap() {
            panic!(
                "raw child exited before prompting: {status:?}: {}",
                String::from_utf8_lossy(&output)
            );
        }
        assert!(Instant::now() < prompt_deadline, "raw child did not prompt");
        thread::sleep(Duration::from_millis(10));
    }
    master.write_all(b"raw fixture prompt\n").unwrap();
    let exit_deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        drain_nonblocking(&mut master, &mut output);
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= exit_deadline {
            child.kill().unwrap();
            panic!(
                "raw child did not exit: {}",
                String::from_utf8_lossy(&output)
            );
        }
        thread::sleep(Duration::from_millis(10));
    };
    assert!(status.success(), "{status:?}");
    let request = server.join().unwrap();
    let request: serde_json::Value = serde_json::from_slice(&request).unwrap();
    assert_eq!(request["messages"][0]["content"], "raw fixture prompt");

    drain_nonblocking(&mut master, &mut output);
    let rendered = String::from_utf8_lossy(&output);
    assert!(rendered.contains("raw-final"), "{rendered}");
    assert!(rendered.contains("usage (turn total)"), "{rendered}");
    assert!(!output.windows(2).any(|bytes| bytes == b"\x1b["));

    // Keep the slave alive until output has been drained from the master.
    drop(slave);
}

#[cfg(target_os = "macos")]
#[test]
fn interactive_chat_runs_repeated_independent_fixture_turns() {
    use std::io::Write as _;
    use std::os::fd::AsRawFd as _;

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let mut requests = Vec::new();
        for (id, answer) in [("tui-1", "tui-first"), ("tui-2", "tui-second")] {
            let (mut stream, _) = listener.accept().unwrap();
            requests.push(read_http_request_body(&mut stream));
            let body = format!(
                "data: {{\"id\":\"{id}\",\"model\":\"deepseek-v4-flash\",\"choices\":[{{\"index\":0,\"delta\":{{\"content\":\"{answer}\"}},\"finish_reason\":\"stop\"}}],\"usage\":{{\"prompt_tokens\":1,\"prompt_cache_hit_tokens\":0,\"prompt_cache_miss_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}}}\n\ndata: [DONE]\n\n"
            );
            write!(
                stream,
                "HTTP/1.1 200 fixture\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        }
        requests
    });

    let (mut master, slave) = open_test_pty();
    let directory = tempfile::tempdir().unwrap();
    let mut command = pho();
    command
        .arg("chat")
        .env("HOME", directory.path())
        .env("PHO_CODE_TEST_MEMORY_CREDENTIALS", "ready")
        .env("PHO_CODE_TEST_TUI_RESTORE_READY", "1")
        .env(
            "PHO_CODE_TEST_CHAT_ENDPOINT",
            format!("http://{address}/chat/completions"),
        );
    attach_to_pty(&mut command, master.as_raw_fd(), slave.as_raw_fd());
    let mut child = command.spawn().unwrap();
    let flags = unsafe { libc::fcntl(master.as_raw_fd(), libc::F_GETFL) };
    assert!(flags >= 0);
    // SAFETY: the live PTY master gains nonblocking reads for the terminal-emulation loop.
    assert_eq!(
        unsafe { libc::fcntl(master.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) },
        0
    );
    let mut output = Vec::new();
    let mut cursor_queries_answered = 0_usize;
    pump_pty_until(
        &mut master,
        &mut child,
        &mut output,
        &mut cursor_queries_answered,
        b"deepseek-v4-flash",
        Duration::from_secs(3),
    );
    master.write_all(b"first fixture prompt\r").unwrap();
    pump_pty_until(
        &mut master,
        &mut child,
        &mut output,
        &mut cursor_queries_answered,
        b"tui-first",
        Duration::from_secs(5),
    );
    let narrow = libc::winsize {
        ws_row: 20,
        ws_col: 52,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    // SAFETY: the live PTY slave accepts a bounded window-size update for resize qualification.
    assert_eq!(
        unsafe { libc::ioctl(slave.as_raw_fd(), libc::TIOCSWINSZ, &narrow) },
        0
    );
    // SAFETY: the child PID identifies the live TUI process and SIGWINCH has no data payload.
    assert_eq!(unsafe { libc::kill(child.id() as i32, libc::SIGWINCH) }, 0);
    master.write_all(b"second fixture prompt\r").unwrap();
    pump_pty_until(
        &mut master,
        &mut child,
        &mut output,
        &mut cursor_queries_answered,
        b"tui-second",
        Duration::from_secs(5),
    );
    master.write_all(&[0x04]).unwrap();
    pump_pty_until(
        &mut master,
        &mut child,
        &mut output,
        &mut cursor_queries_answered,
        b"pho-test-tui-restored",
        Duration::from_secs(3),
    );
    let status = wait_for_process(&mut child, Duration::from_secs(3));
    assert!(status.success(), "{status:?}");

    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 2);
    for (request, prompt) in requests
        .iter()
        .zip(["first fixture prompt", "second fixture prompt"])
    {
        let request: serde_json::Value = serde_json::from_slice(request).unwrap();
        assert_eq!(request["messages"].as_array().unwrap().len(), 1);
        assert_eq!(request["messages"][0]["content"], prompt);
    }
    drop(slave);
}

#[cfg(target_os = "macos")]
fn open_test_pty() -> (std::fs::File, std::fs::File) {
    use std::os::fd::FromRawFd as _;

    let mut master = -1;
    let mut slave = -1;
    let mut window_size = libc::winsize {
        ws_row: 24,
        ws_col: 80,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    // SAFETY: openpty initializes both returned descriptors and consumes neither pointer.
    assert_eq!(
        unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut window_size,
            )
        },
        0
    );
    // SAFETY: openpty returned two unique owned descriptors.
    unsafe {
        (
            std::fs::File::from_raw_fd(master),
            std::fs::File::from_raw_fd(slave),
        )
    }
}

#[cfg(target_os = "macos")]
fn attach_to_pty(command: &mut Command, master: i32, slave: i32) {
    // SAFETY: the closure performs only async-signal-safe session, ioctl, dup2, and close syscalls
    // between fork and exec. The parent retains its own descriptor references.
    unsafe {
        command.pre_exec(move || {
            if libc::setsid() < 0 || libc::ioctl(slave, libc::TIOCSCTTY.into(), 0) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            for target in [libc::STDIN_FILENO, libc::STDOUT_FILENO, libc::STDERR_FILENO] {
                if libc::dup2(slave, target) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
            }
            libc::close(master);
            if slave > libc::STDERR_FILENO {
                libc::close(slave);
            }
            Ok(())
        });
    }
}

#[cfg(target_os = "macos")]
fn drain_nonblocking(input: &mut std::fs::File, output: &mut Vec<u8>) {
    use std::io::Read as _;

    let mut bytes = [0_u8; 4096];
    loop {
        match input.read(&mut bytes) {
            Ok(0) => return,
            Ok(count) => output.extend_from_slice(&bytes[..count]),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => return,
            Err(error) => panic!("failed to drain PTY: {error}"),
        }
    }
}

#[cfg(target_os = "macos")]
fn pump_pty_until(
    master: &mut std::fs::File,
    child: &mut std::process::Child,
    output: &mut Vec<u8>,
    cursor_queries_answered: &mut usize,
    needle: &[u8],
    timeout: Duration,
) {
    use std::io::Write as _;

    let deadline = Instant::now() + timeout;
    loop {
        drain_nonblocking(master, output);
        let cursor_queries = output
            .windows(4)
            .filter(|window| *window == b"\x1b[6n")
            .count();
        while *cursor_queries_answered < cursor_queries {
            master.write_all(b"\x1b[1;1R").unwrap();
            *cursor_queries_answered += 1;
        }
        if output.windows(needle.len()).any(|window| window == needle) {
            return;
        }
        if let Some(status) = child.try_wait().unwrap() {
            panic!(
                "PTY child exited before expected output {needle:?}: {status:?}: {}",
                String::from_utf8_lossy(output)
            );
        }
        assert!(
            Instant::now() < deadline,
            "PTY output did not contain {needle:?}: {}",
            String::from_utf8_lossy(output)
        );
        thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(target_os = "macos")]
fn wait_for_process(
    child: &mut std::process::Child,
    timeout: Duration,
) -> std::process::ExitStatus {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if Instant::now() >= deadline {
            child.kill().unwrap();
            panic!("PTY child did not exit before timeout");
        }
        thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(target_os = "macos")]
fn read_http_request_body(stream: &mut std::net::TcpStream) -> Vec<u8> {
    use std::io::Read as _;

    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let count = stream.read(&mut chunk).unwrap();
        bytes.extend_from_slice(&chunk[..count]);
        let Some(header_end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") else {
            continue;
        };
        let body_start = header_end + 4;
        let headers = String::from_utf8_lossy(&bytes[..header_end]);
        let content_length = headers
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .and_then(|value| value.trim().parse::<usize>().ok())
            })
            .unwrap();
        if bytes.len() >= body_start + content_length {
            return bytes[body_start..body_start + content_length].to_vec();
        }
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Eq, PartialEq)]
struct TerminalAttributes {
    input_flags: libc::tcflag_t,
    output_flags: libc::tcflag_t,
    control_flags: libc::tcflag_t,
    local_flags: libc::tcflag_t,
    control_characters: [libc::cc_t; libc::NCCS],
    input_speed: libc::speed_t,
    output_speed: libc::speed_t,
}

#[cfg(target_os = "macos")]
fn terminal_attributes(descriptor: i32) -> TerminalAttributes {
    let mut value = std::mem::MaybeUninit::<libc::termios>::uninit();
    // SAFETY: tcgetattr initializes the termios value for the live PTY slave descriptor.
    assert_eq!(
        unsafe { libc::tcgetattr(descriptor, value.as_mut_ptr()) },
        0
    );
    // SAFETY: the successful tcgetattr call initialized the value.
    let value = unsafe { value.assume_init() };
    TerminalAttributes {
        input_flags: value.c_iflag,
        output_flags: value.c_oflag,
        control_flags: value.c_cflag,
        local_flags: value.c_lflag,
        control_characters: value.c_cc,
        input_speed: value.c_ispeed,
        output_speed: value.c_ospeed,
    }
}
