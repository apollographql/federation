#[cfg(backtrace)]
use std::backtrace::Backtrace;
use std::convert::From;

use anyhow::Result;
use log::error;
use thiserror::Error;

use crate::errors::ExitCode;

#[derive(Error, Debug)]
#[error("{msg}")]
pub struct ApolloError {
    msg: String,
    #[cfg(backtrace)]
    backtrace: Backtrace,
    /// The result of `error.exit_code()`.
    exit_code: ExitCode,
}

#[allow(dead_code)]
impl ApolloError {
    /// Returns the process exit code that should be returned if the process exits with this error.
    pub fn exit_code(&self) -> ExitCode {
        self.exit_code
    }
}

/// The failure trait for all Apollo errors.
pub trait ApolloFail: std::error::Error {
    /// Returns the process exit code that should be returned if the process exits with this error.
    fn exit_code(&self) -> ExitCode;
}

impl<T: ApolloFail> From<T> for ApolloError {
    fn from(error: T) -> Self {
        let exit_code = error.exit_code();
        ApolloError {
            msg: error.to_string(),
            exit_code,
        }
    }
}

pub type Fallible<T> = Result<T, ApolloError>;

pub fn report(err: &ApolloError) {
    error!("{}", err.to_string());
}
