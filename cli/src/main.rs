mod cli;
mod commands;
mod log;
mod style;

// use std::process::exit;
use structopt::StructOpt;

use crate::log::{LogContext, LogVerbosity, Logger};

fn main() {
    let cli = cli::Apollo::from_args();

    let verbosity = match (&cli.verbose, &cli.quiet) {
        // 0,0
        (false, false) => LogVerbosity::Default,
        // 0,1
        (false, true) => LogVerbosity::Quiet,
        // 1,0
        (true, false) => LogVerbosity::Verbose,
        // 1,1
        (true, true) => unreachable!("Using both --verbose and --quiet is disallowed"),
    };

    Logger::init(LogContext::Apollo, verbosity).expect("Only a single logger should be initialzed");

    cli.run();
}
