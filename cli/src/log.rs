use log::LevelFilter::{Debug, Error, Info};
use std::env::VarError;

pub const APOLLO_LOG_LEVEL: &str = "APOLLO_LOG_LEVEL";

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
        env_logger::builder()
            .filter_level(flag_log_level)
            // only show timestamps on verbose and trace levels
            // only show module path on verbose and trace levels
            .format_timestamp(None)
            .format_module_path(verbose)
            .init()
    } else {
        let env_filter = env_logger::Env::default().filter(APOLLO_LOG_LEVEL);
        let log_level_unwrapped = env_log_level.unwrap().to_lowercase();
        // only show timestamps on verbose and trace levels
        // only show module path on verbose and trace levels
        let print_module_path =
            log_level_unwrapped.contains("debug") || log_level_unwrapped.contains("trace");
        env_logger::Builder::from_env(env_filter)
            .format_timestamp(None)
            .format_module_path(print_module_path)
            .init()
    }
}
