use std::ffi::OsStr;
#[cfg(unix)]
use std::ffi::{CStr, CString};
use std::fs::{File, OpenOptions};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

#[cfg(unix)]
use std::os::fd::{AsRawFd as _, FromRawFd as _, IntoRawFd as _};
#[cfg(unix)]
use std::os::unix::fs::MetadataExt as _;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt as _;

#[derive(Clone, Debug)]
pub struct Workspace {
    root: PathBuf,
    root_directory: Arc<File>,
    #[cfg(unix)]
    root_identity: (u64, u64),
}

impl Workspace {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let root = std::fs::canonicalize(root).map_err(|_| WorkspaceError::Unavailable)?;
        if !root.is_dir() {
            return Err(WorkspaceError::Unavailable);
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        options.custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC);
        let root_directory = options
            .open(&root)
            .map_err(|_| WorkspaceError::Unavailable)?;
        #[cfg(unix)]
        let root_identity = directory_identity(&root_directory)?;
        Ok(Self {
            root,
            root_directory: Arc::new(root_directory),
            #[cfg(unix)]
            root_identity,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn ensure_current(&self) -> Result<(), WorkspaceError> {
        #[cfg(unix)]
        {
            let metadata = std::fs::symlink_metadata(&self.root)
                .map_err(|_| WorkspaceError::WorkspaceChanged)?;
            if metadata.file_type().is_symlink()
                || !metadata.is_dir()
                || (metadata.dev(), metadata.ino()) != self.root_identity
            {
                return Err(WorkspaceError::WorkspaceChanged);
            }
            Ok(())
        }
        #[cfg(not(unix))]
        {
            let current =
                std::fs::canonicalize(&self.root).map_err(|_| WorkspaceError::WorkspaceChanged)?;
            if current == self.root {
                Ok(())
            } else {
                Err(WorkspaceError::WorkspaceChanged)
            }
        }
    }

    pub fn enforce_entry_limit(&self, maximum: usize) -> Result<usize, WorkspaceError> {
        self.ensure_current()?;
        #[cfg(unix)]
        {
            let mut directories = vec![
                self.root_directory
                    .try_clone()
                    .map_err(|_| WorkspaceError::Unavailable)?,
            ];
            let mut entries = 0_usize;
            while let Some(directory) = directories.pop() {
                let duplicate = directory
                    .try_clone()
                    .map_err(|_| WorkspaceError::Unavailable)?
                    .into_raw_fd();
                // Directory clones share an offset; rewind the duplicate before handing it to
                // fdopendir so repeated preflights remain deterministic.
                // SAFETY: `duplicate` is a live directory descriptor.
                if unsafe { libc::lseek(duplicate, 0, libc::SEEK_SET) } < 0 {
                    unsafe { libc::close(duplicate) };
                    return Err(WorkspaceError::Unavailable);
                }
                // SAFETY: fdopendir takes ownership of the duplicated descriptor.
                let stream = unsafe { libc::fdopendir(duplicate) };
                if stream.is_null() {
                    // SAFETY: fdopendir failed and did not take ownership.
                    unsafe { libc::close(duplicate) };
                    return Err(WorkspaceError::Unavailable);
                }
                loop {
                    clear_errno();
                    // SAFETY: `stream` remains live until closed below.
                    let entry = unsafe { libc::readdir(stream) };
                    if entry.is_null() {
                        if current_errno() != 0 {
                            // SAFETY: `stream` is live and owned by this function.
                            unsafe { libc::closedir(stream) };
                            return Err(WorkspaceError::Unavailable);
                        }
                        break;
                    }
                    // SAFETY: readdir returned a live dirent with a NUL-terminated d_name.
                    let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
                    if name.to_bytes() == b"." || name.to_bytes() == b".." {
                        continue;
                    }
                    entries = entries
                        .checked_add(1)
                        .ok_or(WorkspaceError::LimitExceeded)?;
                    if entries > maximum {
                        // SAFETY: `stream` is live and owned by this function.
                        unsafe { libc::closedir(stream) };
                        return Err(WorkspaceError::LimitExceeded);
                    }
                    let mut metadata = std::mem::MaybeUninit::<libc::stat>::uninit();
                    // SAFETY: `name` is NUL-terminated and output points to valid storage.
                    let result = unsafe {
                        libc::fstatat(
                            directory.as_raw_fd(),
                            name.as_ptr(),
                            metadata.as_mut_ptr(),
                            libc::AT_SYMLINK_NOFOLLOW,
                        )
                    };
                    if result != 0 {
                        // A concurrent rename is safe to skip; permission and I/O failures are not.
                        if current_errno() == libc::ENOENT {
                            continue;
                        }
                        unsafe { libc::closedir(stream) };
                        return Err(WorkspaceError::Unavailable);
                    }
                    // SAFETY: fstatat initialized metadata on success.
                    let metadata = unsafe { metadata.assume_init() };
                    if metadata.st_mode & libc::S_IFMT != libc::S_IFDIR {
                        continue;
                    }
                    let flags =
                        libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_DIRECTORY;
                    // SAFETY: `directory` is live and `name` is NUL-terminated.
                    let child =
                        unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
                    if child >= 0 {
                        // SAFETY: openat returned an owned descriptor.
                        directories.push(unsafe { File::from_raw_fd(child) });
                    } else if current_errno() != libc::ENOENT {
                        unsafe { libc::closedir(stream) };
                        return Err(WorkspaceError::Unavailable);
                    }
                }
                // SAFETY: `stream` is live and owned by this function.
                if unsafe { libc::closedir(stream) } != 0 {
                    return Err(WorkspaceError::Unavailable);
                }
            }
            Ok(entries)
        }
        #[cfg(not(unix))]
        {
            let _ = maximum;
            Err(WorkspaceError::Unavailable)
        }
    }

    pub fn resolve_existing(&self, relative: &str) -> Result<ResolvedPath, WorkspaceError> {
        self.ensure_current()?;
        let display = validate_relative(relative)?;
        let joined = self.root.join(&display);
        let metadata = std::fs::symlink_metadata(&joined).map_err(|_| WorkspaceError::Missing)?;
        if metadata.file_type().is_symlink() {
            return Err(WorkspaceError::UnsafeSymlink);
        }
        let absolute = std::fs::canonicalize(&joined).map_err(|_| WorkspaceError::Missing)?;
        self.ensure_contained(&absolute)?;
        Ok(ResolvedPath { display, absolute })
    }

    pub fn open_file(&self, relative: &str) -> Result<(ResolvedPath, File), WorkspaceError> {
        self.ensure_current()?;
        let display = validate_relative(relative)?;
        #[cfg(unix)]
        {
            let components = Path::new(&display).components().collect::<Vec<_>>();
            let mut directory = self
                .root_directory
                .try_clone()
                .map_err(|_| WorkspaceError::Unavailable)?;
            for (index, component) in components.iter().enumerate() {
                let Component::Normal(name) = component else {
                    return Err(WorkspaceError::InvalidPath);
                };
                use std::os::unix::ffi::OsStrExt as _;
                let name = std::ffi::CString::new(name.as_bytes())
                    .map_err(|_| WorkspaceError::InvalidPath)?;
                let final_component = index + 1 == components.len();
                let flags = libc::O_RDONLY
                    | libc::O_NOFOLLOW
                    | libc::O_CLOEXEC
                    | if final_component {
                        0
                    } else {
                        libc::O_DIRECTORY
                    };
                // SAFETY: `directory` is live, `name` is NUL-terminated, and ownership of a
                // successful descriptor is immediately transferred to `File`.
                let descriptor =
                    unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
                if descriptor < 0 {
                    return Err(match std::io::Error::last_os_error().raw_os_error() {
                        Some(libc::ELOOP) => WorkspaceError::UnsafeSymlink,
                        _ => WorkspaceError::Missing,
                    });
                }
                // SAFETY: openat returned a new owned descriptor.
                let opened = unsafe { File::from_raw_fd(descriptor) };
                if final_component {
                    let metadata = opened.metadata().map_err(|_| WorkspaceError::Unavailable)?;
                    if !metadata.is_file() {
                        return Err(WorkspaceError::InvalidPath);
                    }
                    return Ok((
                        ResolvedPath {
                            display,
                            absolute: self.root.join(relative),
                        },
                        opened,
                    ));
                }
                directory = opened;
            }
            Err(WorkspaceError::InvalidPath)
        }
        #[cfg(not(unix))]
        {
            let resolved = self.resolve_existing(&display)?;
            let file = File::open(&resolved.absolute).map_err(|_| WorkspaceError::Missing)?;
            Ok((resolved, file))
        }
    }

    pub fn open_directory(&self, relative: &str) -> Result<(String, File), WorkspaceError> {
        self.ensure_current()?;
        if relative == "." {
            return self
                .root_directory
                .try_clone()
                .map(|directory| (".".into(), directory))
                .map_err(|_| WorkspaceError::Unavailable);
        }
        let display = validate_relative(relative)?;
        #[cfg(unix)]
        {
            let mut directory = self
                .root_directory
                .try_clone()
                .map_err(|_| WorkspaceError::Unavailable)?;
            for component in Path::new(&display).components() {
                let Component::Normal(name) = component else {
                    return Err(WorkspaceError::InvalidPath);
                };
                use std::os::unix::ffi::OsStrExt as _;
                let name = std::ffi::CString::new(name.as_bytes())
                    .map_err(|_| WorkspaceError::InvalidPath)?;
                let flags = libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_DIRECTORY;
                // SAFETY: `directory` is live and `name` is a valid NUL-terminated component.
                let descriptor =
                    unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
                if descriptor < 0 {
                    return Err(match std::io::Error::last_os_error().raw_os_error() {
                        Some(libc::ELOOP) => WorkspaceError::UnsafeSymlink,
                        _ => WorkspaceError::Missing,
                    });
                }
                // SAFETY: openat returned a new owned descriptor.
                directory = unsafe { File::from_raw_fd(descriptor) };
            }
            Ok((display, directory))
        }
        #[cfg(not(unix))]
        {
            let resolved = self.resolve_existing(&display)?;
            if !resolved.absolute.is_dir() {
                return Err(WorkspaceError::InvalidPath);
            }
            let directory = File::open(&resolved.absolute).map_err(|_| WorkspaceError::Missing)?;
            Ok((display, directory))
        }
    }

    #[cfg(unix)]
    pub(crate) fn open_parent(&self, relative: &str) -> Result<MutationTarget, WorkspaceError> {
        use std::os::unix::ffi::OsStrExt as _;

        self.ensure_current()?;
        let display = validate_relative(relative)?;
        let path = Path::new(&display);
        let name = path.file_name().ok_or(WorkspaceError::InvalidPath)?;
        let name = CString::new(name.as_bytes()).map_err(|_| WorkspaceError::InvalidPath)?;
        let mut parent = self
            .root_directory
            .try_clone()
            .map_err(|_| WorkspaceError::Unavailable)?;
        if let Some(components) = path.parent() {
            for component in components.components() {
                let Component::Normal(component) = component else {
                    continue;
                };
                let component =
                    CString::new(component.as_bytes()).map_err(|_| WorkspaceError::InvalidPath)?;
                let flags = libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_DIRECTORY;
                // SAFETY: `parent` is live and `component` is NUL-terminated.
                let descriptor =
                    unsafe { libc::openat(parent.as_raw_fd(), component.as_ptr(), flags) };
                if descriptor < 0 {
                    return Err(match std::io::Error::last_os_error().raw_os_error() {
                        Some(libc::ELOOP) => WorkspaceError::UnsafeSymlink,
                        _ => WorkspaceError::Missing,
                    });
                }
                // SAFETY: openat returned a new owned descriptor.
                parent = unsafe { File::from_raw_fd(descriptor) };
            }
        }
        Ok(MutationTarget { parent, name })
    }

    pub fn resolve_for_create(&self, relative: &str) -> Result<ResolvedPath, WorkspaceError> {
        self.ensure_current()?;
        let display = validate_relative(relative)?;
        let joined = self.root.join(&display);
        if std::fs::symlink_metadata(&joined).is_ok() {
            return Err(WorkspaceError::AlreadyExists);
        }
        let parent = joined.parent().ok_or(WorkspaceError::OutsideWorkspace)?;
        let resolved_parent = std::fs::canonicalize(parent).map_err(|_| WorkspaceError::Missing)?;
        self.ensure_contained(&resolved_parent)?;
        let file_name = joined.file_name().ok_or(WorkspaceError::InvalidPath)?;
        Ok(ResolvedPath {
            display,
            absolute: resolved_parent.join(file_name),
        })
    }

    pub fn resolve_constraint(&self, relative: Option<&str>) -> Result<PathBuf, WorkspaceError> {
        self.ensure_current()?;
        match relative {
            None | Some(".") => Ok(self.root.clone()),
            Some(relative) => {
                let resolved = self.resolve_existing(relative)?;
                self.ensure_contained(&resolved.absolute)?;
                Ok(resolved.absolute)
            }
        }
    }

    pub fn relative_display(&self, absolute: &Path) -> Result<String, WorkspaceError> {
        self.ensure_current()?;
        self.ensure_contained(absolute)?;
        let relative = absolute
            .strip_prefix(&self.root)
            .map_err(|_| WorkspaceError::OutsideWorkspace)?;
        relative
            .to_str()
            .map(str::to_owned)
            .ok_or(WorkspaceError::InvalidPath)
    }

    fn ensure_contained(&self, absolute: &Path) -> Result<(), WorkspaceError> {
        if absolute == self.root || absolute.starts_with(&self.root) {
            Ok(())
        } else {
            Err(WorkspaceError::OutsideWorkspace)
        }
    }
}

#[derive(Clone, Debug)]
pub struct ResolvedPath {
    pub display: String,
    pub absolute: PathBuf,
}

#[cfg(unix)]
pub(crate) struct MutationTarget {
    pub parent: File,
    pub name: CString,
}

fn validate_relative(relative: &str) -> Result<String, WorkspaceError> {
    if relative.is_empty() || relative.as_bytes().contains(&0) {
        return Err(WorkspaceError::InvalidPath);
    }
    let path = Path::new(relative);
    if path.is_absolute() {
        return Err(WorkspaceError::OutsideWorkspace);
    }
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) if value != OsStr::new("") => normalized.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(WorkspaceError::OutsideWorkspace);
            }
            Component::Normal(_) => return Err(WorkspaceError::InvalidPath),
        }
    }
    if normalized.as_os_str().is_empty() {
        return Err(WorkspaceError::InvalidPath);
    }
    normalized
        .to_str()
        .map(str::to_owned)
        .ok_or(WorkspaceError::InvalidPath)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum WorkspaceError {
    #[error("workspace is unavailable")]
    Unavailable,
    #[error("path is invalid")]
    InvalidPath,
    #[error("path is outside the workspace")]
    OutsideWorkspace,
    #[error("path crosses a symbolic link")]
    UnsafeSymlink,
    #[error("path does not exist")]
    Missing,
    #[error("path already exists")]
    AlreadyExists,
    #[error("workspace entry limit exceeded")]
    LimitExceeded,
    #[error("workspace path no longer identifies the selected directory")]
    WorkspaceChanged,
}

