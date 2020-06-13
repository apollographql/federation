use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Check {}

impl Command for Check {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("schema check");
        Ok(ExitCode::NotYetImplemented)
    }
}
