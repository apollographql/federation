use crate::commands::Command;
use crate::config::CliConfig;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use crate::terminal::{confirm, input};
use log::{info, warn};
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Auth {
    /// Setup your auth stuff
    /// Requires using an User key which can be found here:
    /// https://engine.apollographql.com/user-settings
    Setup(Setup),
}

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Setup {}

impl Command for Setup {
    fn run(&self, _session: &mut Session) -> Fallible<ExitCode> {
        let mut config = CliConfig::load().unwrap();

        if config.api_key.is_some() {
            warn!("Config auth already setup.");

            if !confirm("Proceed?")? {
                return Ok(ExitCode::Success);
            }
        }

        info!("Please input a User key which can be found here: https://engine.apollographql.com/user-settings");
        let key = input("User key:", true)?;

        if key.is_empty() {
            warn!("Did not update the Apollo CLI Config!");
            return Ok(ExitCode::Success);
        }

        config.api_key = Some(key);
        CliConfig::write(&config).unwrap();
        Ok(ExitCode::Success)
    }
}
