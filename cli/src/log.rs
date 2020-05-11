use std::env::VarError;
use std::io;
use std::io::Write;
use std::result::Result;

use env_logger::fmt::{Color, Formatter};
use env_logger::Builder;
use log::LevelFilter::{Debug, Error, Info};
use log::{Level, Record};

pub const APOLLO_LOG_LEVEL: &str = "APOLLO_LOG_LEVEL";

fn custom_formatter(
    should_print_modules: bool,
) -> impl Fn(&mut Formatter, &Record) -> io::Result<()> {
    move |buf: &mut Formatter, record: &Record| {
        let level = record.level();
        let mut style = buf.style();
        let args = record.args();
        let module_path = record.module_path();

        match level {
            Level::Trace => {
                style.set_color(Color::Cyan).set_intense(true);
            },
            Level::Debug => {
                style.set_color(Color::Magenta);
            },
            Level::Warn => {
                style.set_color(Color::Yellow);
            },
            Level::Error => {
                style.set_color(Color::Red).set_bold(true);
            }
            _ => {}
        };

        match level {
            Level::Info => writeln!(buf, "{}", args),
            _ => {
                write!(buf, "[{}", style.value(level.to_level_filter()))?;
                if should_print_modules {
                    write!(buf, " {}", module_path.unwrap())?;
                }
                writeln!(buf, "] {}", style.value(args))
            }
        }
    }
}

pub fn init_logger(verbose: bool, quiet: bool, env_log_level: Result<String, VarError>) {
    // warn if someone is trying to use the flags _and_ env
    if env_log_level.is_ok() && (verbose || quiet) {
        let flag = if verbose { "--verbose" } else { "--quiet" };
        eprintln!(
            "{} and the {} flag is set. The {} flag takes precedence over {}.",
            APOLLO_LOG_LEVEL, flag, flag, APOLLO_LOG_LEVEL
        );
    };

    // if the verbose or quiet flags are passed in, they take precedence over
    // the env variable's log level. If nothing is passed in (no env, no flags)
    // default to `Info` level logging
    if verbose || quiet || env_log_level.is_err() {
        let flag_log_level = match (verbose, quiet) {
            (false, false) => Info, // default
            (false, true) => Error,
            (true, false) => Debug,
            (true, true) => unreachable!("Cannot pass verbose and quiet flags"),
        };
        Builder::new()
            .filter_level(flag_log_level)
            .format(custom_formatter(false))
            .init()
    } else {
        let env_filter = env_logger::Env::default().filter(APOLLO_LOG_LEVEL);
        let log_level_unwrapped = env_log_level.unwrap().to_lowercase();

        // only show module path on verbose and trace levels
        Builder::from_env(env_filter)
            .format(custom_formatter(log_level_unwrapped.contains("trace")))
            .init()
    }
}
