use structopt::StructOpt;
use crate::commands::Command;
use crate::telemetry::Session;
use crate::errors::{Fallible, ExitCode};

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Get {}

impl Command for Get {
   fn run(&self, _session: &mut Session) -> Fallible<ExitCode> {
       Ok(ExitCode::NotYetImplemented)
   }
}
