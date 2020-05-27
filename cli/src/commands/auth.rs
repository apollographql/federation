use crate::commands::Command;
use crate::config::CliConfig;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use crate::terminal::{confirm, input};
use log::warn;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Auth {
    /// Setup your auth stuff
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

        let key = input("Please paste key:")?;

        if key.is_empty() {
            warn!("Did not update the Apollo CLI Config!");
            return Ok(ExitCode::Success);
        }

        config.api_key = Some(key);
        CliConfig::write(&config).unwrap();
        Ok(ExitCode::Success)
    }
}
