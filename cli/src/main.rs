#[macro_use]
extern crate text_io;

mod cli;
mod client;
mod commands;
mod config;
mod errors;
mod layout;
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

use crate::cli::{Apollo, Subcommand};
use crate::errors::{report, ApolloError, ErrorDetails};
use crate::log::{init_logger, APOLLO_LOG_LEVEL};
use crate::telemetry::Session;
use crate::version::{background_check_for_updates, command_name};

enum Error {
    Apollo(ApolloError),
}

fn main() {
    let cli: Apollo = cli::Apollo::from_args();

    // get log level env variable and initialize the global logger (env_logger)
    let env_log_level = var(APOLLO_LOG_LEVEL);
    init_logger(cli.verbose, cli.quiet, env_log_level);

    setup_panic_hooks();

    let session_result = Session::init()
        .map_err(|e| ApolloError::from(ErrorDetails::CLIConfigError { msg: e.to_string() }));

    if let Err(err) = session_result {
        report(&err);
        let code = err.exit_code();
        code.exit();
    };

    let mut session = session_result.unwrap();

    let should_check_for_updates = if let Some(Subcommand::Update(_)) = cli.command {
        false
    } else {
        true
    };

    let latest_version_receiver = if should_check_for_updates {
        // Check for updates to the CLI in the background
        Some(background_check_for_updates())
    } else {
        None
    };

    // Run the CLI command
    let result = cli.run(&mut session).map_err(Error::Apollo);

    // Send anonymous telemtry if enabled
    let _telemetry_reported = session.report().unwrap_or(false);

    // Check for updates to the CLI and print out a message if an update is ready
    if let Some(Ok(latest_version)) = latest_version_receiver.map(|it| it.try_recv()) {
        ::log::info!(
            "\n > A new version of the Apollo CLI ({}) is available! To update, run `{} update`",
            style(latest_version).green().bold(),
            command_name()
        );
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

    if env::var("RUST_BACKTRACE").is_err() {
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

pub fn domain() -> String {
    env::var("APOLLO_CDN_URL").unwrap_or_else(|_| "https://install.apollographql.com".to_string())
}
