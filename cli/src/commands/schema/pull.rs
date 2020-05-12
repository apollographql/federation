use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};

#[derive(StructOpt)]
pub struct Pull {}

impl Command for Pull {
    fn run(&self) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
