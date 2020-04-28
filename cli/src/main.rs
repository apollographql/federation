mod cli;
mod commands;

// use std::process::exit;
use structopt::StructOpt;

use atlas::errors::ApolloError;
use atlas::log::{LogContext, LogVerbosity, Logger};

enum Error {
    Apollo(ApolloError),
    // Tool(i32),
}

fn main() {
    let cli = cli::Apollo::from_args();

    let verbosity = match (&cli.verbose, &cli.quiet) {
        (false, false) => LogVerbosity::Default,
        (true, false) => LogVerbosity::Verbose,
        (false, true) => LogVerbosity::Quiet,
        (true, true) => unreachable!("Using both --verbose and --quiet is disallowed"),
    };

    Logger::init(LogContext::Apollo, verbosity).expect("Only a single logger should be initialzed");

    let result = cli.run().map_err(Error::Apollo);

    match result {
        Ok(exit_code) => exit_code.exit(),
        // Err(Error::Tool(code)) => exit(code),
        Err(Error::Apollo(err)) => {
            let code = err.exit_code();
            code.exit();
        }
    }
}
