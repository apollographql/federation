use structopt::StructOpt;

use crate::commands::Command;

#[derive(StructOpt)]
pub struct Login {}

impl Command for Login {
    fn run(self) {
        panic!("Not yet implemented");
    }
}
