use std::fs::{File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};

pub struct InstanceGuard {
    file: File,
}

impl InstanceGuard {
    pub fn acquire(path: &Path) -> io::Result<Self> {
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("lock path has no parent"))?;
        std::fs::create_dir_all(parent)?;
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        // SAFETY: flock only observes the valid descriptor owned by `file`; the descriptor
        // remains open for the full guard lifetime and the OS releases the lock on close.
        let result = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if result != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { file })
    }
}

pub fn default_lock_path() -> io::Result<PathBuf> {
    let home = std::env::var_os("HOME")
        .ok_or_else(|| io::Error::other("home directory is unavailable"))?;
    Ok(PathBuf::from(home).join("Library/Application Support/Pho Code/instance.lock"))
}

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        // SAFETY: the descriptor is still valid during Drop. Unlock failure is non-actionable
        // because close immediately releases the advisory lock as well.
        unsafe {
            libc::flock(self.file.as_raw_fd(), libc::LOCK_UN);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_owner_is_rejected_and_drop_releases_lock() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("instance.lock");
        let first = InstanceGuard::acquire(&path).unwrap();
        assert!(InstanceGuard::acquire(&path).is_err());
        drop(first);
        assert!(InstanceGuard::acquire(&path).is_ok());
    }
}
