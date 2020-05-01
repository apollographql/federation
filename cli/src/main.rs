mod cli;
mod commands;
mod errors;
mod layout;
mod log;
mod style;

// use std::process::exit;
use structopt::StructOpt;

use crate::errors::{report, ApolloError};
use crate::log::{LogContext, LogVerbosity, Logger};

enum Error {
    Apollo(ApolloError),
    // Tool(i32),
}

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

    let result = cli.run().map_err(Error::Apollo);

    match result {
        Ok(exit_code) => exit_code.exit(),
        // Err(Error::Tool(code)) => exit(code),
        Err(Error::Apollo(err)) => {
            report(&err);
            let code = err.exit_code();
            code.exit();
        }
    }
}
