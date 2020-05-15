use std::process::exit;

use serde::Serialize;

#[derive(Copy, Clone, Debug, Serialize)]
#[allow(dead_code)]
pub enum ExitCode {
    /// No error occurred.
    Success = 0,

    /// An unknown error occurred.
    UnknownError = 1,

    /// An invalid combination of command-line arguments was supplied.
    InvalidArguments = 2,

    /// A network error occurred.
    NetworkError = 3,

    /// A required environment variable was unset or invalid.
    EnvironmentError = 4,

    /// A file could not be read or written.
    FileSystemError = 5,

    /// Tooling configuration is missing or incorrect.
    ConfigurationError = 6,

    /// The command or feature is not yet implemented.
    NotYetImplemented = 7,
}

impl ExitCode {
    pub fn exit(self) -> ! {
        exit(self as i32);
    }
}
