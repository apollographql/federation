use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Store {}

impl Command for Store {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("schema store");
        Ok(ExitCode::NotYetImplemented)
    }
}
