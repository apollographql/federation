use std::convert::From;
use std::error::Error;
use std::fmt;

use anyhow::Result;
use log::error;

use crate::errors::ErrorDetails;
use crate::errors::ExitCode;

#[derive(Debug)]
pub struct ApolloError {
    inner: Box<Inner>,
}

#[derive(Debug)]
struct Inner {
    kind: ErrorDetails,
    source: Option<Box<dyn Error>>,
}

#[allow(dead_code)]
impl ApolloError {
    /// Returns the process exit code that should be returned if the process exits with this error.
    pub fn exit_code(&self) -> ExitCode {
        self.inner.kind.exit_code()
    }

    pub fn from_source<E>(source: E, kind: ErrorDetails) -> Self
    where
        E: Into<Box<dyn Error>>,
    {
        ApolloError {
            inner: Box::new(Inner {
                kind,
                source: Some(source.into()),
            }),
        }
    }

    pub fn kind(&self) -> &ErrorDetails {
        &self.inner.kind
    }
}

impl fmt::Display for ApolloError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.inner.kind.fmt(f)
    }
}

impl Error for ApolloError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.inner.source.as_ref().map(|b| b.as_ref())
    }
}

impl From<ErrorDetails> for ApolloError {
    fn from(kind: ErrorDetails) -> Self {
        ApolloError {
            inner: Box::new(Inner { kind, source: None }),
        }
    }
}

pub trait Context<T> {
    fn with_context<F>(self, f: F) -> Fallible<T>
    where
        F: FnOnce() -> ErrorDetails;
}

impl<T, E> Context<T> for Result<T, E>
where
    E: Error + 'static,
{
    fn with_context<F>(self, f: F) -> Fallible<T>
    where
        F: FnOnce() -> ErrorDetails,
    {
        self.map_err(|e| ApolloError::from_source(e, f()))
    }
}

pub type Fallible<T> = Result<T, ApolloError>;

const REPORT_BUG_CTA: &str = "Please rerun the command that triggered this error with 
`APOLLO_LOG_LEVEL=debug` and open an issue at
https://github.com/apollographql/apollo-cli/issues with the details!";

pub fn report(err: &ApolloError) {
    error!("{}\n{}", err.to_string(), REPORT_BUG_CTA);
}
