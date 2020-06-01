use crate::commands::Command;
use crate::config::CliConfig;
use crate::errors::{ExitCode, Fallible};
use crate::style::KEY;
use crate::telemetry::Session;
use crate::terminal::{confirm, input};
use console::style;
use log::{info, warn};
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Auth {
    /// Setup your auth stuff
    /// Link the CLI to your Apollo account using your Personal API Key.
    Setup(Setup),
}

#[derive(StructOpt)]
pub struct Setup {}

impl Command for Setup {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("auth setup");
        let mut config = CliConfig::load().unwrap();

        if config.api_key.is_some() {
            warn!("Authentication already configured.");

            if !confirm("Proceed?")? {
                return Ok(ExitCode::Success);
            }
        }

        info!("To link your CLI to your Apollo account go to {} and create a new Personal API Key. Once you've done that, copy the key and paste it into the prompt below.",
            style("https://engine.apollographql.com/user-settings").cyan());
        let key = input("User key:", true)?;

        if key.is_empty() {
            warn!("No key was inputed, quitting without changes.");
            return Ok(ExitCode::ConfigurationError);
        }

        config.api_key = Some(key);
        CliConfig::write(&config).unwrap();
        info!("{} Your personal API key was successfuly set!", KEY);
        Ok(ExitCode::Success)
    }
}
