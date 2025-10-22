use std::process::Child as StdChild;
use tauri::api::process::CommandChild as TauriChild;

/// An enum to abstract over the two different types of child processes
/// that can be spawned in development vs. release mode.
pub enum ManagedProcess {
    Std(StdChild),
    Tauri(TauriChild),
}

impl ManagedProcess {
    /// Provides a unified way to kill the underlying process, regardless of its type.
    pub fn kill(self) -> std::io::Result<()> {
        match self {
            ManagedProcess::Std(mut child) => child.kill(),
            ManagedProcess::Tauri(child) => child
                .kill()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string())),
        }
    }

    pub fn id(&self) -> u32 {
        match self {
            ManagedProcess::Std(child) => child.id(),
            ManagedProcess::Tauri(child) => child.pid(),
        }
    }
}