use failure::Fail;
use std::fmt;

use crate::errors::{ApolloFail, ExitCode};

#[derive(Debug, Fail)]
pub enum ErrorDetails {
    NoHomeEnvironmentVar,

    /// Thrown when no shell profiles could be found
    #[cfg(unix)]
    NoShellProfile {
        env_profile: String,
        bin_dir: std::path::PathBuf,
    },

    /// Thrown when unable to read the user Path environment variable from the registry
    #[cfg(windows)]
    ReadUserPathError,

    /// Thrown when unable to write the user PATH environment variable
    #[cfg(windows)]
    WriteUserPathError,
}

impl fmt::Display for ErrorDetails {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ErrorDetails::NoHomeEnvironmentVar => write!(
                f,
                "Could not determine home directory.
        Please ensure the environment variable 'HOME' is set."
            ),
            #[cfg(unix)]
            ErrorDetails::NoShellProfile { env_profile, bin_dir } => write!(
                f,
                "Could not locate user profile.
Tried $PROFILE ({}), ~/.bashrc, ~/.bash_profile, ~/.zshrc, ~/.profile, and ~/.config/fish/config.fish
Please create one of these and try again; or you can edit your profile manually to add '{}' to your PATH",
                env_profile, bin_dir.display()
            ),
            #[cfg(windows)]
            ErrorDetails::WriteUserPathError => write!(
                f,
                "Could not write Path environment variable.
Please ensure you have permissions to edit your environment variables."
            ),
            #[cfg(windows)]
            ErrorDetails::ReadUserPathError => write!(
                f,
                "Could not read user Path environment variable.
Please ensure you have access to the your environment variables."
            ),
        }
    }
}

impl ApolloFail for ErrorDetails {
    fn exit_code(&self) -> ExitCode {
        match self {
            ErrorDetails::NoHomeEnvironmentVar => ExitCode::EnvironmentError,
            #[cfg(unix)]
            ErrorDetails::NoShellProfile { .. } => ExitCode::EnvironmentError,
            #[cfg(windows)]
            ErrorDetails::ReadUserPathError => ExitCode::EnvironmentError,
            #[cfg(windows)]
            ErrorDetails::WriteUserPathError => ExitCode::EnvironmentError,

        }
    }
}
