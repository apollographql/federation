use thiserror::Error;

use crate::errors::ExitCode;

#[derive(Error, Debug)]
pub enum ErrorDetails {
    #[error(
        "Could not determine home directory.
Please ensure the environment variable 'HOME' is set."
    )]
    NoHomeEnvironmentVar,

    /// Thrown when no shell profiles could be found
    #[cfg(unix)]
    #[error("Could not locate user profile.
Tried $PROFILE ({}), ~/.bashrc, ~/.bash_profile, ~/.zshrc, ~/.profile, and ~/.config/fish/config.fish
Please create one of these and try again; or you can edit your profile manually to add '{}' to your PATH", .env_profile, .bin_dir.display())]
    NoShellProfile {
        env_profile: String,
        bin_dir: std::path::PathBuf,
    },

    /// Thrown when unable to read the user Path environment variable from the registry
    #[cfg(windows)]
    #[error(
        "Could not read user Path environment variable.
Please ensure you have access to the your environment variables."
    )]
    ReadUserPathError,

    /// Thrown when unable to write the user PATH environment variable
    #[cfg(windows)]
    #[error(
        "Could not write Path environment variable.
Please ensure you have permissions to edit your environment variables."
    )]
    WriteUserPathError,

    /// Thrown when trying to work on an unsupported platform
    #[error("Current platform ({}) is not supported", .os)]
    UnsupportedPlatformError { os: String },

    #[error("Unable to fetch release")]
    ReleaseFetchError,

    #[error("Response must either be \"y\" for yes or \"n\" for no")]
    InputConfirmationError,

    #[error("Could not install CLI. {}", .msg)]
    CliInstallError { msg: String },

    #[error("Error loading config file {}: {}", .path, .msg)]
    CliConfigReadError { msg: String, path: String },

    #[error("Error writing config file {}: {}", .path, .msg)]
    CliConfigWriteError { msg: String, path: String },
}

impl ErrorDetails {
    pub fn exit_code(&self) -> ExitCode {
        match self {
            ErrorDetails::NoHomeEnvironmentVar => ExitCode::EnvironmentError,
            #[cfg(unix)]
            ErrorDetails::NoShellProfile { .. } => ExitCode::EnvironmentError,
            #[cfg(windows)]
            ErrorDetails::ReadUserPathError => ExitCode::EnvironmentError,
            #[cfg(windows)]
            ErrorDetails::WriteUserPathError => ExitCode::EnvironmentError,
            ErrorDetails::UnsupportedPlatformError { .. } => ExitCode::EnvironmentError,
            ErrorDetails::ReleaseFetchError => ExitCode::NetworkError,
            ErrorDetails::InputConfirmationError => ExitCode::InvalidArguments,
            ErrorDetails::CliInstallError { .. } => ExitCode::FileSystemError,
            ErrorDetails::CliConfigReadError { .. } => ExitCode::ConfigurationError,
            ErrorDetails::CliConfigWriteError { .. } => ExitCode::ConfigurationError,
        }
    }
}
