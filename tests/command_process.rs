use std::io::Write as _;
use std::process::{Command, Stdio};

fn pho() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_pho"));
    command.env("PHO_CODE_TEST_KEYCHAIN_SUFFIX", "command-process-fixture");
    command
}

#[test]
fn help_version_and_invalid_command_do_not_require_runtime_startup() {
    let help = pho().arg("--help").env_remove("HOME").output().unwrap();
    assert!(help.status.success());
    assert!(String::from_utf8_lossy(&help.stdout).contains("pho chat --stdin"));

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
