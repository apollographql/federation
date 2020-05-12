use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use structopt::StructOpt;

pub mod pull;
pub mod push;

#[derive(StructOpt)]
pub enum SchemaCommand {
    #[structopt(name = "push")]
    Push(push::Push),

    #[structopt(name = "pull")]
    Pull(pull::Pull),
}

impl SchemaCommand {
    pub fn run(self) -> Fallible<ExitCode> {
        match self {
            SchemaCommand::Push(push) => push.run(),
            SchemaCommand::Pull(pull) => pull.run(),
        }
    }
}
