mod cli;
mod commands;
mod errors;
mod log;

use crate::log::{init_logger, APOLLO_LOG_LEVEL};
use std::env::var;
use structopt::StructOpt;

use crate::errors::{report, ApolloError};

enum Error {
    Apollo(ApolloError),
    // Tool(i32),
}

enum Error {
    Apollo(ApolloError),
    // Tool(i32),
}

fn main() {
    let cli = cli::Apollo::from_args();

    // get log level env variable and initialize the global logger (env_logger)
    let env_log_level = var(APOLLO_LOG_LEVEL);
    init_logger(cli.verbose, cli.quiet, env_log_level);

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
