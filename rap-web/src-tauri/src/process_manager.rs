use std::process::Child as StdChild;
use std::process::Command;

/// An enum to abstract over the two different types of child processes
/// that can be spawned in development vs. release mode.
pub enum ManagedProcess {
    Std(StdChild),
}

impl ManagedProcess {
    /// Provides a unified way to kill the underlying process, regardless of its type.
    pub fn kill(self) -> std::io::Result<()> {
        match self {
            ManagedProcess::Std(mut child) => {
                #[cfg(target_os = "windows")]
                {
                    let _ = Command::new("taskkill")
                        .arg("/F")
                        .arg("/T")
                        .arg("/PID")
                        .arg(child.id().to_string())
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                        .output();
                }
                
                // We still call the standard kill as a fallback/cleanup mechanism
                // even if taskkill ran. It might return an error if taskkill
                // already finished the job, but that's acceptable.
                let _ = child.kill();
                Ok(())
            }
        }
    }

    pub fn id(&self) -> u32 {
        match self {
            ManagedProcess::Std(child) => child.id(),
        }
    }
}

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
