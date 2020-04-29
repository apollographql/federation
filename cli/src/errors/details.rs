use failure::Fail;
use std::fmt;
use std::path::PathBuf;

use crate::errors::{ApolloFail, ExitCode};

#[derive(Debug, Fail)]
pub enum ErrorDetails {
    NoHomeEnvironmentVar,

    /// Thrown when no shell profiles could be found
    NoShellProfile {
        env_profile: String,
        bin_dir: PathBuf,
    },
}

impl fmt::Display for ErrorDetails {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ErrorDetails::NoHomeEnvironmentVar => write!(
                f,
                "Could not determine home directory.
        Please ensure the environment variable 'HOME' is set."
            ),
            ErrorDetails::NoShellProfile { env_profile, bin_dir } => write!(
                f,
                "Could not locate user profile.
Tried $PROFILE ({}), ~/.bashrc, ~/.bash_profile, ~/.zshrc, ~/.profile, and ~/.config/fish/config.fish
Please create one of these and try again; or you can edit your profile manually to add '{}' to your PATH",
                env_profile, bin_dir.display()
            ),
        }
    }
}

impl ApolloFail for ErrorDetails {
    fn exit_code(&self) -> ExitCode {
        match self {
            ErrorDetails::NoHomeEnvironmentVar => ExitCode::EnvironmentError,
            ErrorDetails::NoShellProfile { .. } => ExitCode::EnvironmentError,
        }
    }
}
