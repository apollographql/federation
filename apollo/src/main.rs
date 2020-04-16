use structopt::StructOpt;

mod commands;
use commands::Command;

mod command_config;
use command_config::Apollo;

fn main() {
    match Apollo::from_args() {
        Apollo::Print(cmd) => cmd.run(),
        Apollo::Login(cmd) => cmd.run(),
    }
}
