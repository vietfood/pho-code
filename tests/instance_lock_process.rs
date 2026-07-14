#![cfg(target_os = "macos")]

use std::path::PathBuf;
use std::time::{Duration, Instant};

use pho_code::app::instance_lock::InstanceGuard;

#[test]
fn child_lock_owner() {
    if std::env::var_os("PHO_CODE_LOCK_CHILD").is_none() {
        return;
    }
    let lock = PathBuf::from(std::env::var_os("PHO_CODE_LOCK_PATH").unwrap());
    let ready = PathBuf::from(std::env::var_os("PHO_CODE_READY_PATH").unwrap());
    let _guard = InstanceGuard::acquire(&lock).unwrap();
    std::fs::write(ready, b"ready").unwrap();
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[test]
fn forced_process_exit_releases_lock() {
    let directory = tempfile::tempdir().unwrap();
    let lock = directory.path().join("instance.lock");
    let ready = directory.path().join("ready");
    let mut child = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "child_lock_owner", "--nocapture"])
        .env("PHO_CODE_LOCK_CHILD", "1")
        .env("PHO_CODE_LOCK_PATH", &lock)
        .env("PHO_CODE_READY_PATH", &ready)
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while !ready.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(ready.exists(), "child did not acquire lock");
    assert!(InstanceGuard::acquire(&lock).is_err());
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(InstanceGuard::acquire(&lock).is_ok());
}
