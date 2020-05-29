use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Check {}

impl Command for Check {
    fn run(&self, _session: &mut Session) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
