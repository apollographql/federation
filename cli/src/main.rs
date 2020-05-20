#[macro_use]
extern crate text_io;

mod cli;
mod commands;
mod config;
mod errors;
mod filesystem;
mod log;
mod style;
mod telemetry;
mod terminal;
mod version;

use std::env;
use std::env::var;
use std::panic;

use console::style;
use structopt::StructOpt;

use crate::errors::{report, ApolloError};
use crate::log::{init_logger, APOLLO_LOG_LEVEL};
use crate::telemetry::Session;
use crate::version::{background_check_for_updates, command_name};

enum Error {
    Apollo(ApolloError),
}

fn main() {
    let cli = cli::Apollo::from_args();

    // get log level env variable and initialize the global logger (env_logger)
    let env_log_level = var(APOLLO_LOG_LEVEL);
    init_logger(cli.verbose, cli.quiet, env_log_level);

    setup_panic_hooks();

    let mut session = Session::init().unwrap();
    
    #[cfg(not(test))]
    // Check for updates to the CLI in the background
    let latest_version_receiver = background_check_for_updates();

    // Run the CLI command
    let result = cli.run(&mut session).map_err(Error::Apollo);

    // XXX create mock for test so this can still run
    #[cfg(not(test))]
    {
        // Send anonymous telemtry if enabled
        let _telemetry_reported = session.report().unwrap_or(false);
        
        // Check for updates to the CLI and print out a message if an update is ready
        if let Ok(latest_version) = latest_version_receiver.try_recv() {
            let should_log = match env::args().nth(1) {
                Some(cmd) => !cmd.eq("update"),
                _ => false,
            };

            if !should_log {
                return;
            }

            let latest_version = style(latest_version).green().bold();

            ::log::info!(
                "\n > A new version of the Apollo CLI ({}) is available! To update, run `{} update`",
                latest_version,
                command_name()
            );
        }
    }
    

    match result {
        Ok(exit_code) => exit_code.exit(),
        Err(Error::Apollo(err)) => {
            report(&err);
            let code = err.exit_code();
            code.exit();
        }
    }
}

fn setup_panic_hooks() {
    let meta = human_panic::Metadata {
        version: env!("CARGO_PKG_VERSION").into(),
        name: env!("CARGO_PKG_NAME").into(),
        authors: env!("CARGO_PKG_AUTHORS").replace(":", ", ").into(),
        homepage: env!("CARGO_PKG_HOMEPAGE").into(),
    };

    let default_hook = panic::take_hook();

    if let Err(_) = env::var("RUST_BACKTRACE") {
        panic::set_hook(Box::new(move |info: &panic::PanicInfo| {
            // First call the default hook that prints to standard error.
            default_hook(info);

            // Then call human_panic.
            let file_path = human_panic::handle_dump(&meta, info);
            human_panic::print_msg(file_path, &meta)
                .expect("human-panic: printing error message to console failed");
        }));
    }
}
