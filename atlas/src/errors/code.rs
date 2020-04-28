// taken from the fantastic Volta https://github.com/volta-cli/volta/blob/09daab55c821e943f867ad95a560bb2c34c3f1e2/crates/volta-fail/src/lib.rs

use std::convert::{From, Into};
use std::fmt;
use std::process::exit;

use failure::{Backtrace, Fail};
use serde::Serialize;

#[derive(Copy, Clone, Debug, Serialize)]
pub enum ExitCode {
    /// No error occurred.
    Success = 0,

    /// An unknown error occurred.
    UnknownError = 1,

    /// An invalid combination of command-line arguments was supplied.
    InvalidArguments = 3,

    /// No match could be found for the requested version string.
    NoVersionMatch = 4,

    /// A network error occurred.
    NetworkError = 5,

    /// A required environment variable was unset or invalid.
    EnvironmentError = 6,

    /// A file could not be read or written.
    FileSystemError = 7,

    /// Package configuration is missing or incorrect.
    ConfigurationError = 8,

    /// The command or feature is not yet implemented.
    NotYetImplemented = 9,
}

impl ExitCode {
    pub fn exit(self) -> ! {
        exit(self as i32);
    }
}

/// The failure trait for all Apollo errors.
pub trait ApolloFail: Fail {
    /// Returns the process exit code that should be returned if the process exits with this error.
    fn exit_code(&self) -> ExitCode;
}

#[derive(Debug)]
pub struct ApolloError {
    /// The underlying error.
    error: failure::Error,

    /// The result of `error.exit_code()`.
    exit_code: ExitCode,
}

impl Fail for ApolloError {
    fn cause(&self) -> Option<&dyn Fail> {
        Some(self.error.as_fail())
    }

    fn backtrace(&self) -> Option<&Backtrace> {
        Some(self.error.backtrace())
    }
}

impl fmt::Display for ApolloError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.error, f)
    }
}

impl ApolloError {
    /// Returns a reference to the underlying failure of this error.
    pub fn as_fail(&self) -> &dyn Fail {
        self.error.as_fail()
    }

    /// Gets a reference to the `Backtrace` for this error.
    pub fn backtrace(&self) -> &Backtrace {
        self.error.backtrace()
    }

    /// Returns the process exit code that should be returned if the process exits with this error.
    pub fn exit_code(&self) -> ExitCode {
        self.exit_code
    }
}

impl<T: ApolloFail> From<T> for ApolloError {
    fn from(failure: T) -> Self {
        let exit_code = failure.exit_code();
        ApolloError {
            error: failure.into(),
            exit_code,
        }
    }
}

impl<D: ApolloFail> ApolloFail for failure::Context<D> {
    fn exit_code(&self) -> ExitCode {
        self.get_context().exit_code()
    }
}

pub type Fallible<T> = Result<T, ApolloError>;
