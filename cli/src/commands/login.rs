use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;

#[derive(StructOpt)]
pub struct Login {}

impl Command for Login {
    fn run(&self, _session: &mut Session) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
