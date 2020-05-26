use crate::commands::Command;
use crate::errors::{Fallible, ExitCode};
use crate::telemetry::Session;
use structopt::StructOpt;
use crate::config::CliConfig;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Auth {
    /// Setup your auth stuff
    Setup(Setup)
}

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Setup {}

impl Command for Setup {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        let mut config = CliConfig::load().unwrap();
        config.api_key = Some(String::from("test"));
        CliConfig::write(&config).unwrap();
        Ok(ExitCode::Success)
    }
}
