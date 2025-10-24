use std::process::Child as StdChild;

/// An enum to abstract over the two different types of child processes
/// that can be spawned in development vs. release mode.
pub enum ManagedProcess {
    Std(StdChild),
}

impl ManagedProcess {
    /// Provides a unified way to kill the underlying process, regardless of its type.
    pub fn kill(self) -> std::io::Result<()> {
        match self {
            ManagedProcess::Std(mut child) => child.kill(),
        }
    }

    pub fn id(&self) -> u32 {
        match self {
            ManagedProcess::Std(child) => child.id(),
        }
    }
}