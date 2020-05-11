use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};

#[derive(StructOpt)]
pub struct Login {}

impl Command for Login {
    fn run(&self) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