#[cfg(unix)]
fn directory_identity(directory: &File) -> Result<(u64, u64), WorkspaceError> {
    let metadata = directory
        .metadata()
        .map_err(|_| WorkspaceError::Unavailable)?;
    if !metadata.is_dir() {
        return Err(WorkspaceError::Unavailable);
    }
    Ok((metadata.dev(), metadata.ino()))
}

#[cfg(target_os = "macos")]
fn clear_errno() {
    // SAFETY: __error returns this thread's errno slot.
    unsafe { *libc::__error() = 0 };
}

#[cfg(target_os = "macos")]
fn current_errno() -> i32 {
    // SAFETY: __error returns this thread's errno slot.
    unsafe { *libc::__error() }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn clear_errno() {
    // SAFETY: __errno_location returns this thread's errno slot.
    unsafe { *libc::__errno_location() = 0 };
}

#[cfg(all(unix, not(target_os = "macos")))]
fn current_errno() -> i32 {
    // SAFETY: __errno_location returns this thread's errno slot.
    unsafe { *libc::__errno_location() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_lexical_and_symlink_escapes() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("inside"), "ok").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();

        assert_eq!(
            workspace.resolve_existing("../outside").unwrap_err(),
            WorkspaceError::OutsideWorkspace
        );
        assert_eq!(
            workspace
                .resolve_existing(outside.path().to_str().unwrap())
                .unwrap_err(),
            WorkspaceError::OutsideWorkspace
        );
        #[cfg(unix)]
        assert_eq!(
            workspace.resolve_existing("escape").unwrap_err(),
            WorkspaceError::UnsafeSymlink
        );
        assert_eq!(
            workspace.resolve_existing("inside").unwrap().display,
            "inside"
        );
    }

    #[test]
    fn create_requires_an_existing_contained_parent() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("src")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        assert_eq!(
            workspace.resolve_for_create("src/new.rs").unwrap().display,
            "src/new.rs"
        );
        assert_eq!(
            workspace.resolve_for_create("missing/new.rs").unwrap_err(),
            WorkspaceError::Missing
        );
    }

    #[test]
    fn descriptor_walk_enforces_entry_limit_without_following_symlinks() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("one"), "1").unwrap();
        std::fs::write(root.path().join("two"), "2").unwrap();
        std::fs::write(outside.path().join("secret"), "outside").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), root.path().join("outside-link")).unwrap();
        let workspace = Workspace::open(root.path()).unwrap();
        assert_eq!(
            workspace.enforce_entry_limit(1),
            Err(WorkspaceError::LimitExceeded)
        );
        #[cfg(unix)]
        assert_eq!(workspace.enforce_entry_limit(3).unwrap(), 3);
    }
}
