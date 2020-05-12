use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};

#[derive(StructOpt)]
pub struct Push {}

impl Command for Push {
    fn run(&self) -> Fallible<ExitCode> {
        Ok(ExitCode::NotYetImplemented)
    }
}
