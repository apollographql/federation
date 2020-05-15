use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;

#[derive(StructOpt)]
pub struct Login {}

impl Command for Login {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("login");
        Ok(ExitCode::NotYetImplemented)
    }
}
