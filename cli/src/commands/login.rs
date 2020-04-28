use crate::commands::Command;
use atlas::errors::{ExitCode, Fallible};
use structopt::StructOpt;

#[derive(StructOpt)]
pub struct Login {}

impl Command for Login {
    fn run(self) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
