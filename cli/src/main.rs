mod cli;
mod commands;
mod log;

use crate::log::{init_logger, APOLLO_LOG_LEVEL};
use std::env::var;
use structopt::StructOpt;

fn main() {
    let cli = cli::Apollo::from_args();

    // get log level env variable and initialize the global logger (env_logger)
    let env_log_level = var(APOLLO_LOG_LEVEL);
    init_logger(cli.verbose, cli.quiet, env_log_level);

    cli.run();
}
