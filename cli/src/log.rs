// Taken from the wonderful Volta https://github.com/volta-cli/volta/blob/09daab55c821e943f867ad95a560bb2c34c3f1e2/crates/volta-core/src/log.rs

//! This module provides a custom Logger implementation for use with the `log` crate
use atty::Stream;
use console::style;
use log::{Level, LevelFilter, Log, Metadata, Record, SetLoggerError};
use std::env;
use std::fmt::Display;
use textwrap::{NoHyphenation, Wrapper};

use crate::style::text_width;

const ERROR_PREFIX: &str = "error:";
const WARNING_PREFIX: &str = "warning:";
const APOLLO_LOGLEVEL: &str = "APOLLO_LOGLEVEL";
const ALLOWED_PREFIX: &str = "apollo";
const WRAP_INDENT: &str = "    ";

/// Represents the context from which the logger was created
pub enum LogContext {
    /// Log messages from the CLI executable
    Apollo,
    // Log messages from the Language Server
}

/// Represents the level of verbosity that was requested by the user
pub enum LogVerbosity {
    Quiet,
    Default,
    Verbose,
}

pub struct Logger {
    context: LogContext,
    level: LevelFilter,
}

impl Log for Logger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) && record.target().starts_with(ALLOWED_PREFIX) {
            match record.level() {
                Level::Error => self.log_error(record.args()),
                Level::Warn => self.log_warning(record.args()),
                Level::Debug => eprintln!("[verbose] {}", record.args()),
                // all info-level messages go to stdout
                _ => println!("{}", record.args()),
            }
        }
    }

    fn flush(&self) {}
}

impl Logger {
    /// Initialize the global logger with a Logger instance
    /// Will use the requested level of Verbosity
    /// If set to Default, will use the environment to determine the level of verbosity
    pub fn init(context: LogContext, verbosity: LogVerbosity) -> Result<(), SetLoggerError> {
        let logger = Logger::new(context, verbosity);
        log::set_max_level(logger.level);
        log::set_boxed_logger(Box::new(logger))?;
        Ok(())
    }

    fn new(context: LogContext, verbosity: LogVerbosity) -> Self {
        let level = match verbosity {
            LogVerbosity::Quiet => LevelFilter::Error,
            LogVerbosity::Default => level_from_env(),
            LogVerbosity::Verbose => LevelFilter::Debug,
        };

        Logger { context, level }
    }

    fn log_error<D>(&self, message: &D)
    where
        D: Display,
    {
        let prefix = match &self.context {
            LogContext::Apollo => ERROR_PREFIX,
        };

        eprintln!("{} {}", style(prefix).red().bold(), message);
    }

    fn log_warning<D>(&self, message: &D)
    where
        D: Display,
    {
        let prefix = match &self.context {
            LogContext::Apollo => WARNING_PREFIX,
        };

        eprintln!(
            "{} {}",
            style(prefix).yellow().bold(),
            wrap_content(prefix, message)
        );
    }
}

/// Wraps the supplied content to the terminal width, if we are in a terminal.
/// If not, returns the content as a String
///
/// Note: Uses the supplied prefix to calculate the terminal width, but then removes
/// it so that it can be styled (style characters are counted against the wrapped width)
fn wrap_content<D>(prefix: &str, content: &D) -> String
where
    D: Display,
{
    match text_width() {
        Some(width) => Wrapper::with_splitter(width, NoHyphenation)
            .subsequent_indent(WRAP_INDENT)
            .break_words(false)
            .fill(&format!("{} {}", prefix, content))
            .replace(prefix, ""),
        None => format!(" {}", content),
    }
}

/// Determines the correct logging level based on the environment
/// If APOLLO_LOGLEVEL is set to a valid level, we use that
/// If not, we check the current stdout to determine whether it is a TTY or not
///     If it is a TTY, we use Info
///     If it is NOT a TTY, we use Error as we don't want to show warnings when running as a script
fn level_from_env() -> LevelFilter {
    env::var(APOLLO_LOGLEVEL)
        .ok()
        .and_then(|level| level.to_uppercase().parse().ok())
        .unwrap_or_else(|| {
            if atty::is(Stream::Stdout) {
                LevelFilter::Info
            } else {
                LevelFilter::Error
            }
        })
}
