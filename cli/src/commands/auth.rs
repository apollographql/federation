use crate::commands::Command;
use crate::config::CliConfig;
use crate::errors::{ExitCode, Fallible};
use crate::style::KEY;
use crate::telemetry::Session;
use crate::terminal::sensitive;
use console::style;
use log::{debug, error, info, warn};
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Auth {
    /// Link the CLI to your Apollo account using your Personal API Key.
    Setup(Setup),
}

#[derive(StructOpt)]
pub struct Setup {}

impl Command for Setup {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("auth setup");

        debug!("Checking is config's api_key is already set...");
        if session.config.api_key.is_some() {
            warn!("Authentication already configured.");
        }

        info!("To link your CLI to your Apollo account go to {} and create a new Personal API Key. Once you've done that, copy the key and paste it into the prompt below.",
            style("https://engine.apollographql.com/user-settings").cyan());
        let key = sensitive("Personal API Key:")?;
        let key = key.trim();

        debug!("Checking user input...");
        if key.is_empty() {
            error!("No key was inputed, quitting without changes.");
            return Ok(ExitCode::ConfigurationError);
        }

        debug!("Setting new key...");
        session.config.api_key = Some(key.to_string());

        debug!("Saving new key...");
        CliConfig::save(&session.config_path, &session.config)?;

        info!("{} Your personal API key was successfuly set!", KEY);
        Ok(ExitCode::Success)
    }
}
